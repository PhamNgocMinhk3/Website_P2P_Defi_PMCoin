namespace TradeFinanceBackend.Services
{
    /// <summary>
    /// Service Singleton để theo dõi trạng thái online của người dùng.
    /// Hoạt động an toàn trong môi trường đa luồng (thread-safe).
    /// </summary>
    public class PresenceTracker
    {
        // Dictionary để lưu trữ: Key là UserId, Value là danh sách các ConnectionId của user đó.
        // Dùng ConcurrentDictionary để đảm bảo thread-safe.
        private static readonly Dictionary<string, List<string>> OnlineUsers = new Dictionary<string, List<string>>();

        /// <summary>
        /// Xử lý khi một người dùng kết nối.
        /// </summary>
        /// <returns>True nếu đây là kết nối đầu tiên của người dùng (họ vừa chuyển từ offline sang online).</returns>
        public Task<bool> UserConnected(string userId, string connectionId)
        {
            bool isOnline = false;
            lock (OnlineUsers)
            {
                if (OnlineUsers.ContainsKey(userId))
                {
                    OnlineUsers[userId].Add(connectionId);
                }
                else
                {
                    OnlineUsers.Add(userId, new List<string> { connectionId });
                    isOnline = true; // Đây là kết nối đầu tiên
                }
            }
            return Task.FromResult(isOnline);
        }

        /// <summary>
        /// Xử lý khi một người dùng ngắt kết nối.
        /// </summary>
        /// <returns>True nếu người dùng không còn kết nối nào khác (họ vừa chuyển từ online sang offline).</returns>
        public Task<bool> UserDisconnected(string userId, string connectionId)
        {
            bool isOffline = false;
            lock (OnlineUsers)
            {
                if (!OnlineUsers.ContainsKey(userId)) return Task.FromResult(isOffline);

                OnlineUsers[userId].Remove(connectionId);
                if (OnlineUsers[userId].Count == 0)
                {
                    OnlineUsers.Remove(userId);
                    isOffline = true; // Không còn kết nối nào
                }
            }
            return Task.FromResult(isOffline);
        }

        /// <summary>
        /// Lấy danh sách ID của tất cả người dùng đang online.
        /// </summary>
        public Task<string[]> GetOnlineUsers()
        {
            string[] onlineUsers;
            lock (OnlineUsers)
            {
                onlineUsers = OnlineUsers.Keys.ToArray();
            }
            return Task.FromResult(onlineUsers);
        }

        /// <summary>
        /// Lấy danh sách các ConnectionId cho một UserId cụ thể.
        /// </summary>
        public Task<List<string>> GetConnectionsForUser(string userId)
        {
            List<string> connectionIds = new List<string>();
            lock (OnlineUsers)
            {
                if (OnlineUsers.TryGetValue(userId, out var connections))
                {
                    connectionIds = new List<string>(connections); // Trả về một bản sao để đảm bảo an toàn
                }
            }
            return Task.FromResult(connectionIds);
        }
    }
}