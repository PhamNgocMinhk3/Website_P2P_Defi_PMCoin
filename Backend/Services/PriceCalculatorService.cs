using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface IPriceCalculatorService
    {
        Task<PriceCalculationDto> CalculateExchangeAsync(string sellToken, string buyToken, decimal sellAmount);
        Task<decimal> GetTokenPriceAsync(string token);
        Task<Dictionary<string, decimal>> GetAllTokenPricesAsync();
        Task<bool> ValidateTokenPairAsync(string sellToken, string buyToken);
    }

    public class PriceCalculatorService : IPriceCalculatorService
    {
        private readonly IBinancePriceService _binancePriceService;
        private readonly IPMCoinPriceService _pmCoinPriceService;
        private readonly ILogger<PriceCalculatorService> _logger;

        public PriceCalculatorService(
            IBinancePriceService binancePriceService,
            IPMCoinPriceService pmCoinPriceService,
            ILogger<PriceCalculatorService> logger)
        {
            _binancePriceService = binancePriceService;
            _pmCoinPriceService = pmCoinPriceService;
            _logger = logger;
        }

        public async Task<PriceCalculationDto> CalculateExchangeAsync(string sellToken, string buyToken, decimal sellAmount)
        {
            try
            {
                sellToken = sellToken.ToUpper();
                buyToken = buyToken.ToUpper();

                _logger.LogInformation("Calculating exchange: {SellAmount} {SellToken} -> {BuyToken}", 
                    sellAmount, sellToken, buyToken);

                // Validate tokens
                if (!await ValidateTokenPairAsync(sellToken, buyToken))
                {
                    throw new ArgumentException($"Invalid token pair: {sellToken}/{buyToken}");
                }

                // Get prices for both tokens
                var sellTokenPrice = await GetTokenPriceAsync(sellToken);
                var buyTokenPrice = await GetTokenPriceAsync(buyToken);

                if (sellTokenPrice <= 0 || buyTokenPrice <= 0)
                {
                    throw new InvalidOperationException($"Unable to fetch prices for {sellToken}/{buyToken}");
                }

                // Calculate exchange rate and buy amount
                var exchangeRate = sellTokenPrice / buyTokenPrice;
                var buyAmount = sellAmount * exchangeRate;

                var result = new PriceCalculationDto
                {
                    SellToken = sellToken,
                    BuyToken = buyToken,
                    SellAmount = sellAmount,
                    BuyAmount = Math.Round(buyAmount, 8), // Round to 8 decimal places
                    ExchangeRate = Math.Round(exchangeRate, 8),
                    SellTokenPrice = sellTokenPrice,
                    BuyTokenPrice = buyTokenPrice,
                    CalculatedAt = DateTime.UtcNow
                };

                _logger.LogInformation("Exchange calculated: {SellAmount} {SellToken} (${SellPrice}) -> {BuyAmount} {BuyToken} (${BuyPrice})", 
                    sellAmount, sellToken, sellTokenPrice, buyAmount, buyToken, buyTokenPrice);

                return result;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating exchange for {SellAmount} {SellToken} -> {BuyToken}", 
                    sellAmount, sellToken, buyToken);
                throw;
            }
        }

        public async Task<decimal> GetTokenPriceAsync(string token)
        {
            try
            {
                token = token.ToUpper();

                return token switch
                {
                    SupportedTokens.PM => await _pmCoinPriceService.GetPMCoinPriceAsync(),
                    SupportedTokens.BTC => await _binancePriceService.GetTokenPriceAsync(token),
                    SupportedTokens.ETH => await _binancePriceService.GetTokenPriceAsync(token),
                    SupportedTokens.VND => 1.0m / 26000m, // VND price in USD (1 VND = 1/26000 USD)
                    _ => throw new ArgumentException($"Unsupported token: {token}")
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching price for token: {Token}", token);
                throw;
            }
        }

        public async Task<Dictionary<string, decimal>> GetAllTokenPricesAsync()
        {
            try
            {
                var prices = new Dictionary<string, decimal>();

                // Get PM coin price
                prices[SupportedTokens.PM] = await _pmCoinPriceService.GetPMCoinPriceAsync();

                // Get Binance prices for crypto tokens only
                var binanceTokens = new[] { SupportedTokens.BTC, SupportedTokens.ETH };
                var binancePrices = await _binancePriceService.GetMultipleTokenPricesAsync(binanceTokens);

                // Add VND as fiat currency (1 VND = 1/26000 USD)
                prices[SupportedTokens.VND] = 1.0m / 26000m;

                foreach (var price in binancePrices)
                {
                    prices[price.Key] = price.Value;
                }

                _logger.LogInformation("Fetched prices for {Count} tokens", prices.Count);
                return prices;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching all token prices");
                throw;
            }
        }

        public async Task<bool> ValidateTokenPairAsync(string sellToken, string buyToken)
        {
            try
            {
                sellToken = sellToken.ToUpper();
                buyToken = buyToken.ToUpper();

                // Check if both tokens are supported
                if (!SupportedTokens.IsSupported(sellToken) || !SupportedTokens.IsSupported(buyToken))
                {
                    _logger.LogWarning("Unsupported token in pair: {SellToken}/{BuyToken}", sellToken, buyToken);
                    return false;
                }

                // Prevent same token trading
                if (sellToken == buyToken)
                {
                    _logger.LogWarning("Cannot trade same token: {Token}", sellToken);
                    return false;
                }

                // Additional validation rules can be added here
                // For example, certain token pairs might be restricted
                await Task.Delay(1); // Simulate async validation

                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error validating token pair: {SellToken}/{BuyToken}", sellToken, buyToken);
                return false;
            }
        }
    }
}
