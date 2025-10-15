using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface IAuthenticationService
    {
        Task<ApiResponseDto<AuthenticationResponseDto>> LoginAsync(LoginRequestDto request, string ipAddress, string userAgent);
        Task<ApiResponseDto<UserDto>> RegisterAsync(RegisterRequestDto request);
        Task<ApiResponseDto<AuthenticationResponseDto>> RefreshTokenAsync(string refreshToken, string ipAddress);
        Task<ApiResponseDto> LogoutAsync(string refreshToken, string ipAddress);
        Task<ApiResponseDto> ForgotPasswordAsync(ForgotPasswordRequestDto request);
        Task<ApiResponseDto> ResetPasswordAsync(ResetPasswordRequestDto request);
        Task<ApiResponseDto> VerifyEmailAsync(VerifyEmailRequestDto request);
        Task<ApiResponseDto> RevokeTokenAsync(string token, string ipAddress);
        Task<bool> ValidateSessionAsync(string sessionId, Guid userId);
        Task<User?> GetUserByIdAsync(Guid userId);
    }

    public class AuthenticationService : IAuthenticationService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly IPasswordHashingService _passwordHashingService;
        private readonly IJwtTokenService _jwtTokenService;
        private readonly IEmailService _emailService;

        private readonly ILogger<AuthenticationService> _logger;

        public AuthenticationService(
            TradeFinanceDbContext context,
            IPasswordHashingService passwordHashingService,
            IJwtTokenService jwtTokenService,
            IEmailService emailService,

            ILogger<AuthenticationService> logger)
        {
            _context = context;
            _passwordHashingService = passwordHashingService;
            _jwtTokenService = jwtTokenService;
            _emailService = emailService;

            _logger = logger;
        }

        public async Task<ApiResponseDto<AuthenticationResponseDto>> LoginAsync(LoginRequestDto request, string ipAddress, string userAgent)
        {
            try
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());

                if (user == null)
                {
                    _logger.LogWarning("Login attempt with non-existent email: {Email}", request.Email);
                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Invalid email or password",
                        Errors = ["Invalid credentials"]
                    };
                }

                if (!user.IsActive)
                {
                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Account is deactivated",
                        Errors = ["Account is not active"]
                    };
                }

                if (!_passwordHashingService.VerifyPassword(request.Password, user.Salt, user.PasswordHash))
                {
                    _logger.LogWarning("Failed login attempt for user: {Email}", request.Email);

                    // Log failed login attempt
                    var failedLoginHistory = new LoginHistory
                    {
                        UserId = user.Id,
                        IpAddress = ipAddress,
                        UserAgent = userAgent,
                        IsSuccessful = false,
                        FailureReason = "Invalid password",
                        LoginTime = DateTime.UtcNow,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.LoginHistories.Add(failedLoginHistory);
                    await _context.SaveChangesAsync();

                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Invalid email or password",
                        Errors = ["Invalid credentials"]
                    };
                }

                if (!user.EmailVerified)
                {
                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Please verify your email before logging in",
                        Errors = ["Email not verified"]
                    };
                }

                // Generate tokens
                var accessToken = _jwtTokenService.GenerateAccessToken(user);
                var refreshToken = _jwtTokenService.GenerateRefreshToken();

                // Create refresh token record
                var refreshTokenEntity = new RefreshToken
                {
                    Token = refreshToken,
                    UserId = user.Id,
                    ExpiryDate = DateTime.UtcNow.AddDays(7)
                };

                _context.RefreshTokens.Add(refreshTokenEntity);

                // Create user session
                var sessionToken = _passwordHashingService.GenerateSecureToken(64);
                var userSession = new UserSession
                {
                    UserId = user.Id,
                    SessionToken = sessionToken,
                    ExpiryDate = DateTime.UtcNow.AddDays(request.RememberMe ? 30 : 1),
                    IpAddress = ipAddress,
                    UserAgent = userAgent
                };

                _context.UserSessions.Add(userSession);

                // Update user last login
                user.LastLoginAt = DateTime.UtcNow;
                user.UpdatedAt = DateTime.UtcNow;

                // Log login history
                var loginHistory = new LoginHistory
                {
                    UserId = user.Id,
                    IpAddress = ipAddress,
                    UserAgent = userAgent,
                    IsSuccessful = true,
                    LoginTime = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };
                _context.LoginHistories.Add(loginHistory);

                await _context.SaveChangesAsync();

                _logger.LogInformation("User {Email} logged in successfully", request.Email);

                // Send login notification email
                await SendLoginNotificationAsync(user, ipAddress, userAgent);

                return new ApiResponseDto<AuthenticationResponseDto>
                {
                    Success = true,
                    Message = "Login successful",
                    Data = new AuthenticationResponseDto
                    {
                        AccessToken = accessToken,
                        RefreshToken = refreshToken,
                        SessionId = userSession.Id.ToString(),
                        ExpiresAt = DateTime.UtcNow.AddMinutes(30),
                        User = new UserDto
                        {
                            Id = user.Id,
                            Username = user.Username,
                            Email = user.Email,
                                Role = user.Role,
                                Avatar = user.UserProfile?.Avatar, // include avatar so login response contains avatar
                            FirstName = user.FirstName,
                            LastName = user.LastName,
                            EmailVerified = user.EmailVerified,
                            CreatedAt = user.CreatedAt,
                            LastLoginAt = user.LastLoginAt
                        }
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during login for email: {Email}", request.Email);
                return new ApiResponseDto<AuthenticationResponseDto>
                {
                    Success = false,
                    Message = "An error occurred during login",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto<UserDto>> RegisterAsync(RegisterRequestDto request)
        {
            try
            {
                // Check if user already exists
                var existingUser = await _context.Users
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());

                if (existingUser != null)
                {
                    return new ApiResponseDto<UserDto>
                    {
                        Success = false,
                        Message = "User with this email already exists",
                        Errors = ["Email already registered"]
                    };
                }

                // Create new user
                var salt = _passwordHashingService.GenerateSalt();
                var passwordHash = _passwordHashingService.HashPassword(request.Password, salt);
                var emailVerificationToken = _passwordHashingService.GenerateSecureToken(64);

                var user = new User
                {
                    Id = Guid.NewGuid(),
                    Username = request.Email.Split('@')[0], // Simple username from email
                    Email = request.Email.ToLower(),
                    PasswordHash = passwordHash,
                    Salt = salt,
                    FirstName = request.FirstName,
                    LastName = request.LastName,
                    Role = UserRoles.User,
                    EmailVerificationToken = emailVerificationToken,
                    EmailVerificationTokenExpiry = DateTime.UtcNow.AddHours(24),
                    CreatedAt = DateTime.UtcNow
                };

                _context.Users.Add(user);
                await _context.SaveChangesAsync();

                // Send verification email
                var emailSent = await _emailService.SendEmailVerificationAsync(
                    user.Email, 
                    emailVerificationToken, 
                    user.FirstName ?? "");

                if (!emailSent)
                {
                    _logger.LogWarning("Failed to send verification email to {Email}", user.Email);
                }

                _logger.LogInformation("User registered successfully: {Email}", request.Email);

                return new ApiResponseDto<UserDto>
                {
                    Success = true,
                    Message = "Registration successful. Please check your email to verify your account.",
                    Data = new UserDto
                    {
                        Id = user.Id,
                        Email = user.Email,
                        Role = user.Role,
                        FirstName = user.FirstName,
                        LastName = user.LastName,
                        EmailVerified = user.EmailVerified,
                        CreatedAt = user.CreatedAt
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during registration for email: {Email}", request.Email);
                return new ApiResponseDto<UserDto>
                {
                    Success = false,
                    Message = "An error occurred during registration",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto<AuthenticationResponseDto>> RefreshTokenAsync(string refreshToken, string ipAddress)
        {
            try
            {
                var tokenEntity = await _context.RefreshTokens
                    .Include(rt => rt.User)
                    .FirstOrDefaultAsync(rt => rt.Token == refreshToken);

                if (tokenEntity == null || tokenEntity.RevokedAt != null || tokenEntity.ExpiryDate <= DateTime.UtcNow)
                {
                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Invalid refresh token",
                        Errors = ["Token not found or expired"]
                    };
                }

                var user = tokenEntity.User;
                if (!user.IsActive)
                {
                    return new ApiResponseDto<AuthenticationResponseDto>
                    {
                        Success = false,
                        Message = "Account is deactivated",
                        Errors = ["Account not active"]
                    };
                }

                // Generate new tokens
                var newAccessToken = _jwtTokenService.GenerateAccessToken(user);
                var newRefreshToken = _jwtTokenService.GenerateRefreshToken();

                // Revoke old refresh token
                tokenEntity.RevokedAt = DateTime.UtcNow;
                tokenEntity.ReplacedByToken = newRefreshToken;
                tokenEntity.ReasonRevoked = "Replaced by new token";

                // Create new refresh token
                var newRefreshTokenEntity = new RefreshToken
                {
                    Token = newRefreshToken,
                    UserId = user.Id,
                    ExpiryDate = DateTime.UtcNow.AddDays(7)
                };

                _context.RefreshTokens.Add(newRefreshTokenEntity);
                await _context.SaveChangesAsync();

                return new ApiResponseDto<AuthenticationResponseDto>
                {
                    Success = true,
                    Message = "Token refreshed successfully",
                    Data = new AuthenticationResponseDto
                    {
                        AccessToken = newAccessToken,
                        RefreshToken = newRefreshToken,
                        ExpiresAt = DateTime.UtcNow.AddMinutes(30),
                        User = new UserDto
                        {
                            Id = user.Id,
                            Username = user.Username,
                            Email = user.Email,
                            Role = user.Role,
                            FirstName = user.FirstName,
                            LastName = user.LastName,
                            Avatar = user.UserProfile?.Avatar, // Add this line
                            EmailVerified = user.EmailVerified,
                            CreatedAt = user.CreatedAt,
                            LastLoginAt = user.LastLoginAt
                        }
                    }
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during token refresh");
                return new ApiResponseDto<AuthenticationResponseDto>
                {
                    Success = false,
                    Message = "An error occurred during token refresh",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto> LogoutAsync(string refreshToken, string ipAddress)
        {
            try
            {
                var tokenEntity = await _context.RefreshTokens
                    .FirstOrDefaultAsync(rt => rt.Token == refreshToken);

                if (tokenEntity != null && tokenEntity.RevokedAt == null && tokenEntity.ExpiryDate > DateTime.UtcNow)
                {
                    tokenEntity.RevokedAt = DateTime.UtcNow;
                    tokenEntity.ReasonRevoked = "Logout";

                    // Also revoke user sessions
                    var userSessions = await _context.UserSessions
                        .Where(us => us.UserId == tokenEntity.UserId && us.IsActive)
                        .ToListAsync();

                    foreach (var session in userSessions)
                    {
                        session.IsActive = false;
                        session.RevokedAt = DateTime.UtcNow;
                        session.RevokedReason = "Logout";
                    }

                    await _context.SaveChangesAsync();
                }

                return new ApiResponseDto
                {
                    Success = true,
                    Message = "Logout successful"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during logout");
                return new ApiResponseDto
                {
                    Success = false,
                    Message = "An error occurred during logout",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto> ForgotPasswordAsync(ForgotPasswordRequestDto request)
        {
            try
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower());

                if (user == null)
                {
                    return new ApiResponseDto
                    {
                        Success = false,
                        Message = "Email không tồn tại trong hệ thống",
                        Errors = ["Email not found"]
                    };
                }

                // Generate reset token
                var resetToken = _passwordHashingService.GenerateSecureToken(64);

                // Store current password as temp (for auto-revert if not used)
                user.TempPasswordHash = user.PasswordHash;
                user.PasswordResetToken = resetToken;
                user.PasswordResetTokenExpiry = DateTime.UtcNow.AddMinutes(5); // 5-minute expiration
                user.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Send reset email
                var emailSent = await _emailService.SendPasswordResetAsync(
                    user.Email,
                    resetToken,
                    user.FirstName ?? "");

                if (!emailSent)
                {
                    _logger.LogWarning("Failed to send password reset email to {Email}", user.Email);
                }

                return new ApiResponseDto
                {
                    Success = true,
                    Message = "Link đặt lại mật khẩu đã được gửi đến email của bạn"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during forgot password for email: {Email}", request.Email);
                return new ApiResponseDto
                {
                    Success = false,
                    Message = "An error occurred while processing your request",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto> ResetPasswordAsync(ResetPasswordRequestDto request)
        {
            try
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.PasswordResetToken == request.Token);

                if (user == null ||
                    user.PasswordResetTokenExpiry == null ||
                    user.PasswordResetTokenExpiry < DateTime.UtcNow)
                {
                    return new ApiResponseDto
                    {
                        Success = false,
                        Message = "Invalid or expired reset token",
                        Errors = ["Token is invalid or has expired"]
                    };
                }

                // Hash new password
                var salt = _passwordHashingService.GenerateSalt();
                var newPasswordHash = _passwordHashingService.HashPassword(request.NewPassword, salt);

                // Update password
                user.PasswordHash = newPasswordHash;
                user.Salt = salt;
                user.PasswordResetToken = null;
                user.PasswordResetTokenExpiry = null;
                user.TempPasswordHash = null; // Clear temp password
                user.UpdatedAt = DateTime.UtcNow;

                // Revoke all existing refresh tokens for security
                var refreshTokens = await _context.RefreshTokens
                    .Where(rt => rt.UserId == user.Id && rt.RevokedAt == null && rt.ExpiryDate > DateTime.UtcNow)
                    .ToListAsync();

                foreach (var token in refreshTokens)
                {
                    token.RevokedAt = DateTime.UtcNow;
                    token.ReasonRevoked = "Password reset";
                }

                // Revoke all user sessions
                var userSessions = await _context.UserSessions
                    .Where(us => us.UserId == user.Id && us.IsActive)
                    .ToListAsync();

                foreach (var session in userSessions)
                {
                    session.IsActive = false;
                    session.RevokedAt = DateTime.UtcNow;
                    session.RevokedReason = "Password reset";
                }

                await _context.SaveChangesAsync();

                _logger.LogInformation("Password reset successful for user: {Email}", user.Email);

                return new ApiResponseDto
                {
                    Success = true,
                    Message = "Password has been reset successfully. Please log in with your new password."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during password reset");
                return new ApiResponseDto
                {
                    Success = false,
                    Message = "An error occurred while resetting your password",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto> VerifyEmailAsync(VerifyEmailRequestDto request)
        {
            try
            {
                var user = await _context.Users
                    .FirstOrDefaultAsync(u => u.Email.ToLower() == request.Email.ToLower() &&
                                            u.EmailVerificationToken == request.Token);

                if (user == null)
                {
                    return new ApiResponseDto
                    {
                        Success = false,
                        Message = "Invalid verification token",
                        Errors = ["Token is invalid"]
                    };
                }

                if (user.EmailVerificationTokenExpiry == null ||
                    user.EmailVerificationTokenExpiry < DateTime.UtcNow)
                {
                    return new ApiResponseDto
                    {
                        Success = false,
                        Message = "Verification token has expired",
                        Errors = ["Token has expired"]
                    };
                }

                if (user.EmailVerified)
                {
                    return new ApiResponseDto
                    {
                        Success = true,
                        Message = "Email is already verified"
                    };
                }

                // Verify email
                user.EmailVerified = true;
                user.EmailVerifiedAt = DateTime.UtcNow;
                user.EmailVerificationToken = null;
                user.EmailVerificationTokenExpiry = null;
                user.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Send welcome email
                var emailSent = await _emailService.SendWelcomeEmailAsync(
                    user.Email,
                    user.FirstName ?? "");

                if (!emailSent)
                {
                    _logger.LogWarning("Failed to send welcome email to {Email}", user.Email);
                }

                _logger.LogInformation("Email verified successfully for user: {Email}", user.Email);

                return new ApiResponseDto
                {
                    Success = true,
                    Message = "Email verified successfully! You can now log in to your account."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during email verification");
                return new ApiResponseDto
                {
                    Success = false,
                    Message = "An error occurred while verifying your email",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<ApiResponseDto> RevokeTokenAsync(string token, string ipAddress)
        {
            try
            {
                var refreshToken = await _context.RefreshTokens
                    .FirstOrDefaultAsync(rt => rt.Token == token);

                if (refreshToken == null || refreshToken.RevokedAt != null || refreshToken.ExpiryDate <= DateTime.UtcNow)
                {
                    return new ApiResponseDto
                    {
                        Success = false,
                        Message = "Token not found or already revoked",
                        Errors = ["Invalid token"]
                    };
                }

                refreshToken.RevokedAt = DateTime.UtcNow;
                refreshToken.ReasonRevoked = "Manually revoked";

                await _context.SaveChangesAsync();

                return new ApiResponseDto
                {
                    Success = true,
                    Message = "Token revoked successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error revoking token");
                return new ApiResponseDto
                {
                    Success = false,
                    Message = "An error occurred while revoking the token",
                    Errors = ["Internal server error"]
                };
            }
        }

        public async Task<bool> ValidateSessionAsync(string sessionId, Guid userId)
        {
            try
            {
                if (!Guid.TryParse(sessionId, out var sessionGuid))
                    return false;

                var session = await _context.UserSessions
                    .FirstOrDefaultAsync(s => s.Id == sessionGuid && s.UserId == userId);

                if (session == null || !session.IsValid)
                    return false;

                // Update last accessed time
                session.LastAccessedAt = DateTime.UtcNow;
                await _context.SaveChangesAsync();

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating session");
                return false;
            }
        }

        public async Task<User?> GetUserByIdAsync(Guid userId)
        {
            try
            {
                return await _context.Users
                    .FirstOrDefaultAsync(u => u.Id == userId && u.IsActive);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user by ID: {UserId}", userId);
                return null;
            }
        }

        private async Task SendLoginNotificationAsync(User user, string ipAddress, string userAgent)
        {
            try
            {
                _logger.LogInformation("🔍 Checking login notification settings for user {Email} (ID: {UserId})", user.Email, user.Id);

                // Check if user has login notifications enabled
                var userSettings = await _context.UserSettings
                    .FirstOrDefaultAsync(s => s.UserId == user.Id);

                _logger.LogInformation("📊 UserSettings found: {SettingsExists}, LoginNotificationEnabled: {LoginEnabled}",
                    userSettings != null, userSettings?.LoginNotificationEnabled ?? false);

                // If user settings don't exist or login notifications are disabled, skip sending email
                if (userSettings == null || !userSettings.LoginNotificationEnabled)
                {
                    _logger.LogInformation("❌ Login notification SKIPPED for user {Email} - Settings exist: {SettingsExist}, Enabled: {Enabled}",
                        user.Email, userSettings != null, userSettings?.LoginNotificationEnabled ?? false);
                    return;
                }

                _logger.LogInformation("✅ Login notification WILL BE SENT for user {Email}", user.Email);

                // Parse user agent to get device info
                var deviceInfo = ParseUserAgent(userAgent);
                var location = await GetLocationFromIP(ipAddress);

                var subject = "🔐 Cảnh báo đăng nhập mới";
                var body = $@"
                    <h2>Đăng nhập mới được phát hiện</h2>
                    <p>Xin chào {user.FirstName} {user.LastName},</p>
                    <p>Chúng tôi phát hiện một đăng nhập mới vào tài khoản của bạn:</p>

                    <div style='background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                        <p><strong>🕒 Thời gian:</strong> {DateTime.UtcNow.AddHours(7):dd/MM/yyyy HH:mm:ss} (GMT+7)</p>
                        <p><strong>🌐 Địa chỉ IP:</strong> {ipAddress}</p>
                        <p><strong>📍 Khu vực:</strong> {location}</p>
                        <p><strong>💻 Thiết bị:</strong> {deviceInfo}</p>
                    </div>

                    <p>Nếu đây không phải là bạn, vui lòng:</p>
                    <ul>
                        <li>Đổi mật khẩu ngay lập tức</li>
                        <li>Kiểm tra các hoạt động bất thường trong tài khoản</li>
                        <li>Liên hệ với chúng tôi nếu cần hỗ trợ</li>
                    </ul>

                    <p>Trân trọng,<br>Đội ngũ DATK</p>
                ";

                await _emailService.SendEmailAsync(user.Email, subject, body);
                _logger.LogInformation("Login notification email sent to {Email}", user.Email);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send login notification email to {Email}", user.Email);
            }
        }

        private string ParseUserAgent(string userAgent)
        {
            if (string.IsNullOrEmpty(userAgent)) return "Không xác định";

            // Simple user agent parsing
            if (userAgent.Contains("Windows")) return "Windows PC";
            if (userAgent.Contains("Mac")) return "Mac";
            if (userAgent.Contains("iPhone")) return "iPhone";
            if (userAgent.Contains("Android")) return "Android";
            if (userAgent.Contains("iPad")) return "iPad";
            if (userAgent.Contains("Linux")) return "Linux";

            return "Thiết bị không xác định";
        }

        private Task<string> GetLocationFromIP(string ipAddress)
        {
            try
            {
                // For localhost/development
                if (ipAddress == "::1" || ipAddress == "127.0.0.1" || ipAddress.StartsWith("192.168"))
                {
                    return Task.FromResult("Mạng nội bộ (Development)");
                }

                // In production, you can integrate with IP geolocation services
                // For now, return a placeholder
                return Task.FromResult("Việt Nam (ước tính)");
            }
            catch
            {
                return Task.FromResult("Không xác định");
            }
        }


    }
}
