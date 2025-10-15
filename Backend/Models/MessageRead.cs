using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class MessageRead : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        [Required]
        public Guid MessageId { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        public Guid ChatId { get; set; } // Added ChatId based on usage in ChatService

        [Required]
        public DateTime ReadAt { get; set; }

        // Navigation properties
        [ForeignKey("MessageId")]
        public virtual Message? Message { get; set; }

        [ForeignKey("UserId")]
        public virtual User? User { get; set; }

        [ForeignKey("ChatId")]
        public virtual Chat? Chat { get; set; }
    }
}
