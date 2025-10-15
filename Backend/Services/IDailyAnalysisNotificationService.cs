using System.Threading.Tasks;

namespace TradeFinanceBackend.Services
{
    public interface IDailyAnalysisNotificationService
    {
        Task SendAnalysisToSubscribedUsersAsync();
    }
}
