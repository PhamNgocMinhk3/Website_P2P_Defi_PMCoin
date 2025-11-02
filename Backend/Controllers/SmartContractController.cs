using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Models.Configuration;
using System.Threading.Tasks;
using System;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;
using System.Numerics;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;
using Nethereum.Contracts;
using Nethereum.ABI.FunctionEncoding.Attributes;

// DTO for the owner() function from Ownable contracts
[Function("owner", "address")]
public class OwnerFunction : FunctionMessage { }

// DTO for the admin to withdraw funds from the treasury to their own wallet.
// This matches the frontend request.
public class TreasuryWithdrawRequest
{
    public decimal Amount { get; set; }
}

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class SmartContractController : ControllerBase
    {
        private readonly ILogger<SmartContractController> _logger;
        private readonly IConfiguration _configuration;
        private readonly ISmartContractService _smartContractService;
        private readonly TradeFinanceDbContext _context;

        public SmartContractController(
            ILogger<SmartContractController> logger,
            IConfiguration configuration,
            ISmartContractService smartContractService,
            TradeFinanceDbContext context)
        {
            _logger = logger;
            _configuration = configuration;
            _smartContractService = smartContractService;
            _context = context;
        }

        [HttpGet("contract-stats")]
        public async Task<IActionResult> GetContractStats()
        {
            try
            {
                var stats = await _smartContractService.GetContractStats();
                return Ok(stats);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting contract stats");
                return StatusCode(500, "Internal server error");
            }
        }

        [HttpGet("admin-access")]
        public async Task<IActionResult> CheckAdminAccess([FromQuery] string walletAddress)
        {
            try
            {
                var blockchainConfig = _configuration.GetSection("Blockchain:CoreChain");
                var rpcUrl = blockchainConfig["RpcUrl"];
                var contractAddress = blockchainConfig["CentralHubGameAddress"];

                if (string.IsNullOrEmpty(rpcUrl) || string.IsNullOrEmpty(contractAddress) || string.IsNullOrEmpty(walletAddress))
                {
                    return BadRequest(new { error = "Missing configuration or wallet address." });
                }

                // This contract uses Ownable for admin functions. We must call the `owner()` function.
                var web3 = new Web3(rpcUrl);
                var ownerFunction = new OwnerFunction();
                var ownerHandler = web3.Eth.GetContractQueryHandler<OwnerFunction>();
                var contractOwner = await ownerHandler.QueryAsync<string>(contractAddress, ownerFunction);

                var isOwner = walletAddress.Equals(contractOwner, StringComparison.OrdinalIgnoreCase);

                return Ok(new
                {
                    isOwner = isOwner,
                    ownerAddress = contractOwner,
                    connectedAddress = walletAddress,
                    hasAccess = isOwner
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error checking admin access for wallet: {WalletAddress}", walletAddress);
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("emergency-payout")]
        [Authorize(Roles = "Admin")] // SECURE THIS ENDPOINT
        public async Task<IActionResult> EmergencyPayout([FromBody] EmergencyPayoutRequest request)
        {
            _logger.LogInformation("🚨 Emergency payout requested - Player: {PlayerAddress}, Amount: {Amount} PM",
                request.PlayerAddress, request.Amount);

            if (string.IsNullOrEmpty(request.PlayerAddress) || request.Amount <= 0)
            {
                return BadRequest(new { error = "Invalid player address or amount" });
            }

            try
            {
                // THÊM BƯỚC KIỂM TRA SỐ DƯ TRƯỚC KHI GỌI CONTRACT
                var stats = await _smartContractService.GetContractStats();
                var contractBalanceString = stats.TreasuryBalance.Replace(',', '.');
                var contractBalance = decimal.Parse(contractBalanceString, System.Globalization.CultureInfo.InvariantCulture);

                if (contractBalance < request.Amount)
                {
                    _logger.LogError("🚨 Emergency payout PRE-CHECK FAILED. Insufficient funds. Requested: {Amount}, Balance: {Balance}", request.Amount, contractBalance);
                    return StatusCode(400, new { success = false, error = "Insufficient contract balance", message = $"Contract has only {contractBalance} PM, but {request.Amount} PM was requested." });
                }

                // Refactored: Call the dedicated service method
                var txHash = await _smartContractService.EmergencyPayoutAsync(request.Amount, request.PlayerAddress);

                _logger.LogInformation("✅ Emergency payout successful. TxHash: {TxHash}", txHash);

                return Ok(new { success = true, transactionHash = txHash, message = "Emergency payout successful and logged." });
            }
            catch (Nethereum.Contracts.SmartContractCustomErrorRevertException customError)
            {
                _logger.LogError(customError, "Smart contract revert error during emergency payout for {PlayerAddress}: {ErrorMessage}", request.PlayerAddress, customError.Message);
                return StatusCode(500, new { success = false, error = "Smart contract error", message = customError.Message });
            }
            catch (Nethereum.JsonRpc.Client.RpcResponseException rpcEx)
            {
                _logger.LogError(rpcEx, "RPC error during emergency payout for {PlayerAddress}: {RpcError}", request.PlayerAddress, rpcEx.RpcError.Message);
                return StatusCode(500, new { success = false, error = "Blockchain RPC error", message = rpcEx.RpcError.Message });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Generic error processing emergency payout for player: {PlayerAddress}", request.PlayerAddress);
                return StatusCode(500, new { success = false, error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("update-from-smart-contract")]
        public IActionResult UpdateFromSmartContract([FromBody] SmartContractUpdateRequest request)
        {
            try
            {
                _logger.LogInformation("🔄 Updating database from smart contract data for address: {Address}", request.Address);

                if (string.IsNullOrEmpty(request.Address))
                {
                    return BadRequest(new { error = "Address is required" });
                }

                _logger.LogInformation("📊 Smart contract data received - Wallet: {WalletBalance} PM, Internal: {InternalBalance} PM",
                    request.WalletBalance, request.InternalBalance);

                var response = new
                {
                    success = true,
                    message = "Database updated successfully from smart contract",
                    address = request.Address,
                    walletBalance = request.WalletBalance,
                    internalBalance = request.InternalBalance,
                    timestamp = DateTime.UtcNow,
                    contractStats = request.ContractStats
                };

                _logger.LogInformation("✅ Database update completed for address: {Address}", request.Address);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating database from smart contract for address: {Address}", request.Address);
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("sync-metamask-balance")]
        public IActionResult SyncMetaMaskBalance([FromBody] MetaMaskSyncRequest request)
        {
            try
            {
                _logger.LogInformation("🔄 Syncing MetaMask balance to database for address: {Address}", request.Address);

                if (string.IsNullOrEmpty(request.Address))
                {
                    return BadRequest(new { error = "Address is required" });
                }

                _logger.LogInformation("💰 MetaMask balance data - Wallet: {WalletBalance} PM, Internal: {InternalBalance} PM",
                    request.WalletBalance, request.InternalBalance);

                var response = new
                {
                    success = true,
                    message = "MetaMask balance synced successfully",
                    address = request.Address,
                    walletBalance = request.WalletBalance,
                    internalBalance = request.InternalBalance,
                    timestamp = DateTime.UtcNow
                };

                _logger.LogInformation("✅ MetaMask balance sync completed for address: {Address}", request.Address);
                return Ok(response);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error syncing MetaMask balance for address: {Address}", request.Address);
                return StatusCode(500, new { error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("deposit-treasury")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> DepositToTreasury([FromBody] TreasuryRequest request)
        {
            try
            {
                var txHash = await _smartContractService.DepositToTreasuryAsync(request.Amount);
                _logger.LogInformation("✅ Treasury deposit successful. TxHash: {TxHash}", txHash);
                return Ok(new { success = true, transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing treasury deposit");
                return StatusCode(500, new { success = false, error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("withdraw-treasury")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> WithdrawFromTreasury([FromBody] TreasuryWithdrawRequest request)
        {
            try
            {
                var txHash = await _smartContractService.WithdrawFromTreasuryAsync(request.Amount);
                _logger.LogInformation("✅ Treasury withdrawal successful. TxHash: {TxHash}", txHash);
                return Ok(new { success = true, transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error processing treasury withdrawal");
                return StatusCode(500, new { success = false, error = "Internal server error", message = ex.Message });
            }
        }

        [HttpPost("set-daily-target")]
        [Authorize(Roles = "Admin")]
        public async Task<IActionResult> SetDailyProfitTarget([FromBody] DailyTargetRequest request)
        {
            try
            {
                var txHash = await _smartContractService.SetDailyProfitTargetAsync(request.Target);
                _logger.LogInformation("✅ Daily profit target set successfully. TxHash: {TxHash}", txHash);
                return Ok(new { success = true, transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting daily profit target");
                return StatusCode(500, new { success = false, error = "Internal server error", message = ex.Message });
            }
        }
    }

    public class EmergencyPayoutRequest
    {
        public string PlayerAddress { get; set; } = string.Empty;
        public decimal Amount { get; set; }
        public string? Description { get; set; }
    }

    public class SmartContractUpdateRequest
    {
        public string Address { get; set; } = string.Empty;
        public string WalletBalance { get; set; } = string.Empty;
        public string InternalBalance { get; set; } = string.Empty;
        public object? ContractStats { get; set; }
        public string Timestamp { get; set; } = string.Empty;
    }

    public class MetaMaskSyncRequest
    {
        public string Address { get; set; } = string.Empty;
        public string WalletBalance { get; set; } = string.Empty;
        public string InternalBalance { get; set; } = string.Empty;
        public string Timestamp { get; set; } = string.Empty;
    }

    // DTO for admin actions
    public class TreasuryRequest
    {
        public decimal Amount { get; set; }
    }

    public class DailyTargetRequest
    {
        public decimal Target { get; set; }
    }
}
