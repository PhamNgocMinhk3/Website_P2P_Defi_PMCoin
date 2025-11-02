using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public class PMCoinBotService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<PMCoinBotService> _logger;
        private readonly TimeSpan _interval = TimeSpan.FromSeconds(4); // Bot trades every 4 seconds
        private int _botTradeCount = 0;

        public PMCoinBotService(IServiceProvider serviceProvider, ILogger<PMCoinBotService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("PM Coin Bot Service started - 1 bot every 4 seconds");

            // Wait a bit for other services to initialize
            await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var botService = scope.ServiceProvider.GetRequiredService<IAdvancedBotTradingService>();

                    // Execute single bot trading (1 bot from 100)
                    var botTradeSuccess = await botService.ExecuteSingleBotTradingAsync();

                    if (botTradeSuccess)
                    {
                        _botTradeCount++;
                        // Log only every 15 trades (1 minute) to reduce spam - bot 4s = 15 trades/min
                        if (_botTradeCount % 15 == 0)
                        {
                            _logger.LogInformation("Bot trading: {Count} trades completed", _botTradeCount);
                        }
                    }

                    await Task.Delay(_interval, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    // Expected when cancellation is requested
                    break;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error in PM Coin Bot Service");

                    // Wait a bit before retrying on error
                    await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
                }
            }

            _logger.LogInformation("PM Coin Bot Service stopped - Total trades: {Count}", _botTradeCount);
        }
    }
}
