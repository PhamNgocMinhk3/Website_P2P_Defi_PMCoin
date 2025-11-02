using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.DTOs;

namespace TradeFinanceBackend.Controllers
{
    [Authorize(Roles = "Admin")]
    [ApiController]
    [Route("api/[controller]")]
    public class SmartContractLogController : ControllerBase
    {
        private readonly ISmartContractLogService _logService;
        private readonly ILogger<SmartContractLogController> _logger;

        public SmartContractLogController(
            ISmartContractLogService logService,
            ILogger<SmartContractLogController> logger)
        {
            _logService = logService;
            _logger = logger;
        }

        [HttpGet]
        public async Task<ActionResult<IEnumerable<SmartContractLog>>> GetAllLogs()
        {
            try
            {
                var logs = await _logService.GetAllLogsAsync();
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving all logs");
                return StatusCode(500, "Internal server error retrieving logs");
            }
        }

        [HttpGet("dateRange")]
        public async Task<ActionResult<IEnumerable<SmartContractLog>>> GetLogsByDateRange(
            [FromQuery] DateTime startDate,
            [FromQuery] DateTime endDate)
        {
            try
            {
                var logs = await _logService.GetLogsByDateRangeAsync(startDate, endDate);
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving logs by date range");
                return StatusCode(500, "Internal server error retrieving logs");
            }
        }

        [HttpGet("eventType/{eventType}")]
        public async Task<ActionResult<IEnumerable<SmartContractLog>>> GetLogsByEventType(string eventType)
        {
            try
            {
                var logs = await _logService.GetLogsByEventTypeAsync(eventType);
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving logs by event type");
                return StatusCode(500, "Internal server error retrieving logs");
            }
        }

        [HttpGet("address/{address}")]
        public async Task<ActionResult<IEnumerable<SmartContractLog>>> GetLogsByAddress(string address)
        {
            try
            {
                var logs = await _logService.GetLogsByAddressAsync(address);
                return Ok(logs);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving logs by address");
                return StatusCode(500, "Internal server error retrieving logs");
            }
        }

        [HttpGet("dailySummary")]
        public async Task<ActionResult<SmartContractLogSummaryDto>> GetDailySummary([FromQuery] DateTime date)
        {
            try
            {
                var summary = await _logService.GetDailySummaryAsync(date);
                return Ok(summary);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error retrieving daily summary");
                return StatusCode(500, "Internal server error retrieving daily summary");
            }
        }
    }
}
