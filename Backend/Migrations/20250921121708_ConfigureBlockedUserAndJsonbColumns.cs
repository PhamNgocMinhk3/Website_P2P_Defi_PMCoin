using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class ConfigureBlockedUserAndJsonbColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Manually alter columns using SQL to provide a USING clause for casting.
            // This is necessary because PostgreSQL cannot automatically cast 'text' to 'jsonb'.
            // Also handles empty strings by converting them to NULL before casting.
            migrationBuilder.Sql(@"
                UPDATE ""Messages"" SET ""PollData"" = NULL WHERE ""PollData"" = '' OR ""PollData"" IS NULL;
                ALTER TABLE ""Messages"" ALTER COLUMN ""PollData"" TYPE jsonb USING ""PollData""::jsonb;
            ");

            migrationBuilder.Sql(@"
                UPDATE ""Messages"" SET ""AppointmentData"" = NULL WHERE ""AppointmentData"" = '' OR ""AppointmentData"" IS NULL;
                ALTER TABLE ""Messages"" ALTER COLUMN ""AppointmentData"" TYPE jsonb USING ""AppointmentData""::jsonb;
            ");

            migrationBuilder.CreateTable(
                name: "BlockedUsers",
                columns: table => new
                {
                    BlockerId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockedId = table.Column<Guid>(type: "uuid", nullable: false),
                    BlockedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BlockedUsers", x => new { x.BlockerId, x.BlockedId });
                    table.ForeignKey(
                        name: "FK_BlockedUsers_Users_BlockedId",
                        column: x => x.BlockedId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_BlockedUsers_Users_BlockerId",
                        column: x => x.BlockerId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BlockedUsers_BlockedId",
                table: "BlockedUsers",
                column: "BlockedId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BlockedUsers");

            migrationBuilder.AlterColumn<string>(
                name: "PollData",
                table: "Messages",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);

            migrationBuilder.AlterColumn<string>(
                name: "AppointmentData",
                table: "Messages",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "jsonb",
                oldNullable: true);
        }
    }
}
