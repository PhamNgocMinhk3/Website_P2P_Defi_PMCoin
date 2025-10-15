namespace TradeFinanceBackend.DTOs
{
    public class SmartContractLogSummaryDto
    {
        public DateTime Date { get; set; }
        public int TotalTransactions { get; set; }
        public decimal TotalVolume { get; set; }
        public int EmergencyPayouts { get; set; }
        public int TotalBets { get; set; }
        public decimal TotalBetAmount { get; set; }
        public int TotalDeposits { get; set; }
        public decimal TotalDepositAmount { get; set; }
        public int TotalWithdrawals { get; set; }
        public decimal TotalWithdrawalAmount { get; set; }
    }
}
