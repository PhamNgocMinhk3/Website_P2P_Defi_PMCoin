using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly IAuthenticationService _authService;
        private readonly ILogger<AuthController> _logger;
        private readonly TradeFinanceDbContext _context;
        private readonly ISmartContractService _smartContractService;
        private readonly IPasswordHashingService _passwordHashingService;
        private readonly IJwtTokenService _jwtTokenService; // Add JWT service

        public AuthController(
            IAuthenticationService authService, 
            ILogger<AuthController> logger, 
            TradeFinanceDbContext context,
            ISmartContractService smartContractService,
            IPasswordHashingService passwordHashingService,
            IJwtTokenService jwtTokenService // Inject JWT service
            )
        {
            _authService = authService;
            _logger = logger;
            _context = context;
            _smartContractService = smartContractService;
            _passwordHashingService = passwordHashingService;
            _jwtTokenService = jwtTokenService;
        }

        // DTO for the wallet login request
        public class WalletLoginRequestDto
        {
            [System.ComponentModel.DataAnnotations.Required]
            public string WalletAddress { get; set; } = string.Empty;
        }

        /// <summary>
        /// User login
        /// </summary>
        /// <param name="request">Login credentials</param>
        /// <returns>Authentication response with tokens</returns>
        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequestDto request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Invalid input data",
                    Errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList()
                });
            }

            var ipAddress = GetIpAddress();
            var userAgent = Request.Headers.UserAgent.ToString();

            var result = await _authService.LoginAsync(request, ipAddress, userAgent);

            if (result.Success && result.Data != null)
            {
                // Set secure HTTP-only session cookie
                _logger.LogInformation($"Setting sessionId cookie: {result.Data.SessionId}");
                SetSessionCookie(result.Data.SessionId);

                // Remove tokens from response body for security
                result.Data.AccessToken = "";
                result.Data.RefreshToken = "";
            }

            return result.Success ? Ok(result) : BadRequest(result);
        }



        /// <summary>
        /// User registration
        /// </summary>
        /// <param name="request">Registration data</param>
        /// <returns>Registration response</returns>
        [HttpPost("register")]
        public async Task<IActionResult> Register([FromBody] RegisterRequestDto request)
        {
            _logger.LogInformation("Register request received for email: {Email}", request?.Email);

            if (request == null)
            {
                _logger.LogWarning("Register request is null");
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Request body is required",
                    Errors = new List<string> { "Request body cannot be null or empty" }
                });
            }

            if (!ModelState.IsValid)
            {
                var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList();
                _logger.LogWarning("Register validation failed: {Errors}", string.Join(", ", errors));

                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Invalid input data",
                    Errors = errors
                });
            }

            var result = await _authService.RegisterAsync(request);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>
        /// Refresh access token
        /// </summary>
        /// <returns>New authentication response</returns>
        [HttpPost("refresh")]
        public async Task<IActionResult> RefreshToken()
        {
            var refreshToken = Request.Cookies["refreshToken"];
            
            if (string.IsNullOrEmpty(refreshToken))
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Refresh token not found",
                    Errors = ["No refresh token provided"]
                });
            }

            var ipAddress = GetIpAddress();
            var result = await _authService.RefreshTokenAsync(refreshToken, ipAddress);

            if (result.Success && result.Data != null)
            {
                // Set new secure HTTP-only session cookie
                SetSessionCookie(result.Data.SessionId);

                // Remove tokens from response body for security
                result.Data.AccessToken = "";
                result.Data.RefreshToken = "";
            }

            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>
        /// User logout
        /// </summary>
        /// <returns>Logout response</returns>
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            var refreshToken = Request.Cookies["refreshToken"];
            
            if (!string.IsNullOrEmpty(refreshToken))
            {
                var ipAddress = GetIpAddress();
                await _authService.LogoutAsync(refreshToken, ipAddress);
            }

            // Clear session cookie
            ClearSessionCookie();

            return Ok(new ApiResponseDto
            {
                Success = true,
                Message = "Logout successful"
            });
        }

        /// <summary>
        /// Forgot password
        /// </summary>
        /// <param name="request">Email for password reset</param>
        /// <returns>Forgot password response</returns>
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequestDto request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Invalid input data",
                    Errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList()
                });
            }

            var result = await _authService.ForgotPasswordAsync(request);
            return Ok(result); // Always return OK for security (don't reveal if email exists)
        }

        /// <summary>
        /// Reset password
        /// </summary>
        /// <param name="request">Reset password data</param>
        /// <returns>Reset password response</returns>
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequestDto request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Invalid input data",
                    Errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).ToList()
                });
            }

            var result = await _authService.ResetPasswordAsync(request);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>
        /// Verify email
        /// </summary>
        /// <param name="token">Verification token</param>
        /// <param name="email">Email to verify</param>
        /// <returns>Email verification response</returns>
        [HttpGet("verify-email")]
        public async Task<IActionResult> VerifyEmail([FromQuery] string token, [FromQuery] string email)
        {
            if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(email))
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Token and email are required",
                    Errors = ["Missing required parameters"]
                });
            }

            var request = new VerifyEmailRequestDto { Token = token, Email = email };
            var result = await _authService.VerifyEmailAsync(request);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        /// <summary>
        /// Get current user information
        /// </summary>
        /// <returns>Current user data</returns>
        [HttpGet("me")]
        public async Task<IActionResult> GetCurrentUser()
        {
            // Get user from session authentication middleware
            var userIdClaim = User.FindFirst("userId")?.Value;

            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new ApiResponseDto
                {
                    Success = false,
                    Message = "User not authenticated",
                    Errors = ["No valid session found"]
                });
            }

            // FIX: Include UserProfile to get the avatar
            var user = await _context.Users
                .Include(u => u.UserProfile)
                .FirstOrDefaultAsync(u => u.Id == userId);

            if (user == null)
            {
                return NotFound(new ApiResponseDto
                {
                    Success = false,
                    Message = "User not found",
                    Errors = new List<string> { "User does not exist" }
                });
            }

            var userDto = new UserDto
            {
                Id = user.Id,
                Username = user.Username,
                Email = user.Email,
                Role = user.Role,
                FirstName = user.FirstName,
                LastName = user.LastName,
                Avatar = user.UserProfile?.Avatar, // Add avatar property
                CreatedAt = user.CreatedAt,
                LastLoginAt = user.LastLoginAt
            };

            return Ok(new ApiResponseDto<UserDto>
            {
                Success = true,
                Message = "User data retrieved successfully",
                Data = userDto
            });
        }

        /// <summary>
        /// Generates a short-lived JWT for authenticated users to connect to SignalR hubs.
        /// This endpoint is protected by session authentication.
        /// </summary>
        [HttpGet("get-token")]
        [Authorize] // Ensures only logged-in users can get a token
        public async Task<IActionResult> GetSignalRToken()
        {
            var userIdClaim = User.FindFirst("userId")?.Value;
            if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            {
                return Unauthorized(new ApiResponseDto
                {
                    Success = false,
                    Message = "User not authenticated or session is invalid."
                });
            }

            var user = await _context.Users.FindAsync(userId);
            if (user == null)
            {
                return NotFound(new ApiResponseDto { Success = false, Message = "User not found." });
            }

            // Generate a short-lived access token for SignalR
            var token = _jwtTokenService.GenerateAccessToken(user);

            return Ok(new ApiResponseDto<object>
            {
                Success = true,
                Data = new { token },
                Message = "SignalR token generated successfully."
            });
        }


        [HttpPost("login-wallet")]
        public async Task<IActionResult> LoginWithWallet([FromBody] WalletLoginRequestDto request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { message = "Invalid request: WalletAddress is required." });
            }

            try
            {
                // Step 1: Verify the address is the contract owner using the service.
                bool isOwner = await _smartContractService.IsContractOwnerAsync(request.WalletAddress);
                if (!isOwner)
                {
                    _logger.LogWarning("Wallet login attempt failed for non-owner address: {WalletAddress}", request.WalletAddress);
                    return Forbid("Provided wallet address is not the contract owner.");
                }

                // Step 2: Find the user associated with this wallet address.
                var userProfile = await _context.UserProfiles
                    .Include(up => up.User)
                    .FirstOrDefaultAsync(up => up.WalletCode != null && up.WalletCode.ToLower() == request.WalletAddress.ToLower());

                if (userProfile?.User == null)
                {
                    _logger.LogWarning("Wallet login failed: The contract owner's wallet address ({WalletAddress}) is not associated with any user profile in the database. Please log in with email/password and update your profile.", request.WalletAddress);
                    return NotFound(new 
                    { 
                        message = "The owner's wallet address is not linked to a user account.",
                        detail = "To fix this, log in with your email and password, then add this wallet address to your user profile."
                    });
                }

                var user = userProfile.User;

                // Step 3: Check if the user is an Admin.
                if (user.Role != UserRoles.Admin)
                {
                    _logger.LogWarning("Wallet login attempt for non-admin user: {Email}", user.Email);
                    return Forbid("User is not an administrator.");
                }

                // Step 4: Create a session and set the cookie
                var ipAddress = GetIpAddress();
                var userAgent = Request.Headers.UserAgent.ToString();

                var userSession = new UserSession
                {
                    UserId = user.Id,
                    SessionToken = _passwordHashingService.GenerateSecureToken(64),
                    ExpiryDate = DateTime.UtcNow.AddDays(7), // 7-day session
                    IpAddress = ipAddress,
                    UserAgent = userAgent
                };
                _context.UserSessions.Add(userSession);
                await _context.SaveChangesAsync();

                SetSessionCookie(userSession.Id.ToString());
                _logger.LogInformation("Admin user {Email} logged in via wallet {WalletAddress}", user.Email, request.WalletAddress);
                return Ok(new { success = true, message = "Admin login successful." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during wallet login for address {WalletAddress}", request.WalletAddress);
                return StatusCode(500, new { error = "Internal server error during wallet login." });
            }
        }

        /// <summary>
        /// Revoke refresh token
        /// </summary>
        /// <param name="request">Token to revoke</param>
        /// <returns>Revoke response</returns>
        [HttpPost("revoke-token")]
        [Authorize]
        public async Task<IActionResult> RevokeToken([FromBody] RefreshTokenRequestDto request)
        {
            var token = request.RefreshToken ?? Request.Cookies["refreshToken"];
            
            if (string.IsNullOrEmpty(token))
            {
                return BadRequest(new ApiResponseDto
                {
                    Success = false,
                    Message = "Token is required",
                    Errors = ["No token provided"]
                });
            }

            var ipAddress = GetIpAddress();
            var result = await _authService.RevokeTokenAsync(token, ipAddress);
            return result.Success ? Ok(result) : BadRequest(result);
        }

        #region Private Helper Methods

        private void SetSessionCookie(string sessionId)
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = false, // Set to false for development (HTTP), true for production (HTTPS)
                SameSite = SameSiteMode.Lax, // Changed from Strict to Lax for better compatibility
                Path = "/",
                Expires = DateTime.UtcNow.AddDays(7) // Session expires in 7 days
            };

            _logger.LogInformation($"Appending sessionId cookie with options: HttpOnly={cookieOptions.HttpOnly}, Secure={cookieOptions.Secure}, SameSite={cookieOptions.SameSite}, Path={cookieOptions.Path}");
            Response.Cookies.Append("sessionId", sessionId, cookieOptions);
            _logger.LogInformation($"SessionId cookie set successfully");
        }

        private void ClearSessionCookie()
        {
            var cookieOptions = new CookieOptions
            {
                HttpOnly = true,
                Secure = false, // Match the setting in SetSessionCookie
                SameSite = SameSiteMode.Lax,
                Path = "/",
                Expires = DateTime.UtcNow.AddDays(-1)
            };

            Response.Cookies.Append("sessionId", "", cookieOptions);
        }

        private string GetIpAddress()
        {
            // Check for X-Forwarded-For header (proxy/load balancer)
            if (Request.Headers.ContainsKey("X-Forwarded-For"))
            {
                var forwardedFor = Request.Headers["X-Forwarded-For"].ToString();
                if (!string.IsNullOrEmpty(forwardedFor))
                {
                    return forwardedFor.Split(',')[0].Trim();
                }
            }

            // Check for X-Real-IP header (nginx)
            if (Request.Headers.ContainsKey("X-Real-IP"))
            {
                var realIp = Request.Headers["X-Real-IP"].ToString();
                if (!string.IsNullOrEmpty(realIp))
                {
                    return realIp.Trim();
                }
            }

            // Get remote IP address
            var remoteIp = HttpContext.Connection.RemoteIpAddress;
            if (remoteIp != null)
            {
                // Convert IPv6 localhost to IPv4
                if (remoteIp.ToString() == "::1")
                {
                    return "127.0.0.1";
                }

                // If IPv6, try to get IPv4 mapped address
                if (remoteIp.IsIPv4MappedToIPv6)
                {
                    return remoteIp.MapToIPv4().ToString();
                }

                return remoteIp.ToString();
            }

            return "Unknown";
        }

        #endregion
    }
}
