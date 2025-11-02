using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddSmartContractLog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Payout",
                table: "ActiveBets",
                newName: "PayoutAmount");

            migrationBuilder.AddColumn<long>(
                name: "ContractBetId",
                table: "ActiveBets",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Result",
                table: "ActiveBets",
                type: "character varying(10)",
                maxLength: 10,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SettledAt",
                table: "ActiveBets",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TransactionHash",
                table: "ActiveBets",
                type: "character varying(66)",
                maxLength: 66,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SmartContractLogs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EventType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    TransactionHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    BlockNumber = table.Column<long>(type: "bigint", nullable: false),
                    FromAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    ToAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    EventData = table.Column<string>(type: "text", nullable: true),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Date = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Hour = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SmartContractLogs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_Date_Hour",
                table: "SmartContractLogs",
                columns: new[] { "Date", "Hour" });

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_EventType",
                table: "SmartContractLogs",
                column: "EventType");

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_FromAddress",
                table: "SmartContractLogs",
                column: "FromAddress");

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_Timestamp",
                table: "SmartContractLogs",
                column: "Timestamp");

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_ToAddress",
                table: "SmartContractLogs",
                column: "ToAddress");

            migrationBuilder.CreateIndex(
                name: "IX_SmartContractLogs_TransactionHash",
                table: "SmartContractLogs",
                column: "TransactionHash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SmartContractLogs");

            migrationBuilder.DropColumn(
                name: "ContractBetId",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "Result",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "SettledAt",
                table: "ActiveBets");

            migrationBuilder.DropColumn(
                name: "TransactionHash",
                table: "ActiveBets");

            migrationBuilder.RenameColumn(
                name: "PayoutAmount",
                table: "ActiveBets",
                newName: "Payout");
        }
    }
}
