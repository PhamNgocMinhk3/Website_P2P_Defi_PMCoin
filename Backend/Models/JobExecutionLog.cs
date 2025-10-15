using System;
using System.ComponentModel.DataAnnotations;

namespace TradeFinanceBackend.Models
{
    public class JobExecutionLog : BaseEntity
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(100)]
        public string JobName { get; set; } = string.Empty;

        public DateTime LastExecutionDate { get; set; }
    }
}
