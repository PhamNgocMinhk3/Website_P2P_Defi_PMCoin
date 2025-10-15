using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace TradeFinanceBackend.Models.DTOs
{
    public class SettledBetDto
    {
        public string UserAddress { get; set; } = string.Empty;
        public decimal BetAmount { get; set; }
        public string Direction { get; set; } = string.Empty;
        public string Result { get; set; } = string.Empty; // WIN, LOSE, TIE
        public decimal PayoutAmount { get; set; }
    }
}
