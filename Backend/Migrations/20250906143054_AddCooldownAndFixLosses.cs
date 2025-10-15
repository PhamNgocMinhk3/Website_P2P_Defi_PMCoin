using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddCooldownAndFixLosses : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CooldownUntil",
                table: "UserGameStats",
                type: "timestamp with time zone",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CooldownUntil",
                table: "UserGameStats");
        }
    }
}
