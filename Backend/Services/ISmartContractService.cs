using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public interface ISmartContractService
    {
        Task<Nethereum.RPC.Eth.DTOs.TransactionReceipt?> ResolveBetAsync(int betId, string result);
        Task<string> UpdateGameStatsWithManualPayout(decimal profitAdjustment);
        Task<bool> IsConnectedAsync();
        Task<string> GetContractAddressAsync();
        Task<ContractStatsDto> GetContractStats();
        Task ResetDailyProfitIfNeededAsync();
        Task<string> DepositToTreasuryAsync(decimal amount);
        Task<string> WithdrawFromTreasuryAsync(decimal amount);
        Task<string> SetDailyProfitTargetAsync(decimal amount);
        Task<string> UpdateGameStatsOnChainAsync(decimal roundVolume, decimal roundProfit); // This is for round-end stats
        Task LogSmartContractActionAsync(string eventType, Nethereum.RPC.Eth.DTOs.TransactionReceipt receipt, string from, string to, decimal amount, string eventData);
        Task<string> EmergencyPayoutAsync(decimal amount, string recipient); // This is for direct payouts
        Task<bool> IsContractOwnerAsync(string walletAddress);
        Task<string> TransferVndtFromTreasuryAsync(string userAddress, decimal amount);
        Task<string> RefundWithdrawalAsync(string userAddress, decimal amount);
        Task<string> ClaimWithdrawalAsync(decimal amount);
    }
}
