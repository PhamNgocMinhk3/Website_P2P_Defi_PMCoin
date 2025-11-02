using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class AddTransactionHistory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TransactionHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    TxHash = table.Column<string>(type: "character varying(66)", maxLength: 66, nullable: false),
                    SellToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BuyToken = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    SellAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    BuyAmount = table.Column<decimal>(type: "numeric(18,8)", nullable: false),
                    SellerAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: false),
                    BuyerAddress = table.Column<string>(type: "character varying(42)", maxLength: 42, nullable: true),
                    Status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "CREATED"),
                    TransactionType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false, defaultValue: "CREATE_ORDER"),
                    BlockNumber = table.Column<long>(type: "bigint", nullable: true),
                    GasUsed = table.Column<decimal>(type: "numeric(18,8)", nullable: true),
                    GasFee = table.Column<decimal>(type: "numeric(18,8)", nullable: true),
                    TransactionTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TransactionHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TransactionHistories_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionHistories_SellToken_BuyToken",
                table: "TransactionHistories",
                columns: new[] { "SellToken", "BuyToken" });

            migrationBuilder.CreateIndex(
                name: "IX_TransactionHistories_Status",
                table: "TransactionHistories",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionHistories_TransactionTime",
                table: "TransactionHistories",
                column: "TransactionTime");

            migrationBuilder.CreateIndex(
                name: "IX_TransactionHistories_TxHash",
                table: "TransactionHistories",
                column: "TxHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TransactionHistories_UserId",
                table: "TransactionHistories",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TransactionHistories");
        }
    }
}
