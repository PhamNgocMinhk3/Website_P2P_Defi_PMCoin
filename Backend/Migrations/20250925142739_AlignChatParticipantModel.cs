using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AlignChatParticipantModel : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "Role",
                table: "ChatParticipants",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "Member",
                oldClrType: typeof(int),
                oldType: "integer",
                oldDefaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "Role",
                table: "ChatParticipants",
                type: "integer",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(string),
                oldType: "character varying(50)",
                oldMaxLength: 50,
                oldDefaultValue: "Member");
        }
    }
}
