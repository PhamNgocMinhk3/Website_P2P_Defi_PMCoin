using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Services
{
    public interface IOnDemandBotService
    {
        Task StartBotForUserAsync(string userAddress);
        Task StopBotForUserAsync(string userAddress);
        bool IsBotRunningForUser(string userAddress);
        Task<int> GetActiveBotCount();
    }

    public class OnDemandBotService : IOnDemandBotService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<OnDemandBotService> _logger;
        private readonly Dictionary<string, CancellationTokenSource> _activeBots = new();
        private readonly object _lock = new object();

        public OnDemandBotService(IServiceProvider serviceProvider, ILogger<OnDemandBotService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public Task StartBotForUserAsync(string userAddress)
        {
            lock (_lock)
            {
                if (_activeBots.ContainsKey(userAddress))
                {
                    _logger.LogInformation("Bot already running for user: {UserAddress}", userAddress);
                    return Task.CompletedTask;
                }

                var cts = new CancellationTokenSource();
                _activeBots[userAddress] = cts;

                // Start bot in background
                _ = Task.Run(async () => await RunBotForUserAsync(userAddress, cts.Token));

                // Bot started silently
            }
            return Task.CompletedTask;
        }

        public Task StopBotForUserAsync(string userAddress)
        {
            lock (_lock)
            {
                if (_activeBots.TryGetValue(userAddress, out var cts))
                {
                    cts.Cancel();
                    _activeBots.Remove(userAddress);
                    // Bot stopped silently
                }
            }
            return Task.CompletedTask;
        }

        public bool IsBotRunningForUser(string userAddress)
        {
            lock (_lock)
            {
                return _activeBots.ContainsKey(userAddress);
            }
        }

        public Task<int> GetActiveBotCount()
        {
            lock (_lock)
            {
                return Task.FromResult(_activeBots.Count);
            }
        }

        private async Task RunBotForUserAsync(string userAddress, CancellationToken cancellationToken)
        {
            try
            {
                var interval = TimeSpan.FromSeconds(3); // Bot trades every 3 seconds when user active
                
                while (!cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        using var scope = _serviceProvider.CreateScope();
                        var botService = scope.ServiceProvider.GetRequiredService<IAdvancedBotTradingService>();

                        // Execute single bot trading
                        await botService.ExecuteSingleBotTradingAsync();

                        await Task.Delay(interval, cancellationToken);
                    }
                    catch (OperationCanceledException)
                    {
                        break;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error in bot trading for user: {UserAddress}", userAddress);
                        await Task.Delay(TimeSpan.FromSeconds(5), cancellationToken); // Wait before retry
                    }
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when cancellation is requested
            }
            finally
            {
                lock (_lock)
                {
                    _activeBots.Remove(userAddress);
                }
                // Bot cleanup completed silently
            }
        }
    }
}
