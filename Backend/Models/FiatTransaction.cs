using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models
{
    public class FiatTransaction : BaseEntity
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public Guid Id { get; set; }

        // This field stores the unique reference ID sent to the payment gateway (e.g., VNPay's vnp_TxnRef).
        // It's used to reliably look up the transaction when the gateway sends an IPN callback.
        [MaxLength(100)]
        public string? PaymentGatewayRef { get; set; }

        [Required]
        public Guid UserId { get; set; }

        [Required]
        [Column(TypeName = "decimal(18, 2)")]
        public decimal Amount { get; set; }

        [Required]
        [MaxLength(10)] // DEPOSIT, WITHDRAW
        public string Type { get; set; } = string.Empty;

        [Required]
        [MaxLength(30)] // PENDING, COMPLETED, FAILED, PENDING_ADMIN_APPROVAL, REJECTED
        public string Status { get; set; } = string.Empty;
        [MaxLength(66)] // Độ dài chuẩn của một transaction hash (0x + 64 ký tự hex)
        public string? TransactionHash { get; set; } // Lưu mã giao dịch blockchain

        // Navigation property
        [ForeignKey("UserId")]
        public virtual User User { get; set; } = null!;

        // ADDED: Fields for withdrawal requests to store bank information
        [StringLength(100)]
        public string? BankName { get; set; }
        [StringLength(50)]
        public string? BankAccountNumber { get; set; }
        [StringLength(100)]
        public string? BankAccountName { get; set; }
    }
}