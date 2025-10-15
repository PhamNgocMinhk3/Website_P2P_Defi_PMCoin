using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Models
{
    public class Message : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid ChatId { get; set; }

        [Required]
        public Guid SenderId { get; set; }

        [Required]
        [MaxLength(50)]
        public string Type { get; set; } = MessageTypes.Text;

        public string? Content { get; set; }

        [Column(TypeName = "jsonb")]
        public string? Attachments { get; set; }

        public Guid? ParentMessageId { get; set; }

        public PollData? PollData { get; set; } // JSON object for poll

        public AppointmentData? AppointmentData { get; set; } // JSON object for appointment

        // Navigation properties
        [ForeignKey("ChatId")]
        public virtual Chat Chat { get; set; } = null!;

        [ForeignKey("SenderId")]
        public virtual User Sender { get; set; } = null!;

        [ForeignKey("ParentMessageId")]
        public virtual Message? ParentMessage { get; set; }

        public virtual ICollection<MessageRead> ReadBy { get; set; } = new List<MessageRead>();
        public virtual ICollection<MessageReaction> Reactions { get; set; } = new List<MessageReaction>();
    }

    

    public static class MessageTypes
    {
        public const string Text = "text";
        public const string Image = "image";
        public const string File = "file";
        public const string Audio = "audio";
        public const string Video = "video";
        public const string Poll = "poll";
        public const string Gif = "gif";
        public const string Appointment = "appointment";
    }
}