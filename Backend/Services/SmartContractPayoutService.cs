using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TradeFinanceBackend.Models;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;
using System.Threading.Tasks;
using TradeFinanceBackend.Data;
using System;

namespace TradeFinanceBackend.Services
{
    public interface ISmartContractPayoutService
    {
        Task<string?> ProcessPayoutAsync(ActiveBet bet, string result, decimal payoutAmount);
    }

    public class SmartContractPayoutService : ISmartContractPayoutService
    {
        private readonly ILogger<SmartContractPayoutService> _logger;
        private readonly IConfiguration _configuration;
        private readonly IServiceProvider _serviceProvider;
        private readonly ISmartContractService _smartContractService;
        private readonly ISignalRService _signalRService;

        public SmartContractPayoutService(
            ILogger<SmartContractPayoutService> logger,
            IConfiguration configuration,
            IServiceProvider serviceProvider,
            ISmartContractService smartContractService,
            ISignalRService signalRService)
        {
            _logger = logger;
            _configuration = configuration;
            _serviceProvider = serviceProvider;
            _smartContractService = smartContractService;
            _signalRService = signalRService;
        }

        public async Task<string?> ProcessPayoutAsync(ActiveBet bet, string result, decimal payoutAmount)
        {
            // BƯỚC 1: FIX - Kiểm tra nếu kết quả là "LOSE" thì bỏ qua, không cần trả thưởng.
            // Logic cũ đã bị đảo ngược, khiến cho trường hợp "WIN" bị bỏ qua.
            if (result == "LOSE")
            {
                _logger.LogInformation("Payout skipped for a LOSE result. Bet ID: {BetId}", bet.Id);
                return "SKIPPED_LOSE"; // Trả về một chuỗi đặc biệt cho trường hợp thua
            }

            // BƯỚC 2: Kiểm tra tính toàn vẹn dữ liệu. Bắt buộc phải có ContractBetId.
            // Đây là lỗi nghiêm trọng từ lúc đặt cược nếu bị thiếu.
            if (!bet.ContractBetId.HasValue || bet.ContractBetId.Value <= 0)
            {
                _logger.LogCritical("CRITICAL: Cannot process payout for Bet ID {BetId}. Reason: Missing ContractBetId. This indicates a severe data integrity issue during bet placement.", bet.Id);
                // Không thực hiện fallback, vì đây là lỗi hệ thống cần được sửa ở gốc. Trả về null để báo lỗi.
                return null;
            }

            // BƯỚC 3: Kiểm tra trước số dư của contract để tránh gửi giao dịch thất bại tốn gas.
            try
            {
                var stats = await _smartContractService.GetContractStats();
                var contractBalanceString = stats.TreasuryBalance.Replace(',', '.');
                var contractBalance = decimal.Parse(contractBalanceString, System.Globalization.CultureInfo.InvariantCulture);
                if (contractBalance < payoutAmount)
                {
                    _logger.LogError("Loi: May game khong du tien tra thuong. Bet ID: {BetId}, Payout: {PayoutAmount}, Balance: {ContractBalance}", bet.Id, payoutAmount, contractBalance);
                    await _signalRService.SendNotificationToUser(bet.UserAddress, "Lỗi: Máy game không đủ tiền trả thưởng. Vui lòng liên hệ admin.", "error");
                    return null; // Dừng xử lý, admin cần nạp tiền.
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking contract balance before payout for Bet ID: {BetId}. Aborting payout.", bet.Id);
                return null;
            }

            // BƯỚC 4: Logic chính - Gọi trực tiếp vào Smart Contract để xử lý trả thưởng.
            // Toàn bộ logic "fallback" phức tạp và "tào lao" đã được loại bỏ.
            try
            {
                _logger.LogInformation("Attempting to resolve bet on-chain. Bet ID: {BetId}, ContractBetId: {ContractBetId}, Result: {Result}", bet.Id, bet.ContractBetId.Value, result);
                var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];
                
                // CRITICAL FIX: Reverted to using `ResolveBetAsync`. The previous change to use EmergencyPayoutAsync
                // was incorrect for the standard settlement flow because it bypasses the `GameBetResolved` event
                // which is essential for system logging. The root cause of the payout error was in the smart contract's
                // profit calculation, which has been fixed separately. This ensures the correct event is emitted.
                var receipt = await _smartContractService.ResolveBetAsync((int)bet.ContractBetId.Value, result);

                if (receipt != null && receipt.Status.Value == 1) // Giao dịch thành công
                {
                    var txHash = receipt.TransactionHash;
                    _logger.LogInformation("✅ On-chain bet resolved and payout processed successfully. Bet ID: {BetId}, TxHash: {TxHash}", bet.Id, txHash);

                    // CRITICAL FIX: Log the successful payout to the SmartContractLogs table.
                    // This ensures the transaction appears in the admin logs.
                    await _smartContractService.LogSmartContractActionAsync(
                        "GameBetResolved",
                        receipt,
                        contractAddress!, // From contract
                        bet.UserAddress,
                        payoutAmount,
                        $"BetId: {bet.Id}, Result: {result}, Payout: {payoutAmount}"
                    );
                    return txHash;
                }
                else
                {
                    _logger.LogError("On-chain payout failed: ResolveBetAsync returned a null or failed receipt. Bet ID: {BetId}", bet.Id);
                    return null;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "CRITICAL: On-chain payout failed for Bet ID {BetId}. This requires manual admin intervention.", bet.Id);
                await _signalRService.SendNotificationToUser(bet.UserAddress, "Lỗi xử lý trả thưởng. Giao dịch của bạn sẽ được xử lý thủ công. Vui lòng liên hệ admin.", "error");
                return null;
            }
        }

    }
}