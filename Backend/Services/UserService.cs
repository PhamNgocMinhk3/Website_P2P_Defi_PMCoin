using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.DTOs;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;
using System.Security.Cryptography;
using System.Text;
using OfficeOpenXml;
using TradeFinanceBackend.Application.Services;

namespace TradeFinanceBackend.Services
{
    public class UserService : IUserService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ICloudinaryService _cloudinaryService;
        private readonly IEmailService _emailService;
        private readonly IPasswordHashingService _passwordHashingService;
        private readonly ILogger<UserService> _logger;

        public UserService(
            TradeFinanceDbContext context,
            ICloudinaryService cloudinaryService,
            IEmailService emailService,
            IPasswordHashingService passwordHashingService,
            ILogger<UserService> logger)
        {
            _context = context;
            _cloudinaryService = cloudinaryService;
            _emailService = emailService;
            _passwordHashingService = passwordHashingService;
            _logger = logger;
        }

        public async Task<ApiResponseDto<List<UserSearchResultDto>>> SearchUsersAsync(string searchTerm, Guid currentUserId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(searchTerm))
                {
                    return new ApiResponseDto<List<UserSearchResultDto>>
                    {
                        Success = true,
                        Data = new List<UserSearchResultDto>()
                    };
                }

                var lowerSearchTerm = searchTerm.ToLower();

                var users = await _context.Users
                    .Include(u => u.UserProfile)
                    .Where(u => u.Id != currentUserId && // Không tìm chính mình
                                (EF.Functions.ILike(u.Username, $"%{lowerSearchTerm}%") ||
                                 EF.Functions.ILike(u.Email, $"%{lowerSearchTerm}%") ||
                                 (u.FirstName != null && EF.Functions.ILike(u.FirstName, $"%{lowerSearchTerm}%")) ||
                                 (u.LastName != null && EF.Functions.ILike(u.LastName, $"%{lowerSearchTerm}%")) ||
                                 (u.UserProfile != null && u.UserProfile.WalletCode != null && EF.Functions.ILike(u.UserProfile.WalletCode, $"%{lowerSearchTerm}%"))))
                    .OrderBy(u => u.Username) // Sắp xếp để đảm bảo kết quả nhất quán
                    .Take(10) // Giới hạn 10 kết quả
                    .Select(u => new UserSearchResultDto
                    {
                        Id = u.Id,
                        Username = u.Username,
                        FirstName = u.FirstName,
                        LastName = u.LastName,
                        Avatar = u.UserProfile != null ? u.UserProfile.Avatar : null,
                        IsOnline = u.IsOnline
                    })
                    .ToListAsync();

                return new ApiResponseDto<List<UserSearchResultDto>>
                {
                    Success = true,
                    Data = users,
                    Message = "Users found successfully."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error searching for users with term '{SearchTerm}'", searchTerm);
                return new ApiResponseDto<List<UserSearchResultDto>> { Success = false, Message = "An error occurred while searching for users.", Errors = [ex.Message] };
            }
        }

        public async Task UpdateUserOnlineStatus(Guid userId, bool isOnline, DateTime? lastSeen = null)
        {
            var user = await _context.Users.FindAsync(userId);
            if (user != null)
            {
                user.IsOnline = isOnline;
                user.LastSeen = lastSeen;
                await _context.SaveChangesAsync();
            }
        }

        // Existing methods from UserProfileService.cs
        public async Task<ApiResponseDto<UserProfileDto>> GetProfileAsync(Guid userId)
        {
            try
            {
                var user = await _context.Users
                    .Include(u => u.UserProfile)
                    .FirstOrDefaultAsync(u => u.Id == userId);

                if (user == null)
                {
                    return new ApiResponseDto<UserProfileDto>
                    {
                        Success = false,
                        Message = "User not found",
                        Errors = ["User not found"]
                    };
                }

                var profileDto = new UserProfileDto
                {
                    Username = user.Email.Split('@')[0],
                    Email = user.Email,
                    Role = user.Role,
                    FirstName = user.FirstName ?? string.Empty,
                    LastName = user.LastName ?? string.Empty,
                    PhoneNumber = user.UserProfile?.PhoneNumber,
                    WalletCode = user.UserProfile?.WalletCode,
                    Avatar = user.UserProfile?.Avatar,
                    Bio = user.UserProfile?.Bio,
                    CreatedAt = user.CreatedAt,
                    UpdatedAt = user.UpdatedAt
                };

                return new ApiResponseDto<UserProfileDto>
                {
                    Success = true,
                    Data = profileDto,
                    Message = "Profile retrieved successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user profile for user {UserId}", userId);
                return new ApiResponseDto<UserProfileDto>
                {
                    Success = false,
                    Message = "An error occurred while retrieving profile",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<UserProfileDto>> UpdateProfileAsync(Guid userId, UpdateUserProfileDto updateDto)
        {
            try
            {
                var user = await _context.Users
                    .Include(u => u.UserProfile)
                    .FirstOrDefaultAsync(u => u.Id == userId);

                if (user == null)
                {
                    return new ApiResponseDto<UserProfileDto>
                    {
                        Success = false,
                        Message = "User not found",
                        Errors = ["User not found"]
                    };
                }

                // FirstName and LastName are readonly - don't update them
                // user.FirstName = updateDto.FirstName;
                // user.LastName = updateDto.LastName;
                user.UpdatedAt = DateTime.UtcNow;

                if (user.UserProfile == null)
                {
                    user.UserProfile = new UserProfile
                    {
                        UserId = userId,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.UserProfiles.Add(user.UserProfile);
                }

                user.UserProfile.PhoneNumber = updateDto.PhoneNumber;
                user.UserProfile.WalletCode = updateDto.WalletCode;
                user.UserProfile.Bio = updateDto.Bio;
                user.UserProfile.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return await GetProfileAsync(userId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user profile for user {UserId}", userId);
                return new ApiResponseDto<UserProfileDto>
                {
                    Success = false,
                    Message = "An error occurred while updating profile",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<string>> UploadAvatarAsync(Guid userId, IFormFile file)
        {
            try
            {
                var user = await _context.Users
                    .Include(u => u.UserProfile)
                    .FirstOrDefaultAsync(u => u.Id == userId);

                if (user == null)
                {
                    return new ApiResponseDto<string>
                    {
                        Success = false,
                        Message = "User not found",
                        Errors = ["User not found"]
                    };
                }

                var avatarUrl = await _cloudinaryService.UploadImageAsync(file, "avatars");

                if (user.UserProfile == null)
                {
                    user.UserProfile = new UserProfile
                    {
                        UserId = userId,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.UserProfiles.Add(user.UserProfile);
                }

                user.UserProfile.Avatar = avatarUrl;
                user.UserProfile.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return new ApiResponseDto<string>
                {
                    Success = true,
                    Data = avatarUrl,
                    Message = "Avatar uploaded successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error uploading avatar for user {UserId}", userId);
                return new ApiResponseDto<string>
                {
                    Success = false,
                    Message = "An error occurred while uploading avatar",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<UserSettingsDto>> GetSettingsAsync(Guid userId)
        {
            try
            {
                var settings = await _context.UserSettings
                    .FirstOrDefaultAsync(s => s.UserId == userId);

                if (settings == null)
                {
                    settings = new UserSettings
                    {
                        UserId = userId,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.UserSettings.Add(settings);
                    await _context.SaveChangesAsync();
                }

                var settingsDto = new UserSettingsDto
                {
                    TwoFactorEnabled = settings.TwoFactorEnabled,
                    LoginNotificationEnabled = settings.LoginNotificationEnabled,
                    PasswordChangeNotificationEnabled = settings.PasswordChangeNotificationEnabled,
                    EmailNotificationEnabled = settings.EmailNotificationEnabled,
                    PushNotificationEnabled = settings.PushNotificationEnabled,
                    SmsNotificationEnabled = settings.SmsNotificationEnabled,
                    MarketingEmailEnabled = settings.MarketingEmailEnabled,
                    ProfileVisibilityPublic = settings.ProfileVisibilityPublic,
                    ShowOnlineStatus = settings.ShowOnlineStatus,
                    AllowDirectMessages = settings.AllowDirectMessages
                };

                return new ApiResponseDto<UserSettingsDto>
                {
                    Success = true,
                    Data = settingsDto,
                    Message = "Settings retrieved successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user settings for user {UserId}", userId);
                return new ApiResponseDto<UserSettingsDto>
                {
                    Success = false,
                    Message = "An error occurred while retrieving settings",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<UserSettingsDto>> UpdateSettingsAsync(Guid userId, UserSettingsDto settingsDto)
        {
            try
            {
                var settings = await _context.UserSettings
                    .FirstOrDefaultAsync(s => s.UserId == userId);

                if (settings == null)
                {
                    settings = new UserSettings
                    {
                        UserId = userId,
                        CreatedAt = DateTime.UtcNow
                    };
                    _context.UserSettings.Add(settings);
                }

                settings.TwoFactorEnabled = settingsDto.TwoFactorEnabled;
                settings.LoginNotificationEnabled = settingsDto.LoginNotificationEnabled;
                settings.PasswordChangeNotificationEnabled = settingsDto.PasswordChangeNotificationEnabled;
                settings.EmailNotificationEnabled = settingsDto.EmailNotificationEnabled;
                settings.PushNotificationEnabled = settingsDto.PushNotificationEnabled;
                settings.SmsNotificationEnabled = settingsDto.SmsNotificationEnabled;
                settings.MarketingEmailEnabled = settingsDto.MarketingEmailEnabled;
                settings.ProfileVisibilityPublic = settingsDto.ProfileVisibilityPublic;
                settings.ShowOnlineStatus = settingsDto.ShowOnlineStatus;
                settings.AllowDirectMessages = settingsDto.AllowDirectMessages;
                settings.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                return new ApiResponseDto<UserSettingsDto>
                {
                    Success = true,
                    Data = settingsDto,
                    Message = "Settings updated successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating user settings for user {UserId}", userId);
                return new ApiResponseDto<UserSettingsDto>
                {
                    Success = false,
                    Message = "An error occurred while updating settings",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<bool>> ChangePasswordAsync(Guid userId, ChangePasswordDto changePasswordDto, string ipAddress)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return new ApiResponseDto<bool>
                    {
                        Success = false,
                        Message = "User not found",
                        Errors = ["User not found"]
                    };
                }

                if (!_passwordHashingService.VerifyPassword(changePasswordDto.CurrentPassword, user.Salt, user.PasswordHash))
                {
                    return new ApiResponseDto<bool>
                    {
                        Success = false,
                        Message = "Current password is incorrect",
                        Errors = ["Current password is incorrect"]
                    };
                }

                var newSalt = _passwordHashingService.GenerateSalt();
                var newPasswordHash = _passwordHashingService.HashPassword(changePasswordDto.NewPassword, newSalt);

                user.PasswordHash = newPasswordHash;
                user.Salt = newSalt;
                user.UpdatedAt = DateTime.UtcNow;

                await _context.SaveChangesAsync();

                // Send password change notification email
                await SendPasswordChangeNotificationAsync(user, ipAddress);

                return new ApiResponseDto<bool>
                {
                    Success = true,
                    Data = true,
                    Message = "Password changed successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error changing password for user {UserId}", userId);
                return new ApiResponseDto<bool>
                {
                    Success = false,
                    Message = "An error occurred while changing password",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<ApiResponseDto<byte[]>> ExportSettingsAsync(Guid userId)
        {
            try
            {
                var profile = await GetProfileAsync(userId);
                var settings = await GetSettingsAsync(userId);

                if (!profile.Success || profile.Data == null || !settings.Success || settings.Data == null)
                {
                    return new ApiResponseDto<byte[]>
                    {
                        Success = false,
                        Message = "Không thể lấy dữ liệu người dùng để xuất file."
                    };
                }

                // Tạo một đối tượng chứa tất cả các cài đặt có thể chỉnh sửa
                var exportData = new ImportSettingsDto
                {
                    // Profile fields
                    PhoneNumber = profile.Data.PhoneNumber,
                    WalletCode = profile.Data.WalletCode,
                    Bio = profile.Data.Bio,
                    // Settings fields
                    TwoFactorEnabled = settings.Data.TwoFactorEnabled,
                    LoginNotificationEnabled = settings.Data.LoginNotificationEnabled,
                    PasswordChangeNotificationEnabled = settings.Data.PasswordChangeNotificationEnabled,
                    EmailNotificationEnabled = settings.Data.EmailNotificationEnabled,
                    PushNotificationEnabled = settings.Data.PushNotificationEnabled,
                    SmsNotificationEnabled = settings.Data.SmsNotificationEnabled,
                    MarketingEmailEnabled = settings.Data.MarketingEmailEnabled,
                    ProfileVisibilityPublic = settings.Data.ProfileVisibilityPublic,
                    ShowOnlineStatus = settings.Data.ShowOnlineStatus,
                    AllowDirectMessages = settings.Data.AllowDirectMessages
                };

                var json = System.Text.Json.JsonSerializer.Serialize(exportData, new System.Text.Json.JsonSerializerOptions { WriteIndented = true });
                var bytes = Encoding.UTF8.GetBytes(json);

                return new ApiResponseDto<byte[]>
                {
                    Success = true,
                    Data = bytes,
                    Message = "Cài đặt đã được xuất thành công."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error exporting settings for user {UserId}", userId);
                return new ApiResponseDto<byte[]>
                {
                    Success = false,
                    Message = "An error occurred while exporting settings",
                    Errors = [ex.Message]
                };
            }
        }
        
        public async Task<ApiResponseDto<bool>> ImportSettingsAsync(Guid userId, ImportSettingsDto importDto)
        {
            try
            {
                var settingsDto = new UserSettingsDto 
                {
                    TwoFactorEnabled = importDto.TwoFactorEnabled,
                    LoginNotificationEnabled = importDto.LoginNotificationEnabled,
                    PasswordChangeNotificationEnabled = importDto.PasswordChangeNotificationEnabled,
                    EmailNotificationEnabled = importDto.EmailNotificationEnabled,
                    PushNotificationEnabled = importDto.PushNotificationEnabled,
                    SmsNotificationEnabled = importDto.SmsNotificationEnabled,
                    MarketingEmailEnabled = importDto.MarketingEmailEnabled,
                    ProfileVisibilityPublic = importDto.ProfileVisibilityPublic,
                    ShowOnlineStatus = importDto.ShowOnlineStatus,
                    AllowDirectMessages = importDto.AllowDirectMessages
                };

                var settingsResult = await UpdateSettingsAsync(userId, settingsDto);
                if (!settingsResult.Success)
                {
                    return new ApiResponseDto<bool>
                    {
                        Success = false,
                        Message = "Error updating settings",
                        Errors = settingsResult.Errors
                    };
                }

                // Cập nhật các trường profile có thể chỉnh sửa
                var profileUpdateDto = new UpdateUserProfileDto
                {
                    PhoneNumber = importDto.PhoneNumber,
                    WalletCode = importDto.WalletCode, // FIX: Lấy đúng dữ liệu từ WalletCode
                    Bio = importDto.Bio // FIX: Lấy đúng dữ liệu từ Bio
                };

                await UpdateProfileAsync(userId, profileUpdateDto);

                return new ApiResponseDto<bool>
                {
                    Success = true,
                    Data = true,
                    Message = "Settings imported successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error importing settings for user {UserId}", userId);
                return new ApiResponseDto<bool>
                {
                    Success = false,
                    Message = "An error occurred while importing settings",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<TradeFinanceBackend.Models.DTOs.ApiResponseDto<List<LoginHistoryDto>>> GetLoginHistoryAsync(Guid userId, int page = 1, int pageSize = 20)
        {
            try
            {
                var loginHistories = await _context.LoginHistories
                    .Where(lh => lh.UserId == userId)
                    .OrderByDescending(lh => lh.LoginTime)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(lh => new LoginHistoryDto
                    {
                        IpAddress = lh.IpAddress,
                        UserAgent = lh.UserAgent,
                        Location = lh.Location,
                        Device = lh.Device,
                        IsSuccessful = lh.IsSuccessful,
                        FailureReason = lh.FailureReason,
                        LoginTime = lh.LoginTime
                    })
                    .ToListAsync();

                return new TradeFinanceBackend.Models.DTOs.ApiResponseDto<List<LoginHistoryDto>>
                {
                    Success = true,
                    Data = loginHistories,
                    Message = "Login history retrieved successfully"
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting login history for user {UserId}", userId);
                return new TradeFinanceBackend.Models.DTOs.ApiResponseDto<List<LoginHistoryDto>>
                {
                    Success = false,
                    Message = "An error occurred while retrieving login history",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task LogLoginAsync(Guid userId, string ipAddress, string userAgent, bool isSuccessful, string? failureReason = null)
        {
            try
            {
                var loginHistory = new LoginHistory
                {
                    UserId = userId,
                    IpAddress = ipAddress,
                    UserAgent = userAgent,
                    IsSuccessful = isSuccessful,
                    FailureReason = failureReason,
                    LoginTime = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };

                _context.LoginHistories.Add(loginHistory);
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error logging login for user {UserId}", userId);
            }
        }

        private async Task SendPasswordChangeNotificationAsync(User user, string ipAddress)
        {
            try
            {
                _logger.LogInformation("🔍 Checking password change notification settings for user {Email} (ID: {UserId})", user.Email, user.Id);

                // Check if user has password change notifications enabled
                var userSettings = await _context.UserSettings
                    .FirstOrDefaultAsync(s => s.UserId == user.Id);

                _logger.LogInformation("📊 UserSettings found: {SettingsExists}, PasswordChangeNotificationEnabled: {PasswordEnabled}",
                    userSettings != null, userSettings?.PasswordChangeNotificationEnabled ?? false);

                // If user settings don't exist or password change notifications are disabled, skip sending email
                if (userSettings == null || !userSettings.PasswordChangeNotificationEnabled)
                {
                    _logger.LogInformation("❌ Password change notification SKIPPED for user {Email} - Settings exist: {SettingsExist}, Enabled: {Enabled}",
                        user.Email, userSettings != null, userSettings?.PasswordChangeNotificationEnabled ?? false);
                    return;
                }

                _logger.LogInformation("✅ Password change notification WILL BE SENT for user {Email}", user.Email);

                var subject = "🔐 Mật khẩu đã được thay đổi";
                var body = $@"
                    <h2>Mật khẩu tài khoản đã được thay đổi</h2>
                    <p>Xin chào {user.FirstName} {user.LastName},</p>
                    <p>Mật khẩu tài khoản của bạn đã được thay đổi thành công.</p>

                    <div style='background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;'>
                        <p><strong>🕒 Thời gian:</strong> {DateTime.UtcNow.AddHours(7):dd/MM/yyyy HH:mm:ss} (GMT+7)</p>
                        <p><strong>🌐 Địa chỉ IP:</strong> {ipAddress}</p>
                        <p><strong>📧 Email:</strong> {user.Email}</p>
                    </div>

                    <p>Nếu bạn không thực hiện thay đổi này, vui lòng:</p>
                    <ul>
                        <li>Liên hệ với chúng tôi ngay lập tức</li>
                        <li>Kiểm tra tài khoản của bạn</li>
                        <li>Thay đổi mật khẩu nếu cần thiết</li>
                    </ul>

                    <p>Trân trọng,<br>Đội ngũ DATK</p>
                ";

                await _emailService.SendEmailAsync(user.Email, subject, body);
                _logger.LogInformation("Password change notification email sent to {Email}", user.Email);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send password change notification email to {Email}", user.Email);
            }
        }

        public async Task<UserDto?> GetUserByIdAsync(Guid userId)
        {
            var user = await _context.Users
                .Include(u => u.UserProfile)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null)
            {
                return null;
            }

            return new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Avatar = user.UserProfile?.Avatar,
                CreatedAt = user.CreatedAt,
                LastLoginAt = user.LastLoginAt
            };
        }

        // Removed unused HashPassword and GenerateSalt methods
        // Now using IPasswordHashingService for consistency

        public async Task<ApiResponseDto<bool>> ToggleEmailNotificationsAsync(Guid userId)
        {
            try
            {
                var settings = await _context.UserSettings.FirstOrDefaultAsync(s => s.UserId == userId);

                if (settings == null)
                {
                    settings = new UserSettings
                    {
                        UserId = userId,
                        EmailNotificationEnabled = true, // Enable by default on first toggle
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    _context.UserSettings.Add(settings);
                }
                else
                {
                    settings.EmailNotificationEnabled = !settings.EmailNotificationEnabled;
                    settings.UpdatedAt = DateTime.UtcNow;
                }

                await _context.SaveChangesAsync();

                return new ApiResponseDto<bool>
                {
                    Success = true,
                    Data = settings.EmailNotificationEnabled,
                    Message = settings.EmailNotificationEnabled ? "Email notifications enabled." : "Email notifications disabled."
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error toggling email notifications for user {UserId}", userId);
                return new ApiResponseDto<bool>
                {
                    Success = false,
                    Message = "An error occurred while updating your notification settings.",
                    Errors = [ex.Message]
                };
            }
        }

        public async Task<(bool Success, string Message, int StatusCode)> BlockUserAsync(Guid currentUserId, Guid userToBlockId)
        {
            if (currentUserId == userToBlockId)
            {
                _logger.LogWarning("User {UserId} attempted to block themselves.", currentUserId);
                return (false, "You cannot block yourself.", 400);
            }

            // Validate that both users exist before attempting to create the block relationship.
            var usersExist = await _context.Users.Where(u => u.Id == currentUserId || u.Id == userToBlockId).CountAsync();
            if (usersExist != 2)
            {
                _logger.LogWarning("Attempted to create a block relationship with a non-existent user. Blocker: {BlockerId}, UserToBlock: {UserToBlockId}", currentUserId, userToBlockId);
                return (false, "The user you are trying to block does not exist.", 404);
            }

            var alreadyBlocked = await _context.BlockedUsers
                .AnyAsync(bu => bu.BlockerId == currentUserId && bu.BlockedId == userToBlockId);

            if (alreadyBlocked)
            {
                return (true, "User is already blocked.", 200);
            }

            var block = new BlockedUser
            {
                BlockerId = currentUserId,
                BlockedId = userToBlockId,
            };

            _context.BlockedUsers.Add(block);
            await _context.SaveChangesAsync();
            _logger.LogInformation("User {BlockerId} blocked user {BlockedId}", currentUserId, userToBlockId);
            return (true, "User blocked successfully.", 200);
        }

        public async Task<(bool Success, string Message, int StatusCode)> UnblockUserAsync(Guid currentUserId, Guid userToUnblockId)
        {
            var block = await _context.BlockedUsers
                .FirstOrDefaultAsync(bu => bu.BlockerId == currentUserId && bu.BlockedId == userToUnblockId);

            if (block == null)
            {
                return (false, "The user is not blocked.", 404);
            }

            _context.BlockedUsers.Remove(block);
            await _context.SaveChangesAsync();
            _logger.LogInformation("User {BlockerId} unblocked user {BlockedId}", currentUserId, userToUnblockId);
            return (true, "User unblocked successfully.", 200);
        }

        public async Task<List<Guid>> GetBlockedUserIdsAsync(Guid currentUserId)
        {
            return await _context.BlockedUsers.Where(bu => bu.BlockerId == currentUserId).Select(bu => bu.BlockedId).ToListAsync();
        }

        public async Task<ApiResponseDto<bool>> GenerateAndSendOtpAsync(Guid userId, string purpose)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "User not found." };
                }

                var otp = new Random().Next(100000, 999999).ToString();
                user.OtpCode = _passwordHashingService.HashPassword(otp, user.Salt); // Store hashed OTP
                user.OtpExpiry = DateTime.UtcNow.AddMinutes(5); // OTP valid for 5 minutes
                user.OtpPurpose = purpose;

                await _context.SaveChangesAsync();

                var emailSent = await _emailService.SendEmailAsync(
                    user.Email,
                    $"Your Verification Code for {purpose.Replace('_', ' ')}",
                    $"<p>Your One-Time Password (OTP) is: <strong>{otp}</strong></p><p>This code will expire in 5 minutes.</p>"
                );

                if (!emailSent)
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "Failed to send OTP email." };
                }

                return new ApiResponseDto<bool> { Success = true, Data = true, Message = "OTP has been sent to your email." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating and sending OTP for user {UserId}", userId);
                return new ApiResponseDto<bool> { Success = false, Message = "An internal error occurred." };
            }
        }

        public async Task<ApiResponseDto<bool>> VerifyOtpAsync(Guid userId, string otp, string purpose)
        {
            try
            {
                var user = await _context.Users.FindAsync(userId);
                if (user == null)
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "User not found." };
                }

                if (string.IsNullOrEmpty(user.OtpCode) || !user.OtpExpiry.HasValue || user.OtpExpiry.Value < DateTime.UtcNow)
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "OTP is invalid or has expired." };
                }

                if (user.OtpPurpose != purpose)
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "OTP purpose does not match." };
                }

                if (!_passwordHashingService.VerifyPassword(otp, user.Salt, user.OtpCode))
                {
                    return new ApiResponseDto<bool> { Success = false, Message = "Incorrect OTP." };
                }

                // OTP is correct, clear it to prevent reuse
                user.OtpCode = null;
                user.OtpExpiry = null;
                user.OtpPurpose = null;
                await _context.SaveChangesAsync();

                return new ApiResponseDto<bool> { Success = true, Data = true, Message = "OTP verified successfully." };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error verifying OTP for user {UserId}", userId);
                return new ApiResponseDto<bool> { Success = false, Message = "An internal error occurred." };
            }
        }
    }
}
