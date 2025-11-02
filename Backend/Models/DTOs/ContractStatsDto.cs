using System.Text.Json.Serialization;

namespace TradeFinanceBackend.Models.DTOs
{
    public class ContractStatsDto
    {
        [JsonPropertyName("gameMachineBalance")]
        public string GameMachineBalance { get; set; } = string.Empty;

        [JsonPropertyName("treasuryBalance")]
        public string TreasuryBalance { get; set; } = string.Empty;

        [JsonPropertyName("totalGameVolume")]
        public string TotalGameVolume { get; set; } = string.Empty;

        [JsonPropertyName("totalGameProfit")]
        public string TotalGameProfit { get; set; } = string.Empty;

        [JsonPropertyName("dailyProfitTarget")]
        public string DailyProfitTarget { get; set; } = string.Empty;

        [JsonPropertyName("currentDailyProfit")]
        public string CurrentDailyProfit { get; set; } = string.Empty;

        [JsonPropertyName("isProfitTargetMet")]
        public bool IsProfitTargetMet { get; set; }
    }
}