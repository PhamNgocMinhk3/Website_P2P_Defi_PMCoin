namespace TradeFinanceBackend.Hubs
{
    /// <summary>
    /// Interface định nghĩa các phương thức mà PresenceHub có thể gọi trên client.
    /// </summary>
    public interface IPresenceClient
    {
        /// <summary>
        /// Thông báo một người dùng vừa online.
        /// </summary>
        Task UserIsOnline(string userId);

        /// <summary>
        /// Thông báo một người dùng vừa offline.
        /// </summary>
        Task UserIsOffline(object payload); // { userId, lastSeen }

        /// <summary>
        /// Gửi danh sách những người dùng đang online cho client vừa kết nối.
        /// </summary>
        Task GetOnlineUsers(string[] userIds);

        /// <summary>
        /// Thông báo cho các client khác rằng cài đặt hiển thị trạng thái của một người dùng đã thay đổi.
        /// </summary>
        /// <param name="payload">Chứa userId, showOnlineStatus, isOnline, và lastSeen.</param>
        Task PresenceSettingChanged(object payload);
    }
}