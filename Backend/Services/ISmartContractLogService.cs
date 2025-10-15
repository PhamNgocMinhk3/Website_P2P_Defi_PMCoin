using TradeFinanceBackend.Models;
using TradeFinanceBackend.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface ISmartContractLogService
    {
        Task<IEnumerable<SmartContractLog>> GetAllLogsAsync();
        Task<IEnumerable<SmartContractLog>> GetLogsByDateRangeAsync(DateTime startDate, DateTime endDate);
        Task<IEnumerable<SmartContractLog>> GetLogsByEventTypeAsync(string eventType);
        Task<IEnumerable<SmartContractLog>> GetLogsByAddressAsync(string address);
        Task<SmartContractLogSummaryDto> GetDailySummaryAsync(DateTime date);
    }
}
