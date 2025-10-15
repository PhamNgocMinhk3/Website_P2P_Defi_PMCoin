using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class User : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        [MaxLength(50)]
        public string Username { get; set; } = string.Empty;

        [Required]
        [EmailAddress]
        [MaxLength(255)]
        public string Email { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string PasswordHash { get; set; } = string.Empty;

        [Required]
        [MaxLength(255)]
        public string Salt { get; set; } = string.Empty;

        [Required]
        [MaxLength(50)]
        public string Role { get; set; } = UserRoles.User;

        [MaxLength(100)]
        public string? FirstName { get; set; }

        [MaxLength(100)]
        public string? LastName { get; set; }

        public bool IsActive { get; set; } = true;

        public bool EmailVerified { get; set; } = false;

        public DateTime? EmailVerifiedAt { get; set; }

        public DateTime? LastLoginAt { get; set; }

        [MaxLength(255)]
        public string? EmailVerificationToken { get; set; }

        public DateTime? EmailVerificationTokenExpiry { get; set; }

        [MaxLength(255)]
        public string? PasswordResetToken { get; set; }

        public DateTime? PasswordResetTokenExpiry { get; set; }

        // OTP fields for 2FA
        [MaxLength(255)]
        public string? OtpCode { get; set; }

        public DateTime? OtpExpiry { get; set; }

        [MaxLength(100)]
        public string? OtpPurpose { get; set; }

        [MaxLength(255)]
        public string? TempPasswordHash { get; set; } // Store old password during reset process

        public bool IsOnline { get; set; } = false;

        public DateTime? LastSeen { get; set; }

        // Navigation properties
        public virtual ICollection<RefreshToken> RefreshTokens { get; set; } = [];
        public virtual ICollection<UserSession> UserSessions { get; set; } = [];
        public virtual ICollection<ChatParticipant> ChatMemberships { get; set; } = [];
        public virtual ICollection<Message> Messages { get; set; } = [];
        public virtual ICollection<Chat> CreatedChats { get; set; } = [];
        public virtual UserProfile? UserProfile { get; set; }
        public virtual UserSettings? UserSettings { get; set; }
        public virtual ICollection<LoginHistory> LoginHistories { get; set; } = [];
        public virtual ICollection<UserBalance> UserBalances { get; set; } = [];
        public virtual ICollection<BalanceTransaction> BalanceTransactions { get; set; } = [];
    }

    public static class UserRoles
    {
        public const string Admin = "Admin";
        public const string User = "User";
        public const string Manager = "Manager";
    }
}
