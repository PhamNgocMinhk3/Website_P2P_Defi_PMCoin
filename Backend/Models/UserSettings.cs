using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class UserSettings : BaseEntity
    {
        [Key]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        public Guid UserId { get; set; }

        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        // Security Settings
        public bool TwoFactorEnabled { get; set; } = false;
        public bool LoginNotificationEnabled { get; set; } = true;
        public bool PasswordChangeNotificationEnabled { get; set; } = true;

        // Notification Settings
        public bool EmailNotificationEnabled { get; set; } = true;
        public bool PushNotificationEnabled { get; set; } = true;
        public bool SmsNotificationEnabled { get; set; } = false;
        public bool MarketingEmailEnabled { get; set; } = false;

        // Privacy Settings
        public bool ProfileVisibilityPublic { get; set; } = false;
        public bool ShowOnlineStatus { get; set; } = true; // Added this property
        public bool AllowDirectMessages { get; set; } = true;
    }
}