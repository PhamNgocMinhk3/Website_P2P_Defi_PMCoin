using System.IO;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradeFinanceBackend.Data;

namespace TradeFinanceBackend.Services
{
    public class DailyAnalysisNotificationService : IDailyAnalysisNotificationService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<DailyAnalysisNotificationService> _logger;

        public DailyAnalysisNotificationService(IServiceProvider serviceProvider, ILogger<DailyAnalysisNotificationService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public async Task SendAnalysisToSubscribedUsersAsync()
        {
            using var scope = _serviceProvider.CreateScope();
            var context = scope.ServiceProvider.GetRequiredService<TradeFinanceDbContext>();
            var binanceService = scope.ServiceProvider.GetRequiredService<IBackendBinanceApiService>();
            var emailService = scope.ServiceProvider.GetRequiredService<IEmailService>();

            var subscribedUsers = await context.Users
                .Include(u => u.UserSettings)
                .Where(u => u.UserSettings != null && u.UserSettings.EmailNotificationEnabled)
                .ToListAsync();

            if (!subscribedUsers.Any())
            {
                _logger.LogInformation("No users subscribed to daily analysis emails.");
                return;
            }

            _logger.LogInformation("Found {Count} users subscribed to daily analysis emails. Fetching market data...", subscribedUsers.Count);

            var symbols = new[] { "BTCUSDT", "ETHUSDT", "SOLUSDT" };
            var analysisTasks = symbols.Select(s => binanceService.AnalyzeMarketAsync(s)).ToList();
            var analyses = await Task.WhenAll(analysisTasks);

            var validAnalyses = analyses.Where(a => a != null).ToList();
            if (!validAnalyses.Any())
            {
                _logger.LogWarning("Could not fetch any market analysis data from Binance. Aborting email send.");
                return;
            }

            var emailTemplate = await File.ReadAllTextAsync("EmailTemplates/daily-analysis-template.html");
            var analysisHtml = new StringBuilder();

            foreach (var analysis in validAnalyses)
            {
                if (analysis == null) continue; // Extra safety check

                analysisHtml.Append($"""
                    <div class='analysis-section'>
                        <h2>Phân tích {analysis.Symbol ?? "N/A"}</h2>
                        <div class='analysis-grid'>
                            <div class='metric'><span class='metric-label'>Giá</span><span class='metric-value'>${analysis.CurrentPrice:N2}</span></div>
                            <div class='metric'><span class='metric-label'>24h %</span><span class='metric-value trend-{(analysis.PriceChangePercent24h >= 0 ? "BULLISH" : "BEARISH")}'>{analysis.PriceChangePercent24h:N2}%</span></div>
                            <div class='metric'><span class='metric-label'>Xu hướng</span><span class='metric-value trend-{analysis.Trend ?? "NEUTRAL"}'>{analysis.Trend ?? "NEUTRAL"}</span></div>
                            <div class='metric'><span class='metric-label'>Tín hiệu</span><span class='metric-value recommendation-{analysis.Recommendation ?? "HOLD"}'>{analysis.Recommendation ?? "HOLD"}</span></div>
                            <div class='metric'><span class='metric-label'>Hỗ trợ</span><span class='metric-value'>${analysis.Support:N2}</span></div>
                            <div class='metric'><span class='metric-label'>Kháng cự</span><span class='metric-value'>${analysis.Resistance:N2}</span></div>
                        </div>
                    </div>
                """);
            }

            var fullEmailBody = emailTemplate
                .Replace("{date}", DateTime.UtcNow.ToString("dd/MM/yyyy"))
                .Replace("{year}", DateTime.UtcNow.Year.ToString())
                .Replace("{analysis_sections}", analysisHtml.ToString());

            _logger.LogInformation("Sending daily analysis email to {Count} users...", subscribedUsers.Count);
            foreach (var user in subscribedUsers)
            {
                // In a real app, the unsubscribe link would be unique per user
                var userSpecificBody = fullEmailBody.Replace("{unsubscribe_link}", "http://localhost:4200/settings"); 
                await emailService.SendEmailAsync(user.Email, "Phân Tích Thị Trường Crypto Hàng Ngày Của Bạn", userSpecificBody);
            }
            _logger.LogInformation("Finished sending daily analysis emails.");
        }
    }
}
