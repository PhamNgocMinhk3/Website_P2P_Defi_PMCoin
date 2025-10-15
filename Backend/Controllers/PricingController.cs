using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Data;
using Microsoft.EntityFrameworkCore;

namespace TradeFinanceBackend.Controllers
{
    public class UpdatePMCoinPriceRequest
    {
        public decimal Price { get; set; }
        public string? Source { get; set; }
        public string? Reason { get; set; }
    }

    [ApiController]
    [Route("api/p2p")] // Keep same route for frontend compatibility
    public class PricingController : ControllerBase
    {
        private readonly IPriceCalculatorService _priceCalculatorService;
        private readonly IPMCoinPriceService _pmCoinPriceService;
        private readonly IBinancePriceService _binancePriceService;
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<PricingController> _logger;
        private readonly IServiceProvider _serviceProvider;

        public PricingController(
            IPriceCalculatorService priceCalculatorService,
            IPMCoinPriceService pmCoinPriceService,
            IBinancePriceService binancePriceService,
            TradeFinanceDbContext context,
            ILogger<PricingController> logger,
            IServiceProvider serviceProvider)
        {
            _priceCalculatorService = priceCalculatorService;
            _pmCoinPriceService = pmCoinPriceService;
            _binancePriceService = binancePriceService;
            _context = context;
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        /// <summary>
        /// Get empty orders list (for frontend compatibility)
        /// Since P2P orders are now handled via smart contracts
        /// </summary>
        [HttpGet("orders")]
        public IActionResult GetOrders()
        {
            // Return empty array directly for frontend compatibility
            return Ok(new object[0]);
        }

        /// <summary>
        /// Get all token prices
        /// </summary>
        [HttpGet("prices")]
        public async Task<IActionResult> GetTokenPrices()
        {
            try
            {
                var prices = await _priceCalculatorService.GetAllTokenPricesAsync();
                
                var priceData = prices.ToDictionary(
                    kvp => kvp.Key.ToLower(),
                    kvp => new
                    {
                        token = kvp.Key,
                        price = kvp.Value,
                        change24h = 0.0m, // TODO: Implement 24h change
                        lastUpdated = DateTime.UtcNow,
                        source = kvp.Key == "PM" ? "SERVER" : "BINANCE"
                    }
                );

                return Ok(new ApiResponseDto<object>
                {
                    Success = true,
                    Message = "Token prices retrieved successfully",
                    Data = priceData
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching token prices");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to fetch token prices"
                });
            }
        }

        /// <summary>
        /// Get PM coin price details
        /// </summary>
        [HttpGet("prices/pm")]
        public async Task<IActionResult> GetPMCoinPrice()
        {
            try
            {
                var pmPrice = await _pmCoinPriceService.GetPMCoinPriceDetailAsync();

                return Ok(new ApiResponseDto<TokenPriceDto>
                {
                    Success = true,
                    Message = "PM coin price retrieved successfully",
                    Data = pmPrice
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching PM coin price");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to fetch PM coin price"
                });
            }
        }

        /// <summary>
        /// Reset PM coin price to $2.50 (GET endpoint for easy testing)
        /// </summary>
        [HttpGet("prices/pm/reset")]
        public async Task<IActionResult> ResetPMCoinPrice()
        {
            try
            {
                // Direct database update to avoid overflow issues
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();

                // Deactivate all existing prices
                var existingPrices = await context.PMCoinPrices
                    .Where(p => p.IsActive)
                    .ToListAsync();

                foreach (var existing in existingPrices)
                {
                    existing.IsActive = false;
                    existing.UpdatedAt = DateTime.UtcNow;
                }

                // Add new price $2.50 (giữa range $1-5)
                var newPrice = new PMCoinPrice
                {
                    Price = 2.50m,
                    Change24h = 0.00m,
                    ChangePercent24h = 0.00m,
                    Volume24h = 0.00m,
                    MarketCap = 2500000.00m, // 2.5M market cap
                    Source = "MANUAL",
                    Reason = "Reset price to $2.50 (middle of $1-5 range)",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                context.PMCoinPrices.Add(newPrice);
                await context.SaveChangesAsync();

                // Force clear cache by calling private method via reflection
                var pmCoinService = _serviceProvider.GetRequiredService<IPMCoinPriceService>();
                var serviceType = pmCoinService.GetType();
                var cachedPriceField = serviceType.GetField("_cachedPrice", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);
                var cacheTimeField = serviceType.GetField("_cacheTime", System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance);

                if (cachedPriceField != null) cachedPriceField.SetValue(pmCoinService, null);
                if (cacheTimeField != null) cacheTimeField.SetValue(pmCoinService, null);

                var updatedPrice = await _pmCoinPriceService.GetPMCoinPriceDetailAsync();
                return Ok(new ApiResponseDto<TokenPriceDto>
                {
                    Success = true,
                    Message = "PM coin price reset to $2.50 successfully",
                    Data = updatedPrice
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error resetting PM coin price");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Internal server error: " + ex.Message
                });
            }
        }

        /// <summary>
        /// Update PM coin price (for bot trading simulation)
        /// </summary>
        [HttpPost("prices/pm/update")]
        public async Task<IActionResult> UpdatePMCoinPrice([FromBody] UpdatePMCoinPriceRequest request)
        {
            try
            {
                var success = await _pmCoinPriceService.UpdatePMCoinPriceAsync(
                    request.Price,
                    request.Source ?? "MARKET_ACTIVITY",
                    request.Reason ?? "Bot trading simulation"
                );

                if (success)
                {
                    var updatedPrice = await _pmCoinPriceService.GetPMCoinPriceDetailAsync();
                    return Ok(new ApiResponseDto<TokenPriceDto>
                    {
                        Success = true,
                        Message = "PM coin price updated successfully",
                        Data = updatedPrice
                    });
                }
                else
                {
                    return BadRequest(new ApiResponseDto<object>
                    {
                        Success = false,
                        Message = "Failed to update PM coin price"
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error updating PM coin price");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to update PM coin price"
                });
            }
        }

        /// <summary>
        /// Calculate price for token exchange
        /// </summary>
        [HttpPost("calculate-price")]
        public async Task<IActionResult> CalculatePrice([FromBody] PriceCalculationRequestDto request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new ApiResponseDto<object>
                    {
                        Success = false,
                        Message = "Invalid request data",
                        Errors = ModelState.Values
                            .SelectMany(v => v.Errors)
                            .Select(e => e.ErrorMessage)
                            .ToList()
                    });
                }

                var calculation = await _priceCalculatorService.CalculateExchangeAsync(
                    request.SellToken, 
                    request.BuyToken, 
                    request.SellAmount);

                return Ok(new ApiResponseDto<PriceCalculationDto>
                {
                    Success = true,
                    Message = "Price calculated successfully",
                    Data = calculation
                });
            }
            catch (ArgumentException ex)
            {
                _logger.LogWarning(ex, "Invalid token pair: {SellToken}/{BuyToken}", 
                    request.SellToken, request.BuyToken);
                return BadRequest(new ApiResponseDto<object>
                {
                    Success = false,
                    Message = ex.Message
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error calculating price for {SellToken}/{BuyToken}", 
                    request.SellToken, request.BuyToken);
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to calculate price"
                });
            }
        }

        /// <summary>
        /// Get supported tokens
        /// </summary>
        [HttpGet("supported-tokens")]
        public IActionResult GetSupportedTokens()
        {
            try
            {
                var tokens = TradeFinanceBackend.Models.SupportedTokens.All
                    .Select(token => new
                    {
                        symbol = token,
                        name = TradeFinanceBackend.Models.SupportedTokens.GetDisplayName(token),
                        icon = TradeFinanceBackend.Models.SupportedTokens.GetIcon(token)
                    })
                    .ToList();

                return Ok(new ApiResponseDto<object>
                {
                    Success = true,
                    Message = "Supported tokens retrieved successfully",
                    Data = tokens
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching supported tokens");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to fetch supported tokens"
                });
            }
        }

        /// <summary>
        /// Get transaction history with pagination
        /// </summary>
        [HttpGet("transactions/history")]
        public async Task<IActionResult> GetTransactionHistory(
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 50,
            [FromQuery] string? walletAddress = null)
        {
            try
            {
                var query = _context.TransactionHistories.AsQueryable();

                // Filter by wallet address if provided
                if (!string.IsNullOrEmpty(walletAddress))
                {
                    query = query.Where(t => t.SellerAddress == walletAddress || t.BuyerAddress == walletAddress);
                }

                // Get total count
                var totalCount = await query.CountAsync();

                // Apply pagination and ordering
                var transactions = await query
                    .OrderByDescending(t => t.TransactionTime)
                    .Skip((page - 1) * pageSize)
                    .Take(pageSize)
                    .Select(t => new TransactionHistoryDto
                    {
                        Id = t.Id,
                        TxHash = t.TxHash,
                        SellToken = t.SellToken,
                        BuyToken = t.BuyToken,
                        SellAmount = t.SellAmount,
                        BuyAmount = t.BuyAmount,
                        SellerAddress = t.SellerAddress,
                        BuyerAddress = t.BuyerAddress,
                        Status = t.Status,
                        TransactionType = t.TransactionType,
                        TransactionTime = t.TransactionTime,
                        GasUsed = t.GasUsed,
                        GasFee = t.GasFee,
                        Notes = t.Notes
                    })
                    .ToListAsync();

                // Return transactions wrapped in ApiResponse format
                return Ok(new ApiResponseDto<List<TransactionHistoryDto>>
                {
                    Success = true,
                    Message = "Transaction history retrieved successfully",
                    Data = transactions
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching transaction history");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to fetch transaction history"
                });
            }
        }

        /// <summary>
        /// Save P2P transaction history
        /// </summary>
        [HttpPost("transactions")]
        public async Task<IActionResult> SaveTransactionHistory([FromBody] SaveTransactionHistoryDto request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new ApiResponseDto<object>
                    {
                        Success = false,
                        Message = "Invalid request data",
                        Errors = ModelState.Values
                            .SelectMany(v => v.Errors)
                            .Select(e => e.ErrorMessage)
                            .ToList()
                    });
                }

                // Get the current user's ID from the HttpContext
                var userIdClaim = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
                if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
                {
                    return Unauthorized(new ApiResponseDto<object> 
                    { 
                        Success = false, 
                        Message = "User is not authenticated or user ID is invalid." 
                    });
                }

                var newTransaction = new TransactionHistory
                {
                    UserId = userId, // Assign the user ID
                    TxHash = request.TxHash,
                    SellToken = request.SellToken,
                    BuyToken = request.BuyToken,
                    SellAmount = request.SellAmount,
                    BuyAmount = request.BuyAmount,
                    SellerAddress = request.SellerAddress,
                    BuyerAddress = request.BuyerAddress,
                    Status = request.Status,
                    TransactionType = "P2P", // Set transaction type
                    BlockNumber = request.BlockNumber,
                    GasUsed = request.GasUsed,
                    TransactionTime = request.TransactionTime.UtcDateTime,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };

                _context.TransactionHistories.Add(newTransaction);
                await _context.SaveChangesAsync();

                return Ok(new ApiResponseDto<object>
                {
                    Success = true,
                    Message = "Transaction saved successfully",
                    Data = new { id = newTransaction.Id }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error saving transaction history");
                return StatusCode(500, new ApiResponseDto<object>
                {
                    Success = false,
                    Message = "Failed to save transaction"
                });
            }
        }
    }
}
