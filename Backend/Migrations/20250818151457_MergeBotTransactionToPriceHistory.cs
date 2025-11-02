using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class MergeBotTransactionToPriceHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "BotAction",
                table: "PMCoinPriceHistories",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "BotAmount",
                table: "PMCoinPriceHistories",
                type: "numeric(18,8)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BotWalletAddress",
                table: "PMCoinPriceHistories",
                type: "character varying(42)",
                maxLength: 42,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PriceImpact",
                table: "PMCoinPriceHistories",
                type: "numeric(18,8)",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SessionId",
                table: "PMCoinPriceHistories",
                type: "uuid",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BotAction",
                table: "PMCoinPriceHistories");

            migrationBuilder.DropColumn(
                name: "BotAmount",
                table: "PMCoinPriceHistories");

            migrationBuilder.DropColumn(
                name: "BotWalletAddress",
                table: "PMCoinPriceHistories");

            migrationBuilder.DropColumn(
                name: "PriceImpact",
                table: "PMCoinPriceHistories");

            migrationBuilder.DropColumn(
                name: "SessionId",
                table: "PMCoinPriceHistories");
        }
    }
}
