using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System;
using System.Threading.Tasks;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/quicksell")]
    public class QuickSellController : ControllerBase
    {
        private readonly IQuickSellService _quickSellService;
        private readonly ILogger<QuickSellController> _logger;

        public QuickSellController(IQuickSellService quickSellService, ILogger<QuickSellController> logger)
        {
            _quickSellService = quickSellService;
            _logger = logger;
        }

        [HttpGet("rates")]
        public async Task<IActionResult> GetExchangeRates()
        {
            try
            {
                var rates = await _quickSellService.GetExchangeRatesAsync();
                return Ok(new { success = true, data = rates });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching QuickSell exchange rates.");
                return StatusCode(500, new { success = false, message = "Could not retrieve exchange rates." });
            }
        }

        // CRITICAL FIX: The admin endpoints were missing from the main controller.
        // While there is a QuickSellAdminController, the frontend seems to be calling this controller.
        // Adding the set-rate endpoint here to match the frontend's expectation.
        // This is likely the root cause of why the exchange rate was never updated.

        public class SetRateRequest
        {
            public string TokenSymbol { get; set; } = string.Empty;
            public decimal? Rate { get; set; }
        }

        [HttpPost("set-rate/{tokenSymbol}")]
        [Authorize(Roles = "Admin")] // Assuming this should be admin-only
        public async Task<IActionResult> SetExchangeRate(string tokenSymbol, [FromBody] SetRateRequest request)
        {
            if (string.IsNullOrEmpty(tokenSymbol) || !tokenSymbol.Equals(request.TokenSymbol, StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { success = false, message = "TokenSymbol in URL and body must match." });
            }

            try
            {
                var txHash = await _quickSellService.SetExchangeRateAsync(request.TokenSymbol.ToUpper(), request.Rate);
                return Ok(new { success = true, message = $"Exchange rate for {request.TokenSymbol} set successfully. TxHash: {txHash}", transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error setting exchange rate for {TokenSymbol}", request.TokenSymbol);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }
    }
}