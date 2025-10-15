using System.ComponentModel.DataAnnotations;

namespace TradeFinanceBackend.Models.DTOs
{
    public class VoteOnPollDto
    {
        [Required]
        public string OptionId { get; set; } = string.Empty;
    }

    public class AddPollOptionDto
    {
        [Required]
        [MaxLength(100)]
        public string OptionText { get; set; } = string.Empty;
    }
}