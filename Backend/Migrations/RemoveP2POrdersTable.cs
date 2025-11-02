using Microsoft.EntityFrameworkCore.Migrations;
using System;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class RemoveP2POrdersTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Drop foreign key constraints first
            migrationBuilder.DropForeignKey(
                name: "FK_P2POrders_Users_MatchedWithUserId",
                table: "P2POrders");

            migrationBuilder.DropForeignKey(
                name: "FK_P2POrders_Users_UserId",
                table: "P2POrders");

            // Drop indexes
            migrationBuilder.DropIndex(
                name: "IX_P2POrders_MatchedWithUserId",
                table: "P2POrders");

            migrationBuilder.DropIndex(
                name: "IX_P2POrders_SellToken_BuyToken",
                table: "P2POrders");

            migrationBuilder.DropIndex(
                name: "IX_P2POrders_Status",
                table: "P2POrders");

            migrationBuilder.DropIndex(
                name: "IX_P2POrders_UserId",
                table: "P2POrders");

            // Drop the P2POrders table
            migrationBuilder.DropTable(
                name: "P2POrders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Recreate P2POrders table if rollback is needed
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

            // Recreate indexes
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
        }
    }
}
