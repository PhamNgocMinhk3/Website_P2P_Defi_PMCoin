using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class DropBotTransactionHistoryTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BotTransactionHistories");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BotTransactionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    Action = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BotWalletAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    PriceImpact = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    Reason = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
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
        }
    }
}
