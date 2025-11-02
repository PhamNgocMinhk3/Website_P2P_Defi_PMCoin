using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Threading;
using System.Threading.Tasks;
using TradeFinanceBackend.Services;

namespace TradeFinanceBackend.Services
{
    public class DailyProfitResetService : BackgroundService
    {
        private readonly ILogger<DailyProfitResetService> _logger;
        private readonly IServiceProvider _serviceProvider;

        public DailyProfitResetService(ILogger<DailyProfitResetService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("Daily Profit Reset Service is starting.");

            // Wait a bit on startup before the first run to ensure other services are ready.
            await Task.Delay(TimeSpan.FromSeconds(20), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    _logger.LogDebug("Running daily profit reset check...");
                    using (var scope = _serviceProvider.CreateScope())
                    {
                        var smartContractService = scope.ServiceProvider.GetRequiredService<ISmartContractService>();
                        await smartContractService.ResetDailyProfitIfNeededAsync();
                    }
                }
                catch (Exception ex)
                {
                    // The specific error is already logged by the SmartContractService, so we just log a general error here.
                    _logger.LogError(ex, "An unexpected error occurred in the Daily Profit Reset Service execution loop.");
                }

                // Wait for 5 minutes before the next check
                await Task.Delay(TimeSpan.FromMinutes(5), stoppingToken);
            }

            _logger.LogInformation("Daily Profit Reset Service is stopping.");
        }
    }
}
