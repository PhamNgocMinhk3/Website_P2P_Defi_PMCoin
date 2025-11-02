using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/admin/quicksell")]
    [Authorize(Roles = "Admin")]
    public class QuickSellAdminController : ControllerBase
    {
        private readonly IQuickSellService _quickSellService;
        private readonly IBinancePriceService _binancePriceService;
        private readonly ILogger<QuickSellAdminController> _logger;
        private readonly IConfiguration _configuration;

        public QuickSellAdminController(IQuickSellService quickSellService, IBinancePriceService binancePriceService, IConfiguration configuration, ILogger<QuickSellAdminController> logger)
        {
            _quickSellService = quickSellService;
            _binancePriceService = binancePriceService;
            _configuration = configuration;
            _logger = logger;
        }

        [HttpGet("status")]
        public async Task<IActionResult> GetContractStatus()
        {
            try
            {
                var status = await _quickSellService.GetContractStatusAsync();
                return Ok(new { success = true, data = status });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class DepositVNDTRequest
        {
            public decimal Amount { get; set; }
        }

        [HttpPost("deposit-vndt")]
        public async Task<IActionResult> DepositVNDT([FromBody] DepositVNDTRequest request)
        {
            if (request.Amount <= 0)
            {
                return BadRequest(new { success = false, message = "Amount must be greater than zero." });
            }

            try
            {
                var txHash = await _quickSellService.DepositVNDTAsync(request.Amount);
                return Ok(new { success = true, message = $"VNDT deposited successfully. Transaction Hash: {txHash}", transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error depositing VNDT to QuickSell contract.");
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class WithdrawTokensRequest
        {
            public string TokenSymbol { get; set; } = string.Empty;
        }

        [HttpPost("withdraw-tokens")]
        public async Task<IActionResult> WithdrawTokens([FromBody] WithdrawTokensRequest request)
        {
            if (string.IsNullOrEmpty(request.TokenSymbol))
            {
                return BadRequest(new { success = false, message = "TokenSymbol is required." });
            }

            try
            {
                var txHash = await _quickSellService.WithdrawTokensAsync(request.TokenSymbol.ToUpper());
                return Ok(new { success = true, message = $"{request.TokenSymbol} withdrawn successfully. Transaction Hash: {txHash}", transactionHash = txHash });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error withdrawing {TokenSymbol} from QuickSell contract.", request.TokenSymbol);
                return StatusCode(500, new { success = false, message = ex.Message });
            }
        }

        public class SetRateRequest
        {
            public string TokenSymbol { get; set; } = string.Empty;
            // Rate is now optional, as it will be fetched from Binance if not provided.
            public decimal? Rate { get; set; }
        }

        [HttpPost("set-rate")]
        public async Task<IActionResult> SetExchangeRate([FromBody] SetRateRequest request)
        {
            if (string.IsNullOrEmpty(request.TokenSymbol))
            {
                return BadRequest(new { success = false, message = "TokenSymbol is required." });
            }
            if (request.Rate.HasValue && request.Rate < 0)
            {
                return BadRequest(new { success = false, message = "Rate must be a non-negative number." });
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