namespace TradeFinanceBackend.Models.Configuration
{
    public class MailSettings
    {
        public string Email { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;
        public string Host { get; set; } = string.Empty;
        public int Port { get; set; } = 587;
        public string DisplayName { get; set; } = string.Empty;
    }
}
