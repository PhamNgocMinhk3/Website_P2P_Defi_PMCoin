using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Data;

namespace TradeFinanceBackend.Services
{
    public interface IDatabaseConnectionService
    {
        Task<bool> TestConnectionAsync();
        Task<string> GetConnectionStatusAsync();
    }

    public class DatabaseConnectionService : IDatabaseConnectionService
    {
        private readonly TradeFinanceDbContext _context;
        private readonly ILogger<DatabaseConnectionService> _logger;

        public DatabaseConnectionService(TradeFinanceDbContext context, ILogger<DatabaseConnectionService> logger)
        {
            _context = context;
            _logger = logger;
        }

        public async Task<bool> TestConnectionAsync()
        {
            try
            {
                var canConnect = await _context.Database.CanConnectAsync();
                if (canConnect)
                {
                    _logger.LogInformation("Database connection test successful");
                    return true;
                }
                else
                {
                    _logger.LogWarning("Database connection test failed - cannot connect");
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Database connection test failed with exception: {Message}", ex.Message);
                return false;
            }
        }

        public async Task<string> GetConnectionStatusAsync()
        {
            try
            {
                // First try to open the connection to get detailed info
                await _context.Database.OpenConnectionAsync();
                var connection = _context.Database.GetDbConnection();
                var serverVersion = connection.ServerVersion;
                await _context.Database.CloseConnectionAsync();

                return $"Connected to PostgreSQL server version: {serverVersion}";
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to get connection status: {Message}", ex.Message);
                return $"Connection error: {ex.Message}";
            }
        }

        public async Task<bool> EnsureDatabaseCreatedAsync()
        {
            try
            {
                var created = await _context.Database.EnsureCreatedAsync();
                if (created)
                {
                    _logger.LogInformation("Database 'TradeFinance' was created successfully");
                }
                else
                {
                    _logger.LogInformation("Database 'TradeFinance' already exists");
                }
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to ensure database exists: {Message}", ex.Message);
                return false;
            }
        }
    }
}
