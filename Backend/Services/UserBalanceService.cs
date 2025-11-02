using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using Microsoft.Extensions.Logging;

namespace TradeFinanceBackend.Services
{
    public interface IUserBalanceService
    {
        Task<UserBalance?> GetUserBalanceAsync(Guid userId, string tokenSymbol = "PM");
        Task<UserBalance?> GetUserBalanceByAddressAsync(string walletAddress, string tokenSymbol = "PM");
        Task<bool> CreditBalanceAsync(Guid userId, string walletAddress, decimal amount, string transactionType, string? description = null, Guid? relatedBetId = null, string? transactionHash = null, string tokenSymbol = "PM");
        Task<bool> DebitBalanceAsync(Guid userId, string walletAddress, decimal amount, string transactionType, string? description = null, Guid? relatedBetId = null, string? transactionHash = null, string tokenSymbol = "PM");
        Task<bool> CreateUserBalanceAsync(Guid userId, string walletAddress, string tokenSymbol = "PM");
        Task<List<BalanceTransaction>> GetTransactionHistoryAsync(Guid userId, int page = 1, int pageSize = 20, string tokenSymbol = "PM");
        Task<Guid?> GetUserIdByWalletAddressAsync(string walletAddress);
    }

    public class UserBalanceService : IUserBalanceService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<UserBalanceService> _logger;

        public UserBalanceService(TradeFinanceDbContext context, ILogger<UserBalanceService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<UserBalance?> GetUserBalanceAsync(Guid userId, string tokenSymbol = "PM")
        {
            try
            {
                return await _context.UserBalances
                    .FirstOrDefaultAsync(b => b.UserId == userId && b.TokenSymbol == tokenSymbol);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user balance for user {UserId}, token {TokenSymbol}", userId, tokenSymbol);
                return null;
            }
        }

        public async Task<UserBalance?> GetUserBalanceByAddressAsync(string walletAddress, string tokenSymbol = "PM")
        {
            try
            {
                return await _context.UserBalances
                    .FirstOrDefaultAsync(b => b.WalletAddress == walletAddress && b.TokenSymbol == tokenSymbol);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user balance for address {WalletAddress}, token {TokenSymbol}", walletAddress, tokenSymbol);
                return null;
            }
        }

        public async Task<bool> CreateUserBalanceAsync(Guid userId, string walletAddress, string tokenSymbol = "PM")
        {
            try
            {
                // Check if balance already exists
                var existingBalance = await GetUserBalanceAsync(userId, tokenSymbol);
                if (existingBalance != null)
                {
                    _logger.LogInformation("User balance already exists for user {UserId}, token {TokenSymbol}", userId, tokenSymbol);
                    return true;
                }

                var userBalance = new UserBalance
                {
                    UserId = userId,
                    WalletAddress = walletAddress,
                    TokenSymbol = tokenSymbol,
                    Balance = 0,
                    LockedBalance = 0,
                    LastUpdated = DateTime.UtcNow,
                    CreatedAt = DateTime.UtcNow
                };

                _context.UserBalances.Add(userBalance);
                await _context.SaveChangesAsync();

                _logger.LogInformation("Created user balance for user {UserId}, address {WalletAddress}, token {TokenSymbol}", userId, walletAddress, tokenSymbol);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error creating user balance for user {UserId}, address {WalletAddress}, token {TokenSymbol}", userId, walletAddress, tokenSymbol);
                return false;
            }
        }

        public async Task<bool> CreditBalanceAsync(Guid userId, string walletAddress, decimal amount, string transactionType, string? description = null, Guid? relatedBetId = null, string? transactionHash = null, string tokenSymbol = "PM")
        {
            // FIX: Removed the explicit transaction creation (using var transaction = ...).
            // This method will now participate in any existing transaction started by the calling service (like PaymentProcessingService),
            // which resolves the "connection is already in a transaction" error.
            try
            {
                // Get or create user balance
                var userBalance = await GetUserBalanceAsync(userId, tokenSymbol);
                if (userBalance == null)
                {
                    await CreateUserBalanceAsync(userId, walletAddress, tokenSymbol);
                    userBalance = await GetUserBalanceAsync(userId, tokenSymbol);
                    if (userBalance == null)
                    {
                        _logger.LogError("Failed to create user balance for user {UserId}", userId);
                        return false;
                    }
                }

                var balanceBefore = userBalance.Balance;
                userBalance.Balance += amount;
                userBalance.LastUpdated = DateTime.UtcNow;
                userBalance.UpdatedAt = DateTime.UtcNow;

                // Create transaction record
                var balanceTransaction = new BalanceTransaction
                {
                    UserId = userId,
                    WalletAddress = walletAddress,
                    TokenSymbol = tokenSymbol,
                    TransactionType = transactionType,
                    Amount = amount,
                    BalanceBefore = balanceBefore,
                    BalanceAfter = userBalance.Balance,
                    Description = description,
                    TransactionHash = transactionHash,
                    RelatedBetId = relatedBetId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.BalanceTransactions.Add(balanceTransaction);
                await _context.SaveChangesAsync();

                _logger.LogInformation("✅ Credited {Amount} {TokenSymbol} to user {UserId}. Balance: {BalanceBefore} → {BalanceAfter}", 
                    amount, tokenSymbol, userId, balanceBefore, userBalance.Balance);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error crediting balance for user {UserId}, amount {Amount}, token {TokenSymbol}", userId, amount, tokenSymbol);
                return false;
            }
        }

        public async Task<bool> DebitBalanceAsync(Guid userId, string walletAddress, decimal amount, string transactionType, string? description = null, Guid? relatedBetId = null, string? transactionHash = null, string tokenSymbol = "PM")
        {
            // FIX: Removed the explicit transaction creation for consistency and to prevent future nested transaction issues.
            // This method will now correctly participate in any ambient transaction.
            try
            {
                var userBalance = await GetUserBalanceAsync(userId, tokenSymbol);
                if (userBalance == null)
                {
                    _logger.LogError("User balance not found for user {UserId}, token {TokenSymbol}", userId, tokenSymbol);
                    return false;
                }

                if (userBalance.Balance < amount)
                {
                    _logger.LogError("Insufficient balance for user {UserId}. Required: {Amount}, Available: {Balance}", userId, amount, userBalance.Balance);
                    return false;
                }

                var balanceBefore = userBalance.Balance;
                userBalance.Balance -= amount;
                userBalance.LastUpdated = DateTime.UtcNow;
                userBalance.UpdatedAt = DateTime.UtcNow;

                // Create transaction record
                var balanceTransaction = new BalanceTransaction
                {
                    UserId = userId,
                    WalletAddress = walletAddress,
                    TokenSymbol = tokenSymbol,
                    TransactionType = transactionType,
                    Amount = -amount, // Negative for debit
                    BalanceBefore = balanceBefore,
                    BalanceAfter = userBalance.Balance,
                    Description = description,
                    TransactionHash = transactionHash,
                    RelatedBetId = relatedBetId,
                    CreatedAt = DateTime.UtcNow
                };

                _context.BalanceTransactions.Add(balanceTransaction);
                await _context.SaveChangesAsync();

                _logger.LogInformation("💸 Debited {Amount} {TokenSymbol} from user {UserId}. Balance: {BalanceBefore} → {BalanceAfter}", 
                    amount, tokenSymbol, userId, balanceBefore, userBalance.Balance);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error debiting balance for user {UserId}, amount {Amount}, token {TokenSymbol}", userId, amount, tokenSymbol);
                return false;
            }
        }

        public async Task<List<BalanceTransaction>> GetTransactionHistoryAsync(Guid userId, int page = 1, int pageSize = 20, string tokenSymbol = "PM")
        {
            try
            {
                return await _context.BalanceTransactions
                    .Where(t => t.UserId == userId && t.TokenSymbol == tokenSymbol)
                    .OrderByDescending(t => t.CreatedAt)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting transaction history for user {UserId}, token {TokenSymbol}", userId, tokenSymbol);
                return new List<BalanceTransaction>();
            }
        }

        public async Task<Guid?> GetUserIdByWalletAddressAsync(string walletAddress)
        {
            try
            {
                // First try to find by UserProfile.WalletCode
                var userByProfile = await _context.Users
                    .Include(u => u.UserProfile)
                    .FirstOrDefaultAsync(u => u.UserProfile != null && u.UserProfile.WalletCode == walletAddress);

                if (userByProfile != null)
                {
                    return userByProfile.Id;
                }

                // If not found, try to find by existing UserBalance.WalletAddress
                var userBalance = await _context.UserBalances
                    .FirstOrDefaultAsync(b => b.WalletAddress == walletAddress);

                if (userBalance != null)
                {
                    return userBalance.UserId;
                }

                _logger.LogWarning("No user found for wallet address {WalletAddress}", walletAddress);
                return null;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting user ID for wallet address {WalletAddress}", walletAddress);
                return null;
            }
        }
    }
}