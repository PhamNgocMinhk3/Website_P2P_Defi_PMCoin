using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddGameTables : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "P2POrders");

            migrationBuilder.CreateTable(
                name: "CurrentGameSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StartTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EndTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartPrice = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    CurrentPrice = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    FinalPrice = table.Column<decimal>(type: "numeric(18,8)", nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    TimeLeftSeconds = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CurrentGameSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DailyTargetTrackings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StartBalance = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    CurrentBalance = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    TargetPercentage = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    TargetAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    AchievedAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    IsTargetAchieved = table.Column<bool>(type: "boolean", nullable: false),
                    TotalRounds = table.Column<int>(type: "integer", nullable: false),
                    ProfitableRounds = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DailyTargetTrackings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserGameStats",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    ConsecutiveWins = table.Column<int>(type: "integer", nullable: false),
                    ConsecutiveLoses = table.Column<int>(type: "integer", nullable: false),
                    TotalBets = table.Column<int>(type: "integer", nullable: false),
                    TotalWins = table.Column<int>(type: "integer", nullable: false),
                    TotalLoses = table.Column<int>(type: "integer", nullable: false),
                    TotalBetAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    TotalWinAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    TotalLoseAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    IsBlacklisted = table.Column<bool>(type: "boolean", nullable: false),
                    IsWhitelisted = table.Column<bool>(type: "boolean", nullable: false),
                    LastBetTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BlacklistedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WhitelistedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserGameStats", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ActiveBets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    BetAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Direction = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    PayoutRatio = table.Column<decimal>(type: "numeric(5,2)", nullable: false, defaultValue: 1.9m),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ActiveBets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActiveBets_CurrentGameSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "CurrentGameSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BotTransactionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BotWalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    Action = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    PriceImpact = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BotTransactionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BotTransactionHistories_CurrentGameSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "CurrentGameSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ProfitAnalyses",
                columns: table => new
                {
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    TotalUpBets = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    TotalDownBets = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    UpWinProfit = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    DownWinProfit = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    RecommendedOutcome = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ManipulationNeeded = table.Column<bool>(type: "boolean", nullable: false),
                    TotalBetCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProfitAnalyses", x => x.SessionId);
                    table.ForeignKey(
                        name: "FK_ProfitAnalyses_CurrentGameSessions_SessionId",
                        column: x => x.SessionId,
                        principalTable: "CurrentGameSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActiveBets_SessionId",
                table: "ActiveBets",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_ActiveBets_SessionId_Direction",
                table: "ActiveBets",
                columns: new[] { "SessionId", "Direction" });

            migrationBuilder.CreateIndex(
                name: "IX_ActiveBets_UserAddress",
                table: "ActiveBets",
                column: "UserAddress");

            migrationBuilder.CreateIndex(
                name: "IX_BotTransactionHistories_Action",
                table: "BotTransactionHistories",
                column: "Action");

            migrationBuilder.CreateIndex(
                name: "IX_BotTransactionHistories_SessionId",
                table: "BotTransactionHistories",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_BotTransactionHistories_Timestamp",
                table: "BotTransactionHistories",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_CurrentGameSessions_StartTime",
                table: "CurrentGameSessions",
                column: "StartTime");

            migrationBuilder.CreateIndex(
                name: "IX_CurrentGameSessions_Status",
                table: "CurrentGameSessions",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_CurrentGameSessions_Status_StartTime",
                table: "CurrentGameSessions",
                columns: new[] { "Status", "StartTime" });

            migrationBuilder.CreateIndex(
                name: "IX_DailyTargetTrackings_Date",
                table: "DailyTargetTrackings",
                column: "Date",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DailyTargetTrackings_IsTargetAchieved",
                table: "DailyTargetTrackings",
                column: "IsTargetAchieved");

            migrationBuilder.CreateIndex(
                name: "IX_UserGameStats_IsBlacklisted",
                table: "UserGameStats",
                column: "IsBlacklisted");

            migrationBuilder.CreateIndex(
                name: "IX_UserGameStats_IsBlacklisted_ConsecutiveWins",
                table: "UserGameStats",
                columns: new[] { "IsBlacklisted", "ConsecutiveWins" });

            migrationBuilder.CreateIndex(
                name: "IX_UserGameStats_IsWhitelisted",
                table: "UserGameStats",
                column: "IsWhitelisted");

            migrationBuilder.CreateIndex(
                name: "IX_UserGameStats_IsWhitelisted_ConsecutiveLoses",
                table: "UserGameStats",
                columns: new[] { "IsWhitelisted", "ConsecutiveLoses" });

            migrationBuilder.CreateIndex(
                name: "IX_UserGameStats_WalletAddress",
                table: "UserGameStats",
                column: "WalletAddress",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActiveBets");

            migrationBuilder.DropTable(
                name: "BotTransactionHistories");

            migrationBuilder.DropTable(
                name: "DailyTargetTrackings");

            migrationBuilder.DropTable(
                name: "ProfitAnalyses");

            migrationBuilder.DropTable(
                name: "UserGameStats");

            migrationBuilder.DropTable(
                name: "CurrentGameSessions");

            migrationBuilder.CreateTable(
                name: "P2POrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MatchedWithUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    BuyAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BuyToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ContractTxHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    EscrowTxHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MatchedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MatchedWalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: true),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    SellAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    SellToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "ACTIVE"),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    WalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_P2POrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_P2POrders_Users_MatchedWithUserId",
                        column: x => x.MatchedWithUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_P2POrders_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_P2POrders_MatchedWithUserId",
                table: "P2POrders",
                column: "MatchedWithUserId");

            migrationBuilder.CreateIndex(
                name: "IX_P2POrders_SellToken_BuyToken",
                table: "P2POrders",
                columns: new[] { "SellToken", "BuyToken" });

            migrationBuilder.CreateIndex(
                name: "IX_P2POrders_Status",
                table: "P2POrders",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_P2POrders_UserId",
                table: "P2POrders",
                column: "UserId");
        }
    }
}
