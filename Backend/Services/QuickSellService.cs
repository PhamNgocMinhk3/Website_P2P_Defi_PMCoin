using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Nethereum.Web3;
using Nethereum.Web3.Accounts;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Numerics;
using Nethereum.Util;
using System.Threading.Tasks;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    // Define the configuration model for a token
    public class TokenConfig
    {
        public string Address { get; set; } = string.Empty;
        public int Decimals { get; set; }
    }

    public class QuickSellService : IQuickSellService
    {
        private readonly ILogger<QuickSellService> _logger;
        private readonly IConfiguration _configuration;
        private readonly string _quickSellContractAddress;
        private readonly string _quickSellContractAbi;
        private readonly Dictionary<string, (string address, int decimals)> _supportedTokens;
        private readonly IBinancePriceService _binancePriceService;
        private readonly IPMCoinPriceService _pmCoinPriceService; // ADDED

        public QuickSellService(IConfiguration configuration, ILogger<QuickSellService> logger, IBinancePriceService binancePriceService, IPMCoinPriceService pmCoinPriceService) // MODIFIED
        {
            _logger = logger;
            _configuration = configuration;
            _binancePriceService = binancePriceService;
            _pmCoinPriceService = pmCoinPriceService; // ADDED

            var coreChainConfig = _configuration.GetSection("Blockchain:CoreChain");
            var quickSellAddress = coreChainConfig["QuickSellContractAddress"];
            var quickSellAbiPath = coreChainConfig["QuickSellContractAbiPath"];
            var erc20AbiPath = coreChainConfig["Erc20AbiPath"];

            // Validate that all required configuration values are present.
            if (string.IsNullOrEmpty(quickSellAddress) || string.IsNullOrEmpty(quickSellAbiPath) || string.IsNullOrEmpty(erc20AbiPath))
            {
                throw new InvalidOperationException("One or more required QuickSell settings (QuickSellContractAddress, QuickSellContractAbiPath, Erc20AbiPath) are missing from the configuration.");
            }

            _quickSellContractAddress = quickSellAddress;
            _quickSellContractAbi = System.IO.File.ReadAllText(quickSellAbiPath);

            // Load supported tokens from configuration
            _supportedTokens = new Dictionary<string, (string address, int decimals)>(StringComparer.OrdinalIgnoreCase);
            var tokensConfig = _configuration.GetSection("Blockchain:CoreChain:Tokens").Get<Dictionary<string, TokenConfig>>() ?? new Dictionary<string, TokenConfig>();
            foreach (var token in tokensConfig)
            {
                _supportedTokens[token.Key] = (token.Value.Address, token.Value.Decimals);
            }
        }

        private (Web3 web3, Account account) GetWeb3Client()
        {
            var coreChainConfig = _configuration.GetSection("Blockchain:CoreChain");
            var rpcUrl = coreChainConfig["RpcUrl"];
            var privateKey = coreChainConfig["BackendWalletPrivateKey"];

            if (string.IsNullOrEmpty(rpcUrl) || string.IsNullOrEmpty(privateKey))
            {
                throw new InvalidOperationException("RpcUrl or BackendWalletPrivateKey is missing from configuration.");
            }

            var account = new Account(privateKey);
            var web3 = new Web3(account, rpcUrl);

            // CRITICAL FIX: Workaround for tcore network to avoid OverflowException during fee calculation.
            // This forces Nethereum to use legacy transactions and a fixed gas price.
            web3.TransactionManager.UseLegacyAsDefault = true;
            web3.TransactionManager.DefaultGasPrice = Web3.Convert.ToWei(20, UnitConversion.EthUnit.Gwei);
            // FIX: Set a higher default gas limit to prevent 'intrinsic gas too low' errors for contract interactions.
            web3.TransactionManager.DefaultGas = 300000;

            return (web3, account);
        }

        public async Task<Dictionary<string, decimal>> GetExchangeRatesAsync()
        {
            var rates = new Dictionary<string, decimal>();
            var (web3, _) = GetWeb3Client();
            var contract = web3.Eth.GetContract(_quickSellContractAbi, _quickSellContractAddress);
            var getRateFunction = contract.GetFunction("exchangeRates");
            var vndTDecimals = _supportedTokens["VNDT"].decimals;
            
            foreach (var token in _supportedTokens)
            {
                if (token.Key.Equals("VNDT", StringComparison.OrdinalIgnoreCase)) continue;

                var rateBigInt = await getRateFunction.CallAsync<BigInteger>(token.Value.address);
                
                if (rateBigInt > 0)
                {
                    // The rate is now pre-calculated by the admin to handle decimals.
                    // To display a human-readable rate (e.g., 1 BTC = 2,000,000,000 VNDT),
                    // we need to adjust it based on the token's decimals.
                    var priceInVNDT = (decimal)rateBigInt / (decimal)BigInteger.Pow(10, token.Value.decimals);
                    rates[token.Key] = priceInVNDT;
                }
            }
            return rates;
        }

        // Helper to get token balance
        private async Task<decimal> GetTokenBalance(string tokenAddress, string ownerAddress, int decimals)
        {
            var erc20AbiPath = _configuration["Blockchain:CoreChain:Erc20AbiPath"] ?? throw new InvalidOperationException("Erc20AbiPath is not configured.");
            var erc20Abi = await System.IO.File.ReadAllTextAsync(erc20AbiPath);
            var (web3, _) = GetWeb3Client();
            var tokenContract = web3.Eth.GetContract(erc20Abi, tokenAddress);
            var balanceOfFunction = tokenContract.GetFunction("balanceOf");

            // CRITICAL FIX: Query against the "pending" block to bypass RPC caching and get the absolute latest state.
            // Public RPC nodes often cache "latest" block results, leading to stale data being returned after a recent transaction.
            // FIX: Explicitly create a BlockParameter for the "pending" state. The default constructor uses "latest".
            var pendingBlock = Nethereum.RPC.Eth.DTOs.BlockParameter.CreatePending();
            var balanceBigInt = await balanceOfFunction.CallAsync<BigInteger>(pendingBlock, ownerAddress);
            return (decimal)balanceBigInt / (decimal)BigInteger.Pow(10, decimals);
        }

        // Helper to get allowance
        private async Task<decimal> GetAllowance(string tokenAddress, string ownerAddress, string spenderAddress, int decimals)
        {
            var erc20AbiPath = _configuration["Blockchain:CoreChain:Erc20AbiPath"] ?? throw new InvalidOperationException("Erc20AbiPath is not configured.");
            var erc20Abi = await System.IO.File.ReadAllTextAsync(erc20AbiPath);
            var (web3, _) = GetWeb3Client();
            var tokenContract = web3.Eth.GetContract(erc20Abi, tokenAddress);
            var allowanceFunction = tokenContract.GetFunction("allowance");
            // CRITICAL FIX: Query against the "pending" block to bypass RPC caching.
            // FIX: Explicitly create a BlockParameter for the "pending" state.
            var pendingBlock = Nethereum.RPC.Eth.DTOs.BlockParameter.CreatePending();
            var allowanceBigInt = await allowanceFunction.CallAsync<BigInteger>(pendingBlock, ownerAddress, spenderAddress);
            return (decimal)allowanceBigInt / (decimal)BigInteger.Pow(10, decimals);
        }


        public async Task<QuickSellContractStatus> GetContractStatusAsync()
        {
            var status = new QuickSellContractStatus();
            var erc20AbiPath = _configuration["Blockchain:CoreChain:Erc20AbiPath"] ?? throw new InvalidOperationException("Erc20AbiPath is not configured.");
            var (web3, _) = GetWeb3Client();
            var erc20Abi = await System.IO.File.ReadAllTextAsync(erc20AbiPath);

            foreach (var token in _supportedTokens)
            {
                try
                {
                    var tokenContract = web3.Eth.GetContract(erc20Abi, token.Value.address);
                    var balanceFunction = tokenContract.GetFunction("balanceOf");
                    var balanceBigInt = await balanceFunction.CallAsync<BigInteger>(_quickSellContractAddress);

                    var balanceDecimal = (decimal)balanceBigInt / (decimal)BigInteger.Pow(10, token.Value.decimals);
                    status.Balances[token.Key] = balanceDecimal;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Failed to get balance for token {TokenSymbol} in QuickSell contract.", token.Key);
                    status.Balances[token.Key] = -1; // Indicate error
                }
            }
            return status;
        }

        public async Task<string> DepositVNDTAsync(decimal amount)
        {
            if (amount <= 0)
            {
                throw new ArgumentException("Amount must be greater than zero.");
            }

            var (web3, adminAccount) = GetWeb3Client();
            var contract = web3.Eth.GetContract(_quickSellContractAbi, _quickSellContractAddress);
            
            // REVERT FIX: The function name is indeed `depositVNDT` as originally intended.
            var depositFunction = contract.GetFunction("depositVNDT");
            
            var vndTDecimals = _supportedTokens["VNDT"].decimals;
            // CRITICAL FIX: The manual calculation `new BigInteger(amount * (decimal)multiplier)` causes an overflow
            // for large `amount` values because the intermediate result exceeds the capacity of the `decimal` type.
            // Use Nethereum's built-in `Web3.Convert.ToWei` utility, which is designed to handle large numbers safely
            // and correctly convert them to the smallest unit (Wei/Satoshis) as a BigInteger.
            var amountBigInt = Web3.Convert.ToWei(amount, vndTDecimals);

            // First, check and approve the QuickSell contract to spend VNDT from admin's wallet
            var vndTokenAddress = _supportedTokens["VNDT"].address;

            // Log initial state
            var initialAdminVNDTBalance = await GetTokenBalance(vndTokenAddress, adminAccount.Address, vndTDecimals);
            var initialContractVNDTBalance = await GetTokenBalance(vndTokenAddress, _quickSellContractAddress, vndTDecimals);
            var initialAllowance = await GetAllowance(vndTokenAddress, adminAccount.Address, _quickSellContractAddress, vndTDecimals);
            _logger.LogInformation("--- Deposit VNDT Process Start ---");
            _logger.LogInformation("Initial: Admin VNDT Balance: {AdminBalance}, Contract VNDT Balance: {ContractBalance}, Current Allowance: {Allowance}", initialAdminVNDTBalance, initialContractVNDTBalance, initialAllowance);
            _logger.LogInformation("Admin depositing {Amount} VNDT into QuickSell contract.", amount);
            var erc20Abi = System.IO.File.ReadAllText(_configuration["Blockchain:CoreChain:Erc20AbiPath"]!);
            var vndTokenContract = web3.Eth.GetContract(erc20Abi, vndTokenAddress);
            var approveFunction = vndTokenContract.GetFunction("approve");
            
            // ROBUSTNESS FIX: Always approve the exact amount before depositing.
            // This avoids issues with stale allowance data from RPC nodes and ensures each deposit
            // is a self-contained, two-step process (approve, then deposit).
            // This is more reliable than checking the current allowance.
            _logger.LogInformation("Approving QuickSell contract to spend {Amount} VNDT.", amount);
            // CRITICAL FIX: Remove named parameters and pass nulls positionally. This resolves the CS1739 build error
            // by letting the compiler choose the correct overload, making the code more resilient to Nethereum library updates.
            // The parameters are (from, gas, value, cancellationToken, functionInputs...).
            var approvalReceipt = await approveFunction.SendTransactionAndWaitForReceiptAsync(adminAccount.Address, null, null, null, _quickSellContractAddress, amountBigInt);

            _logger.LogInformation("Approval transaction sent. TxHash: {TxHash}, Status: {Status}", approvalReceipt.TransactionHash, approvalReceipt.Status.Value);

            // CRITICAL FIX: Check if the approval transaction was successful before proceeding.
            if (approvalReceipt.Status.Value != 1)
            {
                throw new Exception($"Failed to approve token spending. Transaction failed with status {approvalReceipt.Status.Value}. TxHash: {approvalReceipt.TransactionHash}");
            }
            _logger.LogInformation("Approval successful. Waiting for network propagation...");
            // Add a short delay to allow the approval to propagate on the network.
            await Task.Delay(3000); // Wait for 3 seconds.

            // Then, call the depositVNDT function on the QuickSell contract
            // REVERT FIX: Call the correct `depositVNDT` function which only takes the amount as a parameter.
            // CRITICAL FIX: Also use positional nulls here to resolve the build error and allow for automatic gas estimation.
            var transactionReceipt = await depositFunction.SendTransactionAndWaitForReceiptAsync(adminAccount.Address, null, null, null, amountBigInt);

            _logger.LogInformation("Deposit transaction sent. TxHash: {TxHash}, Status: {Status}", transactionReceipt.TransactionHash, transactionReceipt.Status.Value);

            // CRITICAL FIX: Check the status of the final deposit transaction as well.
            if (transactionReceipt.Status.Value != 1)
            {
                throw new Exception($"Failed to deposit VNDT. The transaction was reverted by the smart contract. Status: {transactionReceipt.Status.Value}. TxHash: {transactionReceipt.TransactionHash}");
            }
            _logger.LogInformation("Deposit successful. TxHash: {TxHash}", transactionReceipt.TransactionHash);

            // Log final state
            var finalAdminVNDTBalance = await GetTokenBalance(vndTokenAddress, adminAccount.Address, vndTDecimals);
            var finalContractVNDTBalance = await GetTokenBalance(vndTokenAddress, _quickSellContractAddress, vndTDecimals);
            var finalAllowance = await GetAllowance(vndTokenAddress, adminAccount.Address, _quickSellContractAddress, vndTDecimals);
            _logger.LogInformation("Final: Admin VNDT Balance: {AdminBalance}, Contract VNDT Balance: {ContractBalance}, Final Allowance: {Allowance}", finalAdminVNDTBalance, finalContractVNDTBalance, finalAllowance);
            _logger.LogInformation("--- Deposit VNDT Process End ---");

            return transactionReceipt.TransactionHash;
        }

        public async Task<string> WithdrawTokensAsync(string tokenSymbol)
        {
            if (!_supportedTokens.TryGetValue(tokenSymbol, out var tokenInfo))
            {
                throw new ArgumentException($"Token '{tokenSymbol}' is not supported.");
            }

            var (web3, adminAccount) = GetWeb3Client();
            var contract = web3.Eth.GetContract(_quickSellContractAbi, _quickSellContractAddress);
            var withdrawFunction = contract.GetFunction("withdrawTokens");

            _logger.LogInformation("Admin withdrawing all {TokenSymbol} from QuickSell contract.", tokenSymbol);
            var transactionReceipt = await withdrawFunction.SendTransactionAndWaitForReceiptAsync(adminAccount.Address, null, null, null, tokenInfo.address);

            // CRITICAL FIX: Check the status of the withdrawal transaction.
            if (transactionReceipt.Status.Value != 1)
            {
                throw new Exception($"Failed to withdraw {tokenSymbol}. The transaction was reverted by the smart contract. Status: {transactionReceipt.Status.Value}. TxHash: {transactionReceipt.TransactionHash}");
            }

            return transactionReceipt.TransactionHash;
        }

        public async Task<string> SetExchangeRateAsync(string tokenSymbol, decimal? manualRate = null)
        {
            if (!_supportedTokens.TryGetValue(tokenSymbol, out var tokenInfo))
            {
                throw new ArgumentException($"Token '{tokenSymbol}' is not supported.");
            }

            var (web3, adminAccount) = GetWeb3Client();
            var contract = web3.Eth.GetContract(_quickSellContractAbi, _quickSellContractAddress);
            var setRateFunction = contract.GetFunction("setExchangeRate");

            decimal rateInVndt;

            if (manualRate.HasValue && manualRate.Value >= 0)
            {
                rateInVndt = manualRate.Value;
                _logger.LogInformation("Using manually provided rate for {TokenSymbol}: {Rate} VNDT", tokenSymbol, rateInVndt);
            }
            else
            {
                decimal priceInUsd;
                // CRITICAL FIX: Use the correct price service based on the token symbol.
                if (tokenSymbol.Equals("PM", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogInformation("Fetching latest price for PM from internal PMCoinPriceService.");
                    priceInUsd = await _pmCoinPriceService.GetPMCoinPriceAsync();
                }
                else
                {
                    _logger.LogInformation("Fetching latest price for {TokenSymbol} from Binance.", tokenSymbol);
                    priceInUsd = await _binancePriceService.GetTokenPriceAsync(tokenSymbol);
                }

                var usdToVndtRate = _configuration.GetValue<decimal>("AppSettings:UsdToVndtRate", 25545);
                rateInVndt = priceInUsd * usdToVndtRate;
                _logger.LogInformation("Calculated rate for {TokenSymbol}: 1 {TokenSymbol} = {Rate} VNDT (via price ${PriceUsd})", tokenSymbol, tokenSymbol, rateInVndt, priceInUsd);
            }

            var vndTDecimals = _supportedTokens["VNDT"].decimals;
            var tokenDecimals = tokenInfo.decimals;

            // --- DEBUG LOGGING: Start ---
            // --- DEBUG LOGGING: Start ---
            _logger.LogInformation("[DEBUG] SetExchangeRateAsync for {TokenSymbol}:", tokenSymbol);
            _logger.LogInformation("[DEBUG] 1. Human-readable rate (rateInVndt): {Rate}", rateInVndt);
            _logger.LogInformation("[DEBUG] 1.5. Token Address being sent: {TokenAddress}", tokenInfo.address); // ADD THIS LOG
            _logger.LogInformation("[DEBUG] 1.6. VNDT Decimals: {VNDTDecimals}", vndTDecimals); // ADD THIS LOG
            _logger.LogInformation("[DEBUG] 1.7. Token Decimals: {TokenDecimals}", tokenDecimals); // ADD THIS LOG

            // The contract calculates: amountOut = (amountIn * exchangeRate) / (10 ** tokenInDecimals).
            // To get the correct amountOut in VNDT units, the exchangeRate must be pre-scaled by the VNDT decimals.
            // onChainRate = humanReadableRate * (10^vnd_decimals)
            var scaledRate = rateInVndt * (decimal)BigInteger.Pow(10, vndTDecimals);_logger.LogInformation("[DEBUG] 2. Scaled rate (rateInVndt * 10^`{`VndtDecimals`}`): `{`ScaledRate`}`", vndTDecimals, scaledRate);

            var onChainRateString = scaledRate.ToString("F0", CultureInfo.InvariantCulture);
            var onChainRate = BigInteger.Parse(onChainRateString);
            _logger.LogInformation("[DEBUG] 3. Final on-chain rate (as string to be parsed): {OnChainRateString}", onChainRateString); // ADD THIS LOG
            _logger.LogInformation("[DEBUG] 4. Final on-chain rate (BigInteger to be sent): {OnChainRate} (Type: `{`Type`}`)", onChainRate, onChainRate.GetType().Name); // ADD TYPE LOG
            // --- DEBUG LOGGING: End ---

            _logger.LogInformation("Setting on-chain rate for {TokenSymbol} to {OnChainRate}", tokenSymbol, onChainRate);

            var transactionReceipt = await setRateFunction.SendTransactionAndWaitForReceiptAsync(adminAccount.Address, null, null, null, tokenInfo.address, onChainRate);

            // CRITICAL FIX: Check if the transaction to set the exchange rate was successful.
            if (transactionReceipt.Status.Value != 1)
            {
                throw new Exception($"Failed to set exchange rate for {tokenSymbol}. Transaction reverted by smart contract. Status: {transactionReceipt.Status.Value}. TxHash: {transactionReceipt.TransactionHash}");
            }

            return transactionReceipt.TransactionHash;
        }
    }
}