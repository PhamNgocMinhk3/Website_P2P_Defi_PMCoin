using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System.Text;
using System.Text.Json;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;
using System.Threading.Tasks;
using System;
using Nethereum.Web3;
using Microsoft.EntityFrameworkCore;
using Nethereum.Contracts;
using System.Numerics;
using Nethereum.ABI.FunctionEncoding.Attributes;
using System.Globalization;
using Microsoft.Extensions.DependencyInjection;
using TradeFinanceBackend.Data;
using Nethereum.Web3.Accounts;
using Nethereum.Util;

namespace TradeFinanceBackend.Services
{
    // DTO for the owner() function from Ownable contracts
    [Function("owner", "address")]
    public class OwnerFunction : FunctionMessage { }

    // DTO for getContractBalance function
    [Function("getTreasuryBalance", "uint256")]
    public class GetTreasuryBalanceFunction : FunctionMessage { }

    // DTO for the getGameStats function call
    [Function("getGameStats")]
    public class GetGameStatsFunction : FunctionMessage { }

    // DTO for isProfitTargetMet function
    [Function("isProfitTargetMet", "bool")]
    public class IsProfitTargetMetFunction : FunctionMessage { }

    // DTO for lastResetDay function
    [Function("lastResetDay", "uint256")]
    public class LastResetDayFunction : FunctionMessage { }

    // DTO for resetDailyProfit function
    [Function("resetDailyProfit")]
    public class ResetDailyProfitFunction : FunctionMessage { }

    // DTO for the GameBetResolved event
    [Event("GameBetResolved")]
    public class GameBetResolvedEventDTO : IEventDTO
    {
        [Parameter("uint256", "betId", 1, true)]
        public BigInteger BetId { get; set; }

        [Parameter("address", "player", 2, true)]
        public string Player { get; set; } = string.Empty;

        [Parameter("bool", "won", 3, false)]
        public bool Won { get; set; }

        [Parameter("uint256", "payout", 4, false)]
        public BigInteger Payout { get; set; }
    }
    // DTO for resolveBet function
    [Function("resolveBet")]
    public class ResolveBetFunction : FunctionMessage
    {
        [Parameter("uint256", "_betId", 1)]
        public BigInteger BetId { get; set; }
        [Parameter("uint8", "_result", 2)]
        public byte Result { get; set; }
    }

    // DTO for updateGameStats function
    [Function("updateGameStats")]
    public class UpdateGameStatsFunction : FunctionMessage
    {
        [Parameter("uint256", "_roundVolume", 1)]
        public BigInteger RoundVolume { get; set; }
        [Parameter("int256", "_roundProfit", 2)]
        public BigInteger RoundProfit { get; set; }
    }

    // DTO for depositForTreasury function
    [Function("depositForTreasury")]
    public class DepositForTreasuryFunction : FunctionMessage
    {
        [Parameter("uint256", "_amount", 1)]
        public BigInteger Amount { get; set; }
    }

    // DTO for the correct withdrawFromTreasury function (sends to owner)
    [Function("withdrawFromTreasury")]
    public class WithdrawFromTreasuryToOwnerFunction : FunctionMessage
    {
        [Parameter("uint256", "_amount", 1)]
        public BigInteger Amount { get; set; }
    }

    // DTO for the NEW withdrawFromTreasuryToUser function
    [Function("withdrawFromTreasuryToUser")]
    public class WithdrawFromTreasuryToUserFunction : FunctionMessage
    {
        [Parameter("uint256", "_amount", 1)]
        public BigInteger Amount { get; set; }
        [Parameter("address", "_recipient", 2)]
        public string Recipient { get; set; } = string.Empty;
    }

    // DTO for emergencyPayout function
    [Function("emergencyPayout")]
    public class EmergencyPayoutFunction : FunctionMessage
    {
        [Parameter("address", "_player", 1)]
        public string Player { get; set; } = string.Empty;
        [Parameter("uint256", "_amount", 2)]
        public BigInteger Amount { get; set; }
    }

    // DTO for the new manualPayout function
    [Function("manualPayout")]
    public class ManualPayoutFunction : FunctionMessage
    {
        [Parameter("address", "_recipient", 1)]
        public string Recipient { get; set; } = string.Empty;
        [Parameter("uint256", "_amount", 2)]
        public BigInteger Amount { get; set; }
    }
    // DTO for the getGameStats function output
    [FunctionOutput]
    public class GetGameStatsOutputDTO : IFunctionOutputDTO
    {
        [Parameter("uint256", "totalGameVolume", 1)]
        public BigInteger TotalGameVolume { get; set; }

        [Parameter("int256", "totalGameProfit", 2)]
        public BigInteger TotalGameProfit { get; set; }

        [Parameter("uint256", "dailyProfitTarget", 3)]
        public BigInteger DailyProfitTarget { get; set; }

        [Parameter("int256", "currentDailyProfit", 4)]
        public BigInteger CurrentDailyProfit { get; set; }
    }

    // DTO for setDailyProfitTarget function
    [Function("setDailyProfitTarget")]
    public class SetDailyProfitTargetFunction : FunctionMessage
    {
        [Parameter("uint256", "_target", 1)]
        public BigInteger Target { get; set; }
    }

    public class SmartContractService : ISmartContractService
    {
        private readonly ILogger<SmartContractService> _logger;
        private readonly IConfiguration _configuration;
        private readonly IServiceProvider _serviceProvider;

        public SmartContractService(
            ILogger<SmartContractService> logger,
            IConfiguration configuration,
            IServiceProvider serviceProvider)
        {
            _logger = logger;
            _configuration = configuration;
            _serviceProvider = serviceProvider;
        }

        /// <summary>
        /// Helper method to create a configured Web3 instance for read/write operations.
        /// It centralizes RPC URL, private key, and HttpClient configuration.
        /// </summary>
        private Web3 GetWeb3ClientWithAccount()
        {
            var config = _configuration.GetSection("Blockchain:CoreChain");
            var rpcUrl = config["RpcUrl"];
            var privateKey = config["BackendWalletPrivateKey"];

            if (string.IsNullOrEmpty(rpcUrl) || string.IsNullOrEmpty(privateKey))
            {
                _logger.LogError("Blockchain configuration is missing (RpcUrl or BackendWalletPrivateKey).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }

            var account = new Account(privateKey);
            
            // Create a custom HttpClient with an increased timeout.
            var httpClient = new HttpClient();
            httpClient.Timeout = TimeSpan.FromSeconds(60); // Increase timeout to 60 seconds from the default 20.

            // FIX: Correctly initialize Web3 with a custom HttpClient via an RpcClient.
            var rpcClient = new Nethereum.JsonRpc.Client.RpcClient(new Uri(rpcUrl), httpClient, null, null, _logger);
            var web3 = new Web3(account, rpcClient);

            // Workaround for tcore network to avoid OverflowException
            web3.TransactionManager.UseLegacyAsDefault = true;
            // Set a reasonable default gas price for tcore
            web3.TransactionManager.DefaultGasPrice = Web3.Convert.ToWei(20, UnitConversion.EthUnit.Gwei);

            return web3;
        }


        public async Task<Nethereum.RPC.Eth.DTOs.TransactionReceipt?> ResolveBetAsync(int betId, string result)
        {
            try
            {
                _logger.LogInformation("Attempting to resolve bet on-chain. ContractBetId: {BetId}, Result: {Result}", betId, result);

                var resultEnum = result.ToUpper() switch
                {
                    "WIN" => (byte)1,
                    "LOSE" => (byte)0,
                    "DRAW" => (byte)2,
                    _ => throw new ArgumentException($"Invalid bet result: {result}", nameof(result))
                };

                var web3 = GetWeb3ClientWithAccount();
                var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

                var resolveBetFunction = new ResolveBetFunction
                {
                    BetId = betId,
                    Result = resultEnum
                };

                var handler = web3.Eth.GetContractTransactionHandler<ResolveBetFunction>();
                var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, resolveBetFunction);

                if (receipt?.Status?.Value == 1)
                {
                    _logger.LogInformation("✅ Bet resolved successfully on-chain. TxHash: {TxHash}", receipt.TransactionHash);

                    // Log the payout transaction using the pre-calculated payoutAmount
                    // await LogPayoutTransactionAsync(betId, result, receipt); // This logging is now handled by the PayoutService to ensure it's always done.
                    
                    return receipt;
                }

                _logger.LogError("❌ On-chain bet resolution failed. TxHash: {TxHash}, Status: {Status}", receipt?.TransactionHash, receipt?.Status?.Value);
                throw new Exception($"Smart contract transaction failed to resolve bet {betId}. Status: {receipt?.Status?.Value}");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resolving bet {BetId}", betId);
                // Ném lại lỗi để service gọi nó có thể xử lý
                throw;
            }
        }

        public async Task<string> DepositToTreasuryAsync(decimal amount)
        {
            var web3 = GetWeb3ClientWithAccount();
            var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

            if (string.IsNullOrEmpty(contractAddress))
            {
                _logger.LogError("Blockchain configuration is missing (CentralHubGameAddress).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }
            
            const int decimals = 6;
            var amountInSmallestUnit = Web3.Convert.ToWei(amount, decimals);

            try
            {
                // NOTE: This assumes the admin wallet (BackendWalletPrivateKey) has already approved the token spending for the contract.
                // This approval needs to be done manually once via a block explorer or script.
                var depositFunction = new DepositForTreasuryFunction { Amount = amountInSmallestUnit };
                var handler = web3.Eth.GetContractTransactionHandler<DepositForTreasuryFunction>();
                var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, depositFunction);

                if (receipt == null)
                {
                    throw new Exception("Treasury deposit transaction failed: No receipt was returned from the blockchain node.");
                }
                if (receipt.Status?.Value != 1)
                {
                    throw new Exception($"Treasury deposit transaction failed with status {receipt.Status?.Value ?? -1}. TxHash: {receipt.TransactionHash}");
                }

                // Log the transaction
                await LogSmartContractActionAsync("TreasuryDeposit", receipt, web3.TransactionManager.Account.Address, contractAddress, amount, "Admin deposited to treasury");
                return receipt.TransactionHash;
            }
            catch (SmartContractCustomErrorRevertException ex)
            {
                _logger.LogError(ex, "A smart contract revert occurred during treasury deposit. This is often due to insufficient token allowance. Ensure the admin wallet ({AdminWallet}) has approved the contract ({ContractAddress}) to spend the required amount of tokens.", web3.TransactionManager.Account.Address, contractAddress);
                throw new InvalidOperationException($"Smart contract reverted the transaction. This is likely due to insufficient token allowance. Please ensure the admin wallet has approved the contract to spend at least {amount} tokens.", ex);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An unexpected error occurred during treasury deposit for amount {Amount}.", amount);
                throw; // Re-throw the original exception
            }
        }

        public async Task<string> WithdrawFromTreasuryAsync(decimal amount)
        {
            var web3 = GetWeb3ClientWithAccount();
            var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

            if (string.IsNullOrEmpty(contractAddress))
            {
                _logger.LogError("Blockchain configuration is missing (CentralHubGameAddress).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }

            const int decimals = 6;
            var amountInSmallestUnit = Web3.Convert.ToWei(amount, decimals);

            var withdrawFunction = new WithdrawFromTreasuryToOwnerFunction { Amount = amountInSmallestUnit };
            var handler = web3.Eth.GetContractTransactionHandler<WithdrawFromTreasuryToOwnerFunction>();
            var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, withdrawFunction);

            if (receipt == null)
            {
                throw new Exception("Treasury withdrawal transaction failed: No receipt was returned from the blockchain node.");
            }
            if (receipt.Status.Value != 1)
            {
                throw new Exception($"Treasury withdrawal transaction failed. TxHash: {receipt.TransactionHash}");
            }
            
            // For logging, get the owner address the funds were sent to
            var ownerHandler = web3.Eth.GetContractQueryHandler<OwnerFunction>();
            var ownerAddress = await ownerHandler.QueryAsync<string>(contractAddress, new OwnerFunction());
            
            // Log the transaction
            await LogSmartContractActionAsync("TreasuryWithdrawal", receipt, contractAddress, ownerAddress, amount, "Admin withdrew from treasury to owner wallet");
            return receipt.TransactionHash;
        }

        public async Task<string> EmergencyPayoutAsync(decimal amount, string recipient)
        {
            // REFACTOR: This now uses the new `manualPayout` function for clarity and correctness.
            _logger.LogInformation("Executing emergency/manual payout to recipient '{Recipient}' for amount {Amount}", recipient, amount);

            var web3 = GetWeb3ClientWithAccount();
            var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

            if (string.IsNullOrEmpty(contractAddress))
            {
                _logger.LogError("Blockchain configuration is missing (CentralHubGameAddress).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }

            const int decimals = 6;
            var amountInSmallestUnit = Web3.Convert.ToWei(amount, decimals);

            var payoutFunction = new ManualPayoutFunction { Recipient = recipient, Amount = amountInSmallestUnit };
            var handler = web3.Eth.GetContractTransactionHandler<ManualPayoutFunction>();
            var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, payoutFunction);

            if (receipt.Status.Value != 1)
            {
                throw new Exception($"Manual payout transaction failed. TxHash: {receipt.TransactionHash}");
            }

            // Log the action with the correct recipient
            await LogSmartContractActionAsync("EmergencyPayout", receipt, contractAddress, recipient, amount, "Admin performed emergency/manual payout to user wallet");
            return receipt.TransactionHash;
        }

        public async Task<string> SetDailyProfitTargetAsync(decimal target)
        {
            var web3 = GetWeb3ClientWithAccount();
            var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

            if (string.IsNullOrEmpty(contractAddress))
            {
                _logger.LogError("Blockchain configuration is missing (CentralHubGameAddress).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }

            const int decimals = 6;
            var targetInSmallestUnit = Web3.Convert.ToWei(target, decimals);

            var setTargetFunction = new SetDailyProfitTargetFunction { Target = targetInSmallestUnit };
            var handler = web3.Eth.GetContractTransactionHandler<SetDailyProfitTargetFunction>();
            var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, setTargetFunction);

            if (receipt.Status.Value != 1)
            {
                throw new Exception($"Set daily profit target transaction failed. TxHash: {receipt.TransactionHash}");
            }

            // Log the transaction
            await LogSmartContractActionAsync("SetDailyProfitTarget", receipt, web3.TransactionManager.Account.Address, contractAddress, target, $"Admin set daily profit target to {target} PM");
            return receipt.TransactionHash;
        }

        public async Task<string> UpdateGameStatsOnChainAsync(decimal roundVolume, decimal roundProfit)
        {
            var web3 = GetWeb3ClientWithAccount();
            var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];
            if (string.IsNullOrEmpty(contractAddress))
            {
                _logger.LogError("Blockchain configuration is missing (CentralHubGameAddress).");
                throw new InvalidOperationException("Server configuration error for blockchain interaction.");
            }

            const int decimals = 6;
            var multiplier = BigInteger.Pow(10, decimals);

            var volumeInSmallestUnit = Web3.Convert.ToWei(roundVolume, decimals);

            // QUAN TRỌNG: Sửa lỗi xử lý số âm.
            // Web3.Convert.ToWei không xử lý số âm đúng cách cho int256.
            // Chúng ta cần nhân thủ công để tạo ra BigInteger âm.
            // Chuyển decimal thành một số nguyên lớn trước khi nhân.
            var profitAsInteger = (BigInteger)(roundProfit * (decimal)multiplier);
            var profitInSmallestUnit = profitAsInteger;

            var updateStatsFunction = new UpdateGameStatsFunction
            {
                RoundVolume = volumeInSmallestUnit,
                RoundProfit = profitInSmallestUnit // Bây giờ giá trị này sẽ là số âm chính xác
            };
            var handler = web3.Eth.GetContractTransactionHandler<UpdateGameStatsFunction>();

            // Add retry logic for robustness
            int maxRetries = 3;
            for (int i = 0; i < maxRetries; i++)
            {
                try
                {
                    var receipt = await handler.SendRequestAndWaitForReceiptAsync(contractAddress, updateStatsFunction);
                    if (receipt.Status.Value == 1)
                    {
                        return receipt.TransactionHash;
                    }
                    throw new Exception($"Update game stats transaction failed with status {receipt.Status.Value}. TxHash: {receipt.TransactionHash}");
                }
                catch (Exception ex) when (i < maxRetries - 1)
                {
                    _logger.LogWarning(ex, "Attempt {Attempt} to update game stats failed. Retrying in 3 seconds...", i + 1);
                    await Task.Delay(3000);
                }
            }
            // If all retries fail, the last exception will be thrown.
            throw new Exception("Failed to update game stats after multiple retries.");
        }

        /// <summary> 
        /// Adjusts the on-chain game stats for a manual payout by calling `updateGameStats` with zero volume and a specific profit adjustment.
        /// </summary>
        /// <param name="profitAdjustment">The profit adjustment to apply (betAmount - payoutAmount).</param>
        /// <returns>The transaction hash of the stats update.</returns>
        public async Task<string> UpdateGameStatsWithManualPayout(decimal profitAdjustment)
        {
            return await UpdateGameStatsOnChainAsync(0, profitAdjustment);
        }

        public async Task LogSmartContractActionAsync(string eventType, Nethereum.RPC.Eth.DTOs.TransactionReceipt receipt, string from, string to, decimal amount, string eventData)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                var logEntry = new SmartContractLog
                {
                    EventType = eventType,
                    TransactionHash = receipt.TransactionHash,
                    BlockNumber = (long)receipt.BlockNumber.Value,
                    FromAddress = from,
                    ToAddress = to,
                    Amount = amount,
                    EventData = eventData,
                    Timestamp = DateTime.UtcNow
                };
                context.SmartContractLogs.Add(logEntry);
                await context.SaveChangesAsync();
                _logger.LogInformation("Logged admin action '{EventType}' to SmartContractLog. TxHash: {TxHash}", eventType, receipt.TransactionHash);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to log admin action for TxHash {TxHash}", receipt.TransactionHash);
            }
        }

        public async Task<bool> IsConnectedAsync()
        {
            try
            {
                var rpcUrl = _configuration["Blockchain:CoreChain:RpcUrl"];
                if (string.IsNullOrEmpty(rpcUrl))
                {
                    return false;
                }
                var web3 = new Web3(rpcUrl);
                var blockNumber = await web3.Eth.Blocks.GetBlockNumber.SendRequestAsync();
                return blockNumber.Value > 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to connect to blockchain node.");
                return false;
            }
        }

        public Task<string> GetContractAddressAsync()
        {
            var contractAddress = _configuration["Blockchain:CoreChain:ContractAddress"];
            return Task.FromResult(contractAddress ?? "0x0000000000000000000000000000000000000000");
        }

        public async Task<ContractStatsDto> GetContractStats()
        {
            try
            {
                var config = _configuration.GetSection("Blockchain:CoreChain");
                var rpcUrl = config["RpcUrl"];
                var contractAddress = config["CentralHubGameAddress"];

                if (string.IsNullOrEmpty(rpcUrl) || string.IsNullOrEmpty(contractAddress))
                {
                    _logger.LogError("Blockchain configuration (RpcUrl, ContractAddress) is missing.");
                    throw new InvalidOperationException("Server configuration error for contract stats.");
                }

                // Use a read-only client with an increased timeout
                var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
                // FIX: Correctly initialize Web3 with a custom HttpClient via an RpcClient.
                var rpcClient = new Nethereum.JsonRpc.Client.RpcClient(new Uri(rpcUrl), httpClient, null, null, _logger);
                var web3 = new Web3(rpcClient);

                // Create handlers for the contract functions
                var balanceHandler = web3.Eth.GetContractQueryHandler<GetTreasuryBalanceFunction>();
                var gameStatsHandler = web3.Eth.GetContractQueryHandler<GetGameStatsFunction>();

                // Call all functions in parallel for efficiency
                var balanceInWeiTask = balanceHandler.QueryAsync<BigInteger>(contractAddress!, new GetTreasuryBalanceFunction());
                var gameStatsTask = gameStatsHandler.QueryDeserializingToObjectAsync<GetGameStatsOutputDTO>(new GetGameStatsFunction(), contractAddress!);
                await Task.WhenAll(balanceInWeiTask, gameStatsTask);

                var balanceInWei = await balanceInWeiTask;
                var gameStats = await gameStatsTask;

                // Convert from Wei using 6 decimals as per the contract note
                const int decimals = 6;
                var divisor = BigInteger.Pow(10, decimals);
                
                var treasuryBalance = (decimal)balanceInWei / (decimal)divisor;
                var totalGameVolume = (decimal)gameStats.TotalGameVolume / (decimal)divisor;
                var totalGameProfit = (decimal)gameStats.TotalGameProfit / (decimal)divisor;
                var dailyProfitTarget = (decimal)gameStats.DailyProfitTarget / (decimal)divisor;
                var currentDailyProfit = (decimal)gameStats.CurrentDailyProfit / (decimal)divisor;

                // Calculate isProfitTargetMet on the server side
                var isProfitTargetMet = currentDailyProfit >= dailyProfitTarget;

                var statsDto = new ContractStatsDto
                {
                    // The contract doesn't distinguish between treasury and game machine balance. They are the same.
                    GameMachineBalance = treasuryBalance.ToString(CultureInfo.InvariantCulture),
                    TreasuryBalance = treasuryBalance.ToString(CultureInfo.InvariantCulture),
                    TotalGameVolume = totalGameVolume.ToString(CultureInfo.InvariantCulture),
                    TotalGameProfit = totalGameProfit.ToString(CultureInfo.InvariantCulture),
                    DailyProfitTarget = dailyProfitTarget.ToString(CultureInfo.InvariantCulture),
                    CurrentDailyProfit = currentDailyProfit.ToString(CultureInfo.InvariantCulture),
                    IsProfitTargetMet = isProfitTargetMet
                };

                return statsDto;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting contract stats from blockchain.");
                // Return a default/empty object on error to prevent frontend from crashing
                return new ContractStatsDto();
            }
        }

        public async Task ResetDailyProfitIfNeededAsync()
        {
            try
            {
                var web3 = GetWeb3ClientWithAccount();
                var contractAddress = _configuration["Blockchain:CoreChain:CentralHubGameAddress"];

                var lastResetDayHandler = web3.Eth.GetContractQueryHandler<LastResetDayFunction>();
                var lastResetDayFromContract = await lastResetDayHandler.QueryAsync<BigInteger>(contractAddress, new LastResetDayFunction());

                // The contract stores the number of days since the Unix epoch.
                // We calculate the current number of days since the epoch.
                var currentDaySinceEpoch = (long)(DateTimeOffset.UtcNow.ToUnixTimeSeconds() / 86400);

                if (currentDaySinceEpoch > lastResetDayFromContract)
                {
                    _logger.LogInformation("New day detected. Last reset was on day {LastResetDay}, current day is {CurrentDay}. Attempting to reset daily profit.", lastResetDayFromContract, currentDaySinceEpoch);

                    var resetHandler = web3.Eth.GetContractTransactionHandler<ResetDailyProfitFunction>();
                    var resetFunctionMessage = new ResetDailyProfitFunction();
                    
                    // FIX: The transaction was being sent twice. This has been corrected.
                    var receipt = await resetHandler.SendRequestAndWaitForReceiptAsync(contractAddress, resetFunctionMessage);

                    if (receipt.Status.Value == 1)
                    {
                        _logger.LogInformation("✅ Daily profit successfully reset. Transaction: {TxHash}", receipt.TransactionHash);
                    }
                    else
                    {
                        _logger.LogError("❌ Failed to reset daily profit. Transaction: {TxHash}, Status: {Status}", receipt.TransactionHash, receipt.Status.Value);
                    }
                }
                else
                {
                    _logger.LogDebug("Daily profit is already up-to-date for day {CurrentDay}. No reset needed.", currentDaySinceEpoch);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "An error occurred in ResetDailyProfitIfNeededAsync.");
                throw;
            }
        }

        public async Task<bool> IsContractOwnerAsync(string walletAddress)
        {
            var config = _configuration.GetSection("Blockchain:CoreChain");
            var rpcUrl = config["RpcUrl"];
            var contractAddress = config["CentralHubGameAddress"];

            if (string.IsNullOrEmpty(rpcUrl) || string.IsNullOrEmpty(contractAddress) || string.IsNullOrEmpty(walletAddress))
            {
                _logger.LogWarning("Cannot check contract ownership due to missing configuration or wallet address.");
                return false;
            }

            try
            {
                // Use a read-only client with an increased timeout
                var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
                // FIX: Correctly initialize Web3 with a custom HttpClient via an RpcClient.
                var rpcClient = new Nethereum.JsonRpc.Client.RpcClient(new Uri(rpcUrl!), httpClient, null, null, _logger);
                var web3 = new Web3(rpcClient);
                var ownerFunction = new OwnerFunction();
                var ownerHandler = web3.Eth.GetContractQueryHandler<OwnerFunction>();
                var contractOwner = await ownerHandler.QueryAsync<string>(contractAddress, ownerFunction);

                return walletAddress.Equals(contractOwner, StringComparison.OrdinalIgnoreCase);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking contract ownership for address {WalletAddress}", walletAddress);
                return false;
            }
        }
    }
}
