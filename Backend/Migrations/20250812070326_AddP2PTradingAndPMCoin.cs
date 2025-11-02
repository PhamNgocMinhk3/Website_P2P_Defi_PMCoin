using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddP2PTradingAndPMCoin : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // First add Username column with default values
            migrationBuilder.AddColumn<string>(
                name: "Username",
                table: "Users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "user");

            // Update existing users with unique usernames based on email
            migrationBuilder.Sql(@"
                UPDATE ""Users""
                SET ""Username"" = CONCAT('user_', EXTRACT(EPOCH FROM ""CreatedAt"")::bigint)
                WHERE ""Username"" = 'user' OR ""Username"" = '';
            ");

            migrationBuilder.CreateTable(
                name: "P2POrders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SellToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BuyToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    SellAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BuyAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "ACTIVE"),
                    WalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    ContractTxHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    EscrowTxHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MatchedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MatchedWithUserId = table.Column<Guid>(type: "uuid", nullable: true),
                    MatchedWalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
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

            migrationBuilder.CreateTable(
                name: "PMCoinPriceHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    PreviousPrice = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Change = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    ChangePercent = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Hour = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PMCoinPriceHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PMCoinPrices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Change24h = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    ChangePercent24h = table.Column<decimal>(type: "numeric(5,2)", nullable: false),
                    Volume24h = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    MarketCap = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PMCoinPrices", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Users_Username",
                table: "Users",
                column: "Username",
                unique: true);

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

            migrationBuilder.CreateIndex(
                name: "IX_PMCoinPriceHistories_Date_Hour",
                table: "PMCoinPriceHistories",
                columns: new[] { "Date", "Hour" });

            migrationBuilder.CreateIndex(
                name: "IX_PMCoinPriceHistories_Timestamp",
                table: "PMCoinPriceHistories",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_PMCoinPrices_CreatedAt",
                table: "PMCoinPrices",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_PMCoinPrices_IsActive_CreatedAt",
                table: "PMCoinPrices",
                columns: new[] { "IsActive", "CreatedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "P2POrders");

            migrationBuilder.DropTable(
                name: "PMCoinPriceHistories");

            migrationBuilder.DropTable(
                name: "PMCoinPrices");

            migrationBuilder.DropIndex(
                name: "IX_Users_Username",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Username",
                table: "Users");
        }
    }
}
