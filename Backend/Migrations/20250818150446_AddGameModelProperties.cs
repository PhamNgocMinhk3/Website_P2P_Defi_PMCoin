using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddGameModelProperties : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "HouseProfit",
                table: "CurrentGameSessions",
                type: "numeric(18,8)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsCompleted",
                table: "CurrentGameSessions",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Amount",
                table: "ActiveBets",
                type: "numeric(18,8)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "EntryPrice",
                table: "ActiveBets",
                type: "numeric(18,8)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<bool>(
                name: "IsSettled",
                table: "ActiveBets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Payout",
                table: "ActiveBets",
                type: "numeric(18,8)",
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "HouseProfit",
                table: "CurrentGameSessions");

            migrationBuilder.DropColumn(
                name: "IsCompleted",
                table: "CurrentGameSessions");

            migrationBuilder.DropColumn(
                name: "Amount",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "EntryPrice",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "IsSettled",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "Payout",
                table: "ActiveBets");
        }
    }
}
