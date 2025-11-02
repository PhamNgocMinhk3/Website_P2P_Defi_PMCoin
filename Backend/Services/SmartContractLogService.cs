using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.DTOs;

namespace TradeFinanceBackend.Services
{
    public class SmartContractLogService : ISmartContractLogService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<SmartContractLogService> _logger;

        public SmartContractLogService(
            TradeFinanceDbContext context,
            ILogger<SmartContractLogService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<IEnumerable<SmartContractLog>> GetAllLogsAsync()
        {
            try
            {
                return await _context.SmartContractLogs
                    .OrderByDescending(l => l.Timestamp)
                    .Take(1000) // Limit to last 1000 logs by default
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting all smart contract logs");
                throw;
            }
        }

        public async Task<IEnumerable<SmartContractLog>> GetLogsByDateRangeAsync(DateTime startDate, DateTime endDate)
        {
            try
            {
                _logger.LogInformation("Attempting to get logs by date range: {StartDate} to {EndDate}", startDate, endDate);
                var logs = await _context.SmartContractLogs
                    .Where(l => l.Timestamp.UtcDateTime >= startDate && l.Timestamp.UtcDateTime <= endDate)
                    .OrderByDescending(l => l.Timestamp)
                    .ToListAsync();
                _logger.LogInformation("Successfully retrieved {Count} logs for date range.", logs.Count);
                return logs;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting logs by date range: {StartDate} to {EndDate}", startDate, endDate);
                throw;
            }
        }

        public async Task<IEnumerable<SmartContractLog>> GetLogsByEventTypeAsync(string eventType)
        {
            try
            {
                return await _context.SmartContractLogs
                    .Where(l => l.EventType == eventType)
                    .OrderByDescending(l => l.Timestamp)
                    .Take(1000)
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting logs by event type: {EventType}", eventType);
                throw;
            }
        }

        public async Task<IEnumerable<SmartContractLog>> GetLogsByAddressAsync(string address)
        {
            try
            {
                // Case insensitive search for either FromAddress or ToAddress
                return await _context.SmartContractLogs
                    .Where(l => l.FromAddress.ToLower() == address.ToLower() || 
                               l.ToAddress.ToLower() == address.ToLower())
                    .OrderByDescending(l => l.Timestamp)
                    .Take(1000)
                    .ToListAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting logs by address: {Address}", address);
                throw;
            }
        }

        public async Task<SmartContractLogSummaryDto> GetDailySummaryAsync(DateTime date)
        {
            try
            {
                _logger.LogInformation("Attempting to get daily summary for date: {Date}", date);
                var startOfDay = date.Date;
                var endOfDay = startOfDay.AddDays(1).AddTicks(-1);

                var logs = await _context.SmartContractLogs
                    .Where(l => l.Date.Date == startOfDay)
                    .ToListAsync();
                _logger.LogInformation("Successfully retrieved {Count} logs for daily summary.", logs.Count);

                return new SmartContractLogSummaryDto
                {
                    Date = startOfDay,
                    TotalTransactions = logs.Count,
                    TotalVolume = logs.Sum(l => l.Amount),
                    EmergencyPayouts = logs.Count(l => l.EventType == "EmergencyPayout"),
                    TotalBets = logs.Count(l => l.EventType == "GameBetPlaced"),
                    TotalBetAmount = logs.Where(l => l.EventType == "GameBetPlaced").Sum(l => l.Amount),
                    TotalDeposits = logs.Count(l => l.EventType == "TreasuryDeposit"),
                    TotalDepositAmount = logs.Where(l => l.EventType == "TreasuryDeposit").Sum(l => l.Amount),
                    TotalWithdrawals = logs.Count(l => l.EventType == "TreasuryWithdrawal"),
                    TotalWithdrawalAmount = logs.Where(l => l.EventType == "TreasuryWithdrawal").Sum(l => l.Amount)
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error getting daily summary for date: {Date}", date);
                throw;
            }
        }
    }
}
