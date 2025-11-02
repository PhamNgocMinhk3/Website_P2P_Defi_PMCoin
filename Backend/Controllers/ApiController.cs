using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class DatabaseController : ControllerBase
    {
        private readonly IDatabaseConnectionService _dbConnectionService;
        private readonly ILogger<DatabaseController> _logger;

        public DatabaseController(IDatabaseConnectionService dbConnectionService, ILogger<DatabaseController> logger)
        {
            _dbConnectionService = dbConnectionService;
            _logger = logger;
        }

        /// <summary>
        /// Test database connection
        /// </summary>
        /// <returns>Database connection status</returns>
        [HttpGet("test-connection")]
        public async Task<IActionResult> TestConnection()
        {
            try
            {
                var isConnected = await _dbConnectionService.TestConnectionAsync();
                var status = await _dbConnectionService.GetConnectionStatusAsync();
                
                return Ok(new
                {
                    IsConnected = isConnected,
                    Status = status,
                    Timestamp = DateTime.UtcNow
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error testing database connection");
                return StatusCode(500, new { Error = ex.Message });
            }
        }

        /// <summary>
        /// Get database connection status
        /// </summary>
        /// <returns>Detailed database status information</returns>
        [HttpGet("status")]
        public async Task<IActionResult> GetStatus()
        {
            try
            {
                var status = await _dbConnectionService.GetConnectionStatusAsync();
                return Ok(new
                {
                    Status = status,
                    Timestamp = DateTime.UtcNow,
                    Database = "TradeFinance",
                    Host = "localhost",
                    Port = 5432
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting database status");
                return StatusCode(500, new { Error = ex.Message });
            }
        }
    }
}
