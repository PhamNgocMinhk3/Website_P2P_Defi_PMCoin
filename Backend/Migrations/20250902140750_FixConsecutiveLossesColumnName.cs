using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class FixConsecutiveLossesColumnName : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalLoses",
                table: "UserGameStats",
                newName: "TotalLosses");

            migrationBuilder.RenameColumn(
                name: "TotalLoseAmount",
                table: "UserGameStats",
                newName: "TotalLossAmount");

            migrationBuilder.RenameColumn(
                name: "ConsecutiveLoses",
                table: "UserGameStats",
                newName: "ConsecutiveLosses");

            migrationBuilder.RenameIndex(
                name: "IX_UserGameStats_IsWhitelisted_ConsecutiveLoses",
                table: "UserGameStats",
                newName: "IX_UserGameStats_IsWhitelisted_ConsecutiveLosses");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "TotalLosses",
                table: "UserGameStats",
                newName: "TotalLoses");

            migrationBuilder.RenameColumn(
                name: "TotalLossAmount",
                table: "UserGameStats",
                newName: "TotalLoseAmount");

            migrationBuilder.RenameColumn(
                name: "ConsecutiveLosses",
                table: "UserGameStats",
                newName: "ConsecutiveLoses");

            migrationBuilder.RenameIndex(
                name: "IX_UserGameStats_IsWhitelisted_ConsecutiveLosses",
                table: "UserGameStats",
                newName: "IX_UserGameStats_IsWhitelisted_ConsecutiveLoses");
        }
    }
}
