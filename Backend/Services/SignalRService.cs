using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Hubs;
using TradeFinanceBackend.Models.DTOs;

namespace TradeFinanceBackend.Services
{
    public interface ISignalRService
    {
        Task BroadcastPriceUpdate(TokenPriceDto priceData);
        Task BroadcastChartUpdate(object chartData);
        Task BroadcastTransactionUpdate(object transactionData);
        Task BroadcastGameUpdate(object gameData);
        Task BroadcastBetResult(object betResultData);
        Task SendNotificationToUser(string userAddress, string message, string type = "info");
    }

    public class SignalRService : ISignalRService
    {
        private readonly IHubContext<GameHub> _hubContext;
        private readonly ILogger<SignalRService> _logger;

        public SignalRService(IHubContext<GameHub> hubContext, ILogger<SignalRService> logger)
        {
            _hubContext = hubContext;
            _logger = logger;
        }

        public async Task BroadcastPriceUpdate(TokenPriceDto priceData)
        {
            try
            {
                await _hubContext.Clients.Group("PriceUpdates").SendAsync("PriceUpdate", priceData);
                _logger.LogDebug("📊 Broadcasted price update: ${Price}", priceData.Price);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error broadcasting price update");
            }
        }

        public async Task BroadcastChartUpdate(object chartData)
        {
            try
            {
                await _hubContext.Clients.Group("ChartUpdates").SendAsync("ChartUpdate", chartData);
                _logger.LogDebug("📈 Broadcasted chart update");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error broadcasting chart update");
            }
        }

        public async Task BroadcastTransactionUpdate(object transactionData)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("TransactionUpdate", transactionData);
                _logger.LogDebug("💰 Broadcasted transaction update");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error broadcasting transaction update");
            }
        }

        public async Task BroadcastGameUpdate(object gameData)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("GameUpdate", gameData);
                _logger.LogDebug("🎮 Broadcasted game update");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error broadcasting game update");
            }
        }

        public async Task BroadcastBetResult(object betResultData)
        {
            try
            {
                await _hubContext.Clients.All.SendAsync("BetResult", betResultData);
                _logger.LogDebug("🎯 Broadcasted bet result");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error broadcasting bet result");
            }
        }

        public async Task SendNotificationToUser(string userAddress, string message, string type = "info")
        {
            try
            {
                var notificationData = new {
                    userAddress = userAddress.ToLowerInvariant(), // Ensure lowercase for consistency
                    message = message,
                    type = type,
                    timestamp = DateTime.UtcNow
                };

                await _hubContext.Clients.All.SendAsync("UserNotification", notificationData);
                _logger.LogInformation("📢 Sent notification to user {UserAddress}: {Message} (Type: {Type})",
                    userAddress, message, type);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error sending notification to user {UserAddress}", userAddress);
            }
        }
    }
}
