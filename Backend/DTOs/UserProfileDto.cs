using System.ComponentModel.DataAnnotations;

namespace TradeFinanceBackend.DTOs
{
    public class UserProfileDto
    {
        public string Username { get; set; } = string.Empty;
        public string Email { get; set; } = string.Empty;
        public string Role { get; set; } = string.Empty;
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        public string? PhoneNumber { get; set; }
        public string? WalletCode { get; set; }
        public string? Avatar { get; set; }
        public string? Bio { get; set; }
        public DateTimeOffset CreatedAt { get; set; }
        public DateTimeOffset? UpdatedAt { get; set; }
    }

    public class UpdateUserProfileDto
    {
        // FirstName and LastName removed - they are readonly fields

        [MaxLength(20)]
        [Phone]
        public string? PhoneNumber { get; set; }

        [MaxLength(500)]
        public string? WalletCode { get; set; }

        [MaxLength(1000)]
        public string? Bio { get; set; }
    }

    public class UserSettingsDto
    {
        // Security Settings
        public bool TwoFactorEnabled { get; set; }
        public bool LoginNotificationEnabled { get; set; }
        public bool PasswordChangeNotificationEnabled { get; set; }

        // Notification Settings
        public bool EmailNotificationEnabled { get; set; }
        public bool PushNotificationEnabled { get; set; }
        public bool SmsNotificationEnabled { get; set; }
        public bool MarketingEmailEnabled { get; set; }

        // Privacy Settings
        public bool ProfileVisibilityPublic { get; set; }
        public bool ShowOnlineStatus { get; set; }
        public bool AllowDirectMessages { get; set; }
    }

    public class ChangePasswordDto
    {
        [Required]
        public string CurrentPassword { get; set; } = string.Empty;

        [Required]
        [MinLength(6)]
        public string NewPassword { get; set; } = string.Empty;

        [Required]
        [Compare("NewPassword")]
        public string ConfirmPassword { get; set; } = string.Empty;
    }

    public class ExportSettingsDto
    {
        public UserProfileDto Profile { get; set; } = new();
        public UserSettingsDto Settings { get; set; } = new();
        public DateTimeOffset ExportedAt { get; set; } = DateTimeOffset.UtcNow;
        public string ExportedBy { get; set; } = string.Empty;
    }

    public class ImportSettingsDto
    {
        // FirstName and LastName are not required for import since they're readonly
        [MaxLength(100)]
        public string? FirstName { get; set; }

        [MaxLength(100)]
        public string? LastName { get; set; }

        [MaxLength(20)]
        public string? PhoneNumber { get; set; }

        [MaxLength(500)]
        public string? WalletCode { get; set; }

        [MaxLength(1000)]
        public string? Bio { get; set; }

        // Settings
        public bool TwoFactorEnabled { get; set; }
        public bool LoginNotificationEnabled { get; set; }
        public bool PasswordChangeNotificationEnabled { get; set; }
        public bool EmailNotificationEnabled { get; set; }
        public bool PushNotificationEnabled { get; set; }
        public bool SmsNotificationEnabled { get; set; }
        public bool MarketingEmailEnabled { get; set; }
        public bool ProfileVisibilityPublic { get; set; }
        public bool ShowOnlineStatus { get; set; }
        public bool AllowDirectMessages { get; set; }
    }

    public class LoginHistoryDto
    {
        public string IpAddress { get; set; } = string.Empty;
        public string? UserAgent { get; set; }
        public string? Location { get; set; }
        public string? Device { get; set; }
        public bool IsSuccessful { get; set; }
        public string? FailureReason { get; set; }
        public DateTimeOffset LoginTime { get; set; }
    }
}