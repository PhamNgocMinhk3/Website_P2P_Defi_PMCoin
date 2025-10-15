using Microsoft.AspNetCore.SignalR;
using TradeFinanceBackend.Services;
using TradeFinanceBackend.Models.DTOs;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend.Hubs
{
    public class GameHub : Hub
    {
        private readonly ILogger<GameHub> _logger;
        private readonly IPMCoinPriceService _pmCoinPriceService;
        private readonly IGameSessionManagementService _sessionService;

        // Group name for P2P order updates
        private const string P2PGroup = "P2POrders";

        public GameHub(
            ILogger<GameHub> logger, 
            IPMCoinPriceService pmCoinPriceService,
            IGameSessionManagementService sessionService)
        {
            _logger = logger;
            _pmCoinPriceService = pmCoinPriceService;
            _sessionService = sessionService;
        }

        public override async Task OnConnectedAsync()
        {
            _logger.LogInformation("🔌 Client connected: {ConnectionId}", Context.ConnectionId);
            
            // Auto-join common groups
            await Groups.AddToGroupAsync(Context.ConnectionId, "PriceUpdates");
            await Groups.AddToGroupAsync(Context.ConnectionId, P2PGroup); // Automatically join P2P group

            _logger.LogInformation("Client {ConnectionId} joined default groups.", Context.ConnectionId);

            // Send current price immediately
            try
            {
                var currentPrice = await _pmCoinPriceService.GetPMCoinPriceDetailAsync();
                await Clients.Caller.SendAsync("PriceUpdate", currentPrice);
                _logger.LogDebug("📊 Sent current price to new client: ${Price}", currentPrice.Price);
            }
            catch (Exception ex)
            {
                _logger.LogWarning("⚠️ Could not send current price to new client: {Error}", ex.Message);
            }
            
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            _logger.LogInformation("🔌 Client disconnected: {ConnectionId}", Context.ConnectionId);
            await base.OnDisconnectedAsync(exception);
        }

        // ===== P2P REAL-TIME METHODS =====

        /// <summary>
        /// Called by a client when they intend to match an order.
        /// Notifies all other clients to lock the UI for that order.
        /// </summary>
        /// <param name="orderId">The ID of the order being matched.</param>
        public async Task LockOrder(string orderId)
        {
            _logger.LogInformation("🔒 Client {ConnectionId} is attempting to lock order {OrderId}", Context.ConnectionId, orderId);
            await Clients.GroupExcept(P2PGroup, Context.ConnectionId).SendAsync("OrderLocked", orderId);
        }

        /// <summary>
        /// Called by a client if they cancel the matching process before confirming.
        /// Notifies all other clients to unlock the UI for that order.
        /// </summary>
        /// <param name="orderId">The ID of the order to unlock.</param>
        public async Task UnlockOrder(string orderId)
        {
            _logger.LogInformation("🔓 Client {ConnectionId} unlocked order {OrderId}", Context.ConnectionId, orderId);
            await Clients.GroupExcept(P2PGroup, Context.ConnectionId).SendAsync("OrderUnlocked", orderId);
        }

        /// <summary>
        /// Called by a client after successfully matching an order.
        /// Notifies all clients to refresh their order book.
        /// </summary>
        /// <param name="orderId">The ID of the order that was matched.</param>
        public async Task NotifyTradeSuccess(string orderId)
        {
            _logger.LogInformation("✅ Client {ConnectionId} successfully matched order {OrderId}. Notifying group.", Context.ConnectionId, orderId);
            await Clients.Group(P2PGroup).SendAsync("OrderMatched", orderId);
        }


        // ===== EXISTING GROUP AND PRICE METHODS =====

        // Join specific groups for targeted updates
        public async Task JoinGroup(string groupName)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            _logger.LogDebug("👥 Client {ConnectionId} joined group {GroupName}", Context.ConnectionId, groupName);
        }

        public async Task LeaveGroup(string groupName)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            _logger.LogDebug("👥 Client {ConnectionId} left group {GroupName}", Context.ConnectionId, groupName);
        }

        // Subscribe to real-time price updates
        public async Task SubscribeToPriceUpdates()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "PriceUpdates");
            _logger.LogDebug("📈 Client {ConnectionId} subscribed to price updates", Context.ConnectionId);
        }

        public async Task UnsubscribeFromPriceUpdates()
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "PriceUpdates");
            _logger.LogDebug("📈 Client {ConnectionId} unsubscribed from price updates", Context.ConnectionId);
        }

        // Subscribe to chart data updates
        public async Task SubscribeToChartUpdates()
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, "ChartUpdates");
            _logger.LogDebug("📊 Client {ConnectionId} subscribed to chart updates", Context.ConnectionId);
        }

        public async Task UnsubscribeFromChartUpdates()
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, "ChartUpdates");
            _logger.LogDebug("📊 Client {ConnectionId} unsubscribed from chart updates", Context.ConnectionId);
        }

        // Game Session Management
        public async Task JoinGameSession(string sessionId)
        {
            var groupName = $"GameSession_{sessionId}";
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            _logger.LogInformation("🎮 Client {ConnectionId} joined game session {SessionId}", Context.ConnectionId, sessionId);

            var session = await _sessionService.GetCurrentSessionAsync();
            if (session != null)
            {
                await Clients.Caller.SendAsync("SessionState", new {
                    sessionId = session.Id,
                    status = session.Status.ToString(),
                    timeLeft = await _sessionService.GetTimeLeftAsync(session.Id),
                    startPrice = session.StartPrice,
                    currentPrice = session.CurrentPrice,
                    startTime = session.StartTime,
                    endTime = session.EndTime
                });
            }
        }

        public async Task LeaveGameSession(string sessionId)
        {
            var groupName = $"GameSession_{sessionId}";
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
            _logger.LogInformation("🎮 Client {ConnectionId} left game session {SessionId}", Context.ConnectionId, sessionId);
        }

        // Method for broadcasting session state changes
        public async Task BroadcastSessionState(string sessionId, string state, object data)
        {
            var groupName = $"GameSession_{sessionId}";
            await Clients.Group(groupName).SendAsync("SessionStateChanged", state, data);
            _logger.LogInformation("🔄 Broadcasting session {SessionId} state change: {State}", sessionId, state);
        }
    }
}
