using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace TradeFinanceBackend.Services
{
    /// <summary>
    /// A background service that automatically updates the exchange rates for the QuickSell contract
    /// at a regular interval. This removes the need for manual admin intervention.
    /// </summary>
    public class QuickSellRateUpdateService : BackgroundService
    {
        private readonly ILogger<QuickSellRateUpdateService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly TimeSpan _updateInterval = TimeSpan.FromMinutes(5); // Update every 5 minutes
        private readonly List<string> _tokensToUpdate = new List<string> { "BTC", "ETH", "PM" }; // Tokens to auto-update

        public QuickSellRateUpdateService(ILogger<QuickSellRateUpdateService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("QuickSell Rate Update Service is starting.");

            // Wait a moment on startup before the first run.
            await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                _logger.LogInformation("Running periodic QuickSell rate update...");

                using (var scope = _serviceProvider.CreateScope())
                {
                    var quickSellService = scope.ServiceProvider.GetRequiredService<IQuickSellService>();

                    foreach (var tokenSymbol in _tokensToUpdate)
                    {
                        try
                        {
                            _logger.LogInformation("Auto-updating rate for {TokenSymbol}...", tokenSymbol);
                            await quickSellService.SetExchangeRateAsync(tokenSymbol);
                            _logger.LogInformation("Successfully auto-updated rate for {TokenSymbol}.", tokenSymbol);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogError(ex, "Failed to auto-update rate for {TokenSymbol}.", tokenSymbol);
                        }
                        // Add a small delay between token updates to avoid overwhelming the RPC node.
                        await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
                    }
                }

                _logger.LogInformation("Rate update cycle complete. Next run in {Interval}.", _updateInterval);
                await Task.Delay(_updateInterval, stoppingToken);
            }

            _logger.LogInformation("QuickSell Rate Update Service is stopping.");
        }
    }
}