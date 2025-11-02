using Microsoft.EntityFrameworkCore;
using TradeFinanceBackend.Models;
using TradeFinanceBackend.Models.DTOs;
using System.Text.Json;

namespace TradeFinanceBackend.Data
{
    public class TradeFinanceDbContext : DbContext
    {
        public TradeFinanceDbContext(DbContextOptions<TradeFinanceDbContext> options)
            : base(options)
        {
        }

        // Authentication entities
        public DbSet<User> Users { get; set; }
        public DbSet<RefreshToken> RefreshTokens { get; set; }
        public DbSet<UserSession> UserSessions { get; set; }

        // Chat entities
        public DbSet<Chat> Chats { get; set; }
        public DbSet<ChatParticipant> ChatParticipants { get; set; }
        public DbSet<Message> Messages { get; set; }
        public DbSet<MessageRead> MessageReads { get; set; }
        public DbSet<MessageReaction> MessageReactions { get; set; }
        public DbSet<UserProfile> UserProfiles { get; set; }
        public DbSet<UserSettings> UserSettings { get; set; }
        public DbSet<LoginHistory> LoginHistories { get; set; }
        public DbSet<UserBalance> UserBalances { get; set; }
        public DbSet<BalanceTransaction> BalanceTransactions { get; set; }
        public DbSet<JobExecutionLog> JobExecutionLogs { get; set; }

        // P2P Trading entities
        public DbSet<TransactionHistory> TransactionHistories { get; set; }
        public DbSet<FiatTransaction> FiatTransactions { get; set; }

        // PM Coin Price entities
        public DbSet<PMCoinPrice> PMCoinPrices { get; set; }
        public DbSet<PMCoinPriceHistory> PMCoinPriceHistories { get; set; }

        // Game entities
        public DbSet<CurrentGameSession> CurrentGameSessions { get; set; }
        public DbSet<ActiveBet> ActiveBets { get; set; }
        public DbSet<ProfitAnalysis> ProfitAnalyses { get; set; }
        public DbSet<DailyTargetTracking> DailyTargetTrackings { get; set; }
        // ❌ REMOVED: BotTransactionHistory merged into PMCoinPriceHistory
        // public DbSet<BotTransactionHistory> BotTransactionHistories { get; set; }
        public DbSet<UserGameStats> UserGameStats { get; set; }

        // Smart Contract entities
        public DbSet<SmartContractLog> SmartContractLogs { get; set; }

        //
        public DbSet<BlockedUser> BlockedUsers { get; set; }
        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure User entity
            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasIndex(e => e.Email).IsUnique();
                entity.HasIndex(e => e.Username).IsUnique();
                entity.Property(e => e.Username).IsRequired().HasMaxLength(50);
                entity.Property(e => e.Email).IsRequired().HasMaxLength(255);
                entity.Property(e => e.PasswordHash).IsRequired().HasMaxLength(255);
                entity.Property(e => e.Salt).IsRequired().HasMaxLength(255);
                entity.Property(e => e.Role).IsRequired().HasMaxLength(50).HasDefaultValue(UserRoles.User);
                entity.Property(e => e.IsActive).HasDefaultValue(true);
                entity.Property(e => e.EmailVerified).HasDefaultValue(false);
            });
            // Configure RefreshToken entity
            modelBuilder.Entity<RefreshToken>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Token).IsRequired().HasMaxLength(255);
                entity.HasOne(e => e.User)
                        .WithMany(u => u.RefreshTokens)
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure UserSession entity
            modelBuilder.Entity<UserSession>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.SessionToken).IsRequired().HasMaxLength(255);
                entity.Property(e => e.IsActive).HasDefaultValue(true);
                entity.HasOne(e => e.User)
                        .WithMany(u => u.UserSessions)
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure Chat entity
            modelBuilder.Entity<Chat>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Name).HasMaxLength(255);
                entity.HasOne(e => e.Owner)
                        .WithMany(u => u.CreatedChats)
                        .HasForeignKey(e => e.OwnerId)
                        .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure ChatParticipant entity
            modelBuilder.Entity<ChatParticipant>(entity =>
            {
                entity.HasKey(e => e.Id);

                // FIX: Convert the ChatRole enum to a string before saving to the database.
                // This ensures the enum in your C# code is correctly saved as "Owner" or "Member" text in the database.
                entity.Property(e => e.Role).HasConversion<string>().HasMaxLength(50).HasDefaultValue(ChatRole.Member);

                entity.HasOne(e => e.Chat)
                        .WithMany(c => c.Participants)
                        .HasForeignKey(e => e.ChatId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                        .WithMany(u => u.ChatMemberships)
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => new { e.ChatId, e.UserId }).IsUnique();
            });

            // Configure Message entity
            modelBuilder.Entity<Message>(entity =>
            {
                // JSON properties configuration
                var jsonSerializerOptions = new JsonSerializerOptions { PropertyNameCaseInsensitive = true, DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };

                entity.Property(e => e.PollData)
                    .HasColumnType("jsonb")
                    .HasConversion(
                        v => JsonSerializer.Serialize(v, jsonSerializerOptions),
                        v => v == null ? null : JsonSerializer.Deserialize<PollData>(v, jsonSerializerOptions)
                    );

                entity.Property(e => e.AppointmentData)
                    .HasColumnType("jsonb")
                    .HasConversion(
                        v => JsonSerializer.Serialize(v, jsonSerializerOptions),
                        v => v == null ? null : JsonSerializer.Deserialize<AppointmentData>(v, jsonSerializerOptions)
                    );


                // Standard properties and relationships
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Type).HasDefaultValue(MessageTypes.Text);
                entity.HasOne(e => e.Chat)
                        .WithMany(c => c.Messages)
                        .HasForeignKey(e => e.ChatId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Sender)
                        .WithMany(u => u.Messages)
                        .HasForeignKey(e => e.SenderId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.ParentMessage)
                        .WithMany()
                        .HasForeignKey(e => e.ParentMessageId)
                        .OnDelete(DeleteBehavior.SetNull);
            });

            // Configure MessageRead entity
            modelBuilder.Entity<MessageRead>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasOne(e => e.Message)
                        .WithMany(m => m.ReadBy)
                        .HasForeignKey(e => e.MessageId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                        .WithMany()
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.Chat)
                        .WithMany()
                        .HasForeignKey(e => e.ChatId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => new { e.MessageId, e.UserId }).IsUnique();
                entity.HasIndex(e => new { e.ChatId, e.UserId }).IsUnique();
            });

            // Configure MessageReaction entity
            modelBuilder.Entity<MessageReaction>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.HasOne(e => e.Message)
                        .WithMany(m => m.Reactions)
                        .HasForeignKey(e => e.MessageId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasOne(e => e.User)
                        .WithMany()
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => new { e.MessageId, e.UserId, e.Reaction }).IsUnique();
            });



            // Configure PMCoinPrice entity
            modelBuilder.Entity<PMCoinPrice>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Price).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Change24h).HasColumnType("decimal(18,8)");
                entity.Property(e => e.ChangePercent24h).HasColumnType("decimal(5,2)");
                entity.Property(e => e.Volume24h).HasColumnType("decimal(18,8)");
                entity.Property(e => e.MarketCap).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Source).IsRequired().HasMaxLength(50);
                entity.Property(e => e.IsActive).HasDefaultValue(true);
                entity.HasIndex(e => e.CreatedAt);
                entity.HasIndex(e => new { e.IsActive, e.CreatedAt });
            });

            // Configure PMCoinPriceHistory entity
            modelBuilder.Entity<PMCoinPriceHistory>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Price).HasColumnType("decimal(18,8)");
                entity.Property(e => e.PreviousPrice).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Change).HasColumnType("decimal(18,8)");
                entity.Property(e => e.ChangePercent).HasColumnType("decimal(5,2)");
                entity.Property(e => e.Source).IsRequired().HasMaxLength(50);
                entity.HasIndex(e => e.Timestamp);
                entity.HasIndex(e => new { e.Date, e.Hour });
            });

            // Configure TransactionHistory entity
            modelBuilder.Entity<TransactionHistory>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.TxHash).IsRequired().HasMaxLength(66);
                entity.Property(e => e.SellToken).IsRequired().HasMaxLength(10);
                entity.Property(e => e.BuyToken).IsRequired().HasMaxLength(10);
                entity.Property(e => e.SellAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.BuyAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.SellerAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.BuyerAddress).HasMaxLength(42);
                entity.Property(e => e.Status).IsRequired().HasMaxLength(20).HasDefaultValue("CREATED");
                entity.Property(e => e.TransactionType).IsRequired().HasMaxLength(20).HasDefaultValue("CREATE_ORDER");
                entity.Property(e => e.GasUsed).HasColumnType("decimal(18,8)");
                entity.Property(e => e.GasFee).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Notes).HasMaxLength(500);
                entity.HasOne(e => e.User)
                    .WithMany()
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => e.TxHash).IsUnique();
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.TransactionTime);
                entity.HasIndex(e => new { e.SellToken, e.BuyToken });
                entity.HasIndex(e => e.Status);
            });

            // Configure CurrentGameSession entity
            modelBuilder.Entity<CurrentGameSession>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.StartPrice).HasColumnType("decimal(18,8)");
                entity.Property(e => e.CurrentPrice).HasColumnType("decimal(18,8)");
                entity.Property(e => e.FinalPrice).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Status).IsRequired().HasMaxLength(20);
                entity.HasIndex(e => e.Status);
                entity.HasIndex(e => e.StartTime);
                entity.HasIndex(e => new { e.Status, e.StartTime });
            });

            // Configure ActiveBet entity
            modelBuilder.Entity<ActiveBet>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.UserAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.BetAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Direction).IsRequired().HasMaxLength(10);
                entity.Property(e => e.PayoutRatio).HasColumnType("decimal(5,2)").HasDefaultValue(1.9m);
                entity.HasOne(e => e.Session)
                    .WithMany(s => s.ActiveBets)
                    .HasForeignKey(e => e.SessionId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => e.SessionId);
                entity.HasIndex(e => e.UserAddress);
                entity.HasIndex(e => new { e.SessionId, e.Direction });
            });

            // Configure ProfitAnalysis entity
            modelBuilder.Entity<ProfitAnalysis>(entity =>
            {
                entity.HasKey(e => e.SessionId);
                entity.Property(e => e.TotalUpBets).HasColumnType("decimal(18,8)");
                entity.Property(e => e.TotalDownBets).HasColumnType("decimal(18,8)");
                entity.Property(e => e.UpWinProfit).HasColumnType("decimal(18,8)");
                entity.Property(e => e.DownWinProfit).HasColumnType("decimal(18,8)");
                entity.Property(e => e.RecommendedOutcome).HasMaxLength(10);
                entity.HasOne(e => e.Session)
                    .WithOne(s => s.ProfitAnalysis)
                    .HasForeignKey<ProfitAnalysis>(e => e.SessionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure DailyTargetTracking entity
            modelBuilder.Entity<DailyTargetTracking>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.StartBalance).HasColumnType("decimal(18,8)");
                entity.Property(e => e.CurrentBalance).HasColumnType("decimal(18,8)");
                entity.Property(e => e.TargetPercentage).HasColumnType("decimal(5,2)");
                entity.Property(e => e.TargetAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.AchievedAmount).HasColumnType("decimal(18,8)");
                entity.HasIndex(e => e.Date).IsUnique();
                entity.HasIndex(e => e.IsTargetAchieved);
            });

            // ❌ REMOVED: BotTransactionHistory configuration - merged into PMCoinPriceHistory
            // modelBuilder.Entity<BotTransactionHistory>(entity =>
            // {
            //     entity.HasKey(e => e.Id);
            //     entity.Property(e => e.BotWalletAddress).IsRequired().HasMaxLength(42);
            //     entity.Property(e => e.Action).IsRequired().HasMaxLength(10);
            //     entity.Property(e => e.Amount).HasColumnType("decimal(18,8)");
            //     entity.Property(e => e.Price).HasColumnType("decimal(18,8)");
            //     entity.Property(e => e.PriceImpact).HasColumnType("decimal(18,8)");
            //     entity.Property(e => e.Reason).HasMaxLength(100);
            //     entity.HasOne(e => e.Session)
            //         .WithMany()
            //         .HasForeignKey(e => e.SessionId)
            //         .OnDelete(DeleteBehavior.SetNull);
            //     entity.HasIndex(e => e.Timestamp);
            //     entity.HasIndex(e => e.Action);
            //     entity.HasIndex(e => e.SessionId);
            // });

            // Configure UserGameStats entity
            modelBuilder.Entity<UserGameStats>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.WalletAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.TotalBetAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.TotalWinAmount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.TotalLossAmount).HasColumnType("decimal(18,8)");
                entity.HasIndex(e => e.WalletAddress).IsUnique();
                entity.HasIndex(e => e.IsBlacklisted);
                entity.HasIndex(e => e.IsWhitelisted);
                entity.HasIndex(e => new { e.IsBlacklisted, e.ConsecutiveWins });
                entity.HasIndex(e => new { e.IsWhitelisted, e.ConsecutiveLosses });
            });

            // Configure SmartContractLog entity
            modelBuilder.Entity<SmartContractLog>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.EventType).IsRequired().HasMaxLength(50);
                entity.Property(e => e.TransactionHash).IsRequired().HasMaxLength(66);
                entity.Property(e => e.FromAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.ToAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.Amount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.EventData).HasColumnType("text");
                entity.HasIndex(e => e.EventType);
                entity.HasIndex(e => e.TransactionHash).IsUnique();
                entity.HasIndex(e => e.FromAddress);
                entity.HasIndex(e => e.ToAddress);
                entity.HasIndex(e => e.Timestamp);
                entity.HasIndex(e => new { e.Date, e.Hour });
            });

            // Configure UserBalance entity
            modelBuilder.Entity<UserBalance>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.WalletAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.TokenSymbol).IsRequired().HasMaxLength(10).HasDefaultValue("PM");
                entity.Property(e => e.Balance).HasColumnType("decimal(18,8)").HasDefaultValue(0);
                entity.Property(e => e.LockedBalance).HasColumnType("decimal(18,8)").HasDefaultValue(0);
                entity.HasOne(e => e.User)
                    .WithMany(u => u.UserBalances)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.WalletAddress);
                entity.HasIndex(e => new { e.UserId, e.TokenSymbol }).IsUnique();
            });

            // Configure BalanceTransaction entity
            modelBuilder.Entity<BalanceTransaction>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.WalletAddress).IsRequired().HasMaxLength(42);
                entity.Property(e => e.TokenSymbol).IsRequired().HasMaxLength(10).HasDefaultValue("PM");
                entity.Property(e => e.TransactionType).IsRequired().HasMaxLength(20);
                entity.Property(e => e.Amount).HasColumnType("decimal(18,8)");
                entity.Property(e => e.BalanceBefore).HasColumnType("decimal(18,8)");
                entity.Property(e => e.BalanceAfter).HasColumnType("decimal(18,8)");
                entity.Property(e => e.Description).HasMaxLength(100);
                entity.Property(e => e.TransactionHash).HasMaxLength(66);
                entity.HasOne(e => e.User)
                    .WithMany(u => u.BalanceTransactions)
                    .HasForeignKey(e => e.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
                entity.HasIndex(e => e.UserId);
                entity.HasIndex(e => e.WalletAddress);
                entity.HasIndex(e => e.TransactionType);
                entity.HasIndex(e => e.CreatedAt);
                entity.HasIndex(e => e.RelatedBetId);
            });

            // Configure Notification entity
            modelBuilder.Entity<Notification>(entity =>
            {
                entity.HasKey(e => e.Id);
                entity.Property(e => e.Content).IsRequired().HasMaxLength(500);
                entity.Property(e => e.IsRead).HasDefaultValue(false);
                entity.HasOne(e => e.User)
                        .WithMany()
                        .HasForeignKey(e => e.UserId)
                        .OnDelete(DeleteBehavior.Cascade);
            });

            // Configure BlockedUser entity
            modelBuilder.Entity<BlockedUser>(entity =>
            {
                // Define composite primary key
                entity.HasKey(bu => new { bu.BlockerId, bu.BlockedId });

                // Configure relationship for the user who is blocking
                entity.HasOne(bu => bu.Blocker)
                    .WithMany() // Assuming User model doesn't have a navigation property for blocks they initiated
                    .HasForeignKey(bu => bu.BlockerId)
                    .OnDelete(DeleteBehavior.Restrict); // Prevent deleting a user if they have active blocks

                // Configure relationship for the user who is being blocked
                entity.HasOne(bu => bu.Blocked)
                    .WithMany() // Assuming User model doesn't have a navigation property for blocks against them
                    .HasForeignKey(bu => bu.BlockedId)
                    .OnDelete(DeleteBehavior.Restrict); // Prevent deleting a user if they are blocked
            });
        } // Closing brace for OnModelCreating

        protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
        {
            if (!optionsBuilder.IsConfigured)
            {
                optionsBuilder.UseNpgsql("Host=localhost;Port=5432;Database=TradeFinance;Username=postgres;Password=1234");
            }
        }
    }
}
