using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TradeFinanceBackend.Data;
using TradeFinanceBackend.Models;

namespace TradeFinanceBackend
{
    public class DatabaseTester
    {
        public static async Task TestDatabaseConnection(ILogger? logger = null)
        {
            var options = new DbContextOptionsBuilder<TradeFinanceDbContext>()
                .UseNpgsql("Host=localhost;Port=5432;Database=TradeFinance;Username=postgres;Password=1234")
                .Options;

            using var context = new TradeFinanceDbContext(options);

            try
            {
                // Test connection
                await context.Database.CanConnectAsync();
                logger?.LogInformation("Database connection successful!");

                // Test tables exist
                var userCount = await context.Users.CountAsync();
                var chatCount = await context.Chats.CountAsync();
                var messageCount = await context.Messages.CountAsync();
                var sessionCount = await context.UserSessions.CountAsync();
                var refreshTokenCount = await context.RefreshTokens.CountAsync();

                logger?.LogInformation("Database Statistics - Users: {UserCount}, Chats: {ChatCount}, Messages: {MessageCount}, Sessions: {SessionCount}, Tokens: {TokenCount}",
                    userCount, chatCount, messageCount, sessionCount, refreshTokenCount);

                // Test creating a sample user
                var testUser = new User
                {
                    Id = Guid.NewGuid(),
                    Email = "test@example.com",
                    PasswordHash = "test_hash",
                    Salt = "test_salt",
                    FirstName = "Test",
                    LastName = "User",
                    Role = UserRoles.User,
                    IsActive = true,
                    EmailVerified = true,
                    CreatedAt = DateTime.UtcNow
                };

                // Check if user already exists
                var existingUser = await context.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Email == testUser.Email);
                if (existingUser == null)
                {
                    context.Users.Add(testUser);
                    await context.SaveChangesAsync();
                    logger?.LogInformation("Test user created successfully!");
                    // Use the newly created user for the chat
                    existingUser = testUser;
                }
                else
                {
                    logger?.LogInformation("Test user already exists");
                }


                // Test creating a sample chat
                var testChat = new Chat
                {
                    Id = Guid.NewGuid(),
                    Name = "Test Chat",
                    IsGroup = true,
                    RequireApproval = false,
                    OnlyAdminsCanSend = false,
                    OwnerId = existingUser.Id // FIX: Use the ID from the user that is confirmed to be in the DB
                };

                var existingChat = await context.Chats.FirstOrDefaultAsync(c => c.Name == testChat.Name);
                if (existingChat == null)
                {
                    context.Chats.Add(testChat);
                    await context.SaveChangesAsync();
                    logger?.LogInformation("Test chat created successfully!");
                }
                else
                {
                    logger?.LogInformation("Test chat already exists");
                }

                logger?.LogInformation("All database tests passed!");
            }
            catch (Exception ex)
            {
                logger?.LogError(ex, "Database test failed: {Message}", ex.Message);
                throw; // Re-throw to let caller handle
            }
        }
    }
}
