using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddUserBalanceAndTransactions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BalanceTransactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    TokenSymbol = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "PM"),
                    TransactionType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BalanceBefore = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BalanceAfter = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Description = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TransactionHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: true),
                    RelatedBetId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BalanceTransactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BalanceTransactions_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UserBalances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    WalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    TokenSymbol = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "PM"),
                    Balance = table.Column<decimal>(type: "numeric(18,8)", nullable: false, defaultValue: 0m),
                    LockedBalance = table.Column<decimal>(type: "numeric(18,8)", nullable: false, defaultValue: 0m),
                    LastUpdated = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserBalances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UserBalances_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BalanceTransactions_CreatedAt",
                table: "BalanceTransactions",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_BalanceTransactions_RelatedBetId",
                table: "BalanceTransactions",
                column: "RelatedBetId");

            migrationBuilder.CreateIndex(
                name: "IX_BalanceTransactions_TransactionType",
                table: "BalanceTransactions",
                column: "TransactionType");

            migrationBuilder.CreateIndex(
                name: "IX_BalanceTransactions_UserId",
                table: "BalanceTransactions",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_BalanceTransactions_WalletAddress",
                table: "BalanceTransactions",
                column: "WalletAddress");

            migrationBuilder.CreateIndex(
                name: "IX_UserBalances_UserId",
                table: "UserBalances",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_UserBalances_UserId_TokenSymbol",
                table: "UserBalances",
                columns: new[] { "UserId", "TokenSymbol" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserBalances_WalletAddress",
                table: "UserBalances",
                column: "WalletAddress");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BalanceTransactions");

            migrationBuilder.DropTable(
                name: "UserBalances");
        }
    }
}
