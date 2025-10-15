using BCrypt.Net;

namespace TradeFinanceBackend.Services
{
    public interface IPasswordHashingService
    {
        string GenerateSalt();
        string HashPassword(string password, string salt);
        bool VerifyPassword(string password, string salt, string hash);
        string GenerateSecureToken(int length = 32);
    }

    public class PasswordHashingService : IPasswordHashingService
    {
        private readonly ILogger<PasswordHashingService> _logger;

        public PasswordHashingService(ILogger<PasswordHashingService> logger)
        {
            _logger = logger;
        }

        public string GenerateSalt()
        {
            return BCrypt.Net.BCrypt.GenerateSalt(12); // Work factor of 12 for high security
        }

        public string HashPassword(string password, string salt)
        {
            if (string.IsNullOrEmpty(password))
                throw new ArgumentException("Password cannot be null or empty", nameof(password));

            if (string.IsNullOrEmpty(salt))
                throw new ArgumentException("Salt cannot be null or empty", nameof(salt));

            try
            {
                return BCrypt.Net.BCrypt.HashPassword(password, salt);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error hashing password");
                throw;
            }
        }

        public bool VerifyPassword(string password, string salt, string hash)
        {
            if (string.IsNullOrEmpty(password) || string.IsNullOrEmpty(salt) || string.IsNullOrEmpty(hash))
                return false;

            try
            {
                var computedHash = HashPassword(password, salt);
                return computedHash == hash;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error verifying password");
                return false;
            }
        }

        public string GenerateSecureToken(int length = 32)
        {
            const string chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            var random = new Random();
            return new string(Enumerable.Repeat(chars, length)
                .Select(s => s[random.Next(s.Length)]).ToArray());
        }
    }
}
