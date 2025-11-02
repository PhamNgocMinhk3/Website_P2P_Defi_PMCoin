namespace TradeFinanceBackend.Models
{
    /// <summary>
    /// Constants for supported tokens in the P2P trading system
    /// </summary>
    public static class SupportedTokens
    {
        public const string PM = "PM";
        public const string BTC = "BTC";
        public const string ETH = "ETH";
        public const string VND = "VND";

        /// <summary>
        /// List of all supported tokens
        /// </summary>
        public static readonly string[] All = { PM, BTC, ETH, VND };

        /// <summary>
        /// Check if a token is supported
        /// </summary>
        /// <param name="token">Token symbol to check</param>
        /// <returns>True if token is supported</returns>
        public static bool IsSupported(string token)
        {
            if (string.IsNullOrWhiteSpace(token))
                return false;

            return All.Contains(token.ToUpper());
        }

        /// <summary>
        /// Get display name for a token
        /// </summary>
        /// <param name="token">Token symbol</param>
        /// <returns>Display name</returns>
        public static string GetDisplayName(string token)
        {
            return token?.ToUpper() switch
            {
                PM => "PM Coin",
                BTC => "Bitcoin",
                ETH => "Ethereum",
                VND => "Vietnamese Dong",
                _ => token ?? "Unknown"
            };
        }

        /// <summary>
        /// Get token icon/symbol
        /// </summary>
        /// <param name="token">Token symbol</param>
        /// <returns>Icon character</returns>
        public static string GetIcon(string token)
        {
            return token?.ToUpper() switch
            {
                PM => "💎",
                BTC => "₿",
                ETH => "Ξ",
                VND => "₫",
                _ => "🪙"
            };
        }
    }
}
