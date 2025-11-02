using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;
using TradeFinanceBackend.Data;

namespace TradeFinanceBackend.Services
{
    public interface IPaymentProcessingService
    {
        Task<bool> ProcessSuccessfulDepositAsync(Guid orderId);
    }

    public class PaymentProcessingService : IPaymentProcessingService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ISmartContractService _smartContractService;
        private readonly IUserBalanceService _userBalanceService;
        private readonly ILogger<PaymentProcessingService> _logger;

        public PaymentProcessingService(
            TradeFinanceDbContext context,
            ISmartContractService smartContractService,
            IUserBalanceService userBalanceService, ILogger<PaymentProcessingService> logger)
        {
            _context = context;
            _smartContractService = smartContractService;
            _userBalanceService = userBalanceService;
            _logger = logger;
        }

        public async Task<bool> ProcessSuccessfulDepositAsync(Guid orderId)
        {
            var depositRequest = await _context.FiatTransactions.FindAsync(orderId);

            if (depositRequest == null)
            {
                _logger.LogWarning("PaymentProcessing: Deposit request with OrderId {OrderId} not found.", orderId);
                return false;
            }

            // Idempotency check: Only process if the status is PENDING.
            if (depositRequest.Status != "PENDING")
            {
                _logger.LogInformation("PaymentProcessing: Deposit request {OrderId} is already processed or in a non-pending state ({Status}). Skipping.", orderId, depositRequest.Status);
                return true; // Return true to indicate it's not an error.
            }

            // CRITICAL FIX: Use EF Core's execution strategy to handle transactions with retry logic.
            // This pattern is required when EnableRetryOnFailure is configured. It wraps all
            // subsequent database operations into a single, retriable transaction, resolving the
            // "does not support user-initiated transactions" error.
            var strategy = _context.Database.CreateExecutionStrategy();
            return await strategy.ExecuteAsync(async () =>
            {
                // All operations inside this block will be part of the same transaction.
                using (var transaction = await _context.Database.BeginTransactionAsync())
                {
                    try
                    {
                        var user = await _context.Users
                            .Include(u => u.UserProfile)
                            .FirstOrDefaultAsync(u => u.Id == depositRequest.UserId);

                        if (user?.UserProfile == null || string.IsNullOrEmpty(user.UserProfile.WalletCode))
                        {
                            _logger.LogError("CRITICAL: User {UserId} completed VNPay deposit {OrderId} but has no wallet address.", depositRequest.UserId, orderId);
                            depositRequest.Status = "FAILED_NO_WALLET";
                            await _context.SaveChangesAsync();
                            await transaction.CommitAsync();
                            return false;
                        }

                        var walletAddress = user.UserProfile.WalletCode;
                        _logger.LogInformation("VNPay success for user {UserId}. Initiating VNDT transfer of {Amount} to wallet {WalletAddress}", user.Id, depositRequest.Amount, walletAddress);

                        var txHash = await _smartContractService.TransferVndtFromTreasuryAsync(walletAddress, depositRequest.Amount);

                        depositRequest.Status = "COMPLETED";
                        depositRequest.TransactionHash = txHash;
                        depositRequest.UpdatedAt = DateTime.UtcNow;

                        // FIX: Use named arguments to correctly pass the transaction hash.
                        // The previous code was incorrectly passing the string txHash to the Guid? relatedBetId parameter.
                        await _userBalanceService.CreditBalanceAsync(
                            userId: user.Id, 
                            walletAddress: walletAddress, 
                            amount: depositRequest.Amount, 
                            transactionType: "DEPOSIT_VNPAY", 
                            description: $"Deposit from VNPay. OrderId: {orderId}", 
                            transactionHash: txHash, 
                            tokenSymbol: "VNDT");

                        await _context.SaveChangesAsync();
                        await transaction.CommitAsync();

                        _logger.LogInformation("✅ Successfully processed deposit {OrderId} and transferred VNDT. TxHash: {TxHash}", orderId, txHash);
                        return true;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogCritical(ex, "CRITICAL: Failed to process VNDT transfer for deposit {OrderId} after successful VNPay payment.", orderId);
                        await transaction.RollbackAsync();
                        depositRequest.Status = "FAILED_TRANSFER";
                        await _context.SaveChangesAsync(); // Save the failure status outside the rolled-back transaction.
                        return false;
                    }
                }
            });
        }
    }
}