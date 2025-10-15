using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TradeFinanceBackend.Migrations
{
    /// <inheritdoc />
    public partial class CleanupPMCoinData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Xóa tất cả PMCoinPriceHistories (ngàn dòng thừa)
            migrationBuilder.Sql("DELETE FROM \"PMCoinPriceHistories\"");

            // Giữ lại chỉ 1 record mới nhất trong PMCoinPrices, xóa còn lại
            migrationBuilder.Sql(@"
                DELETE FROM ""PMCoinPrices""
                WHERE ""Id"" NOT IN (
                    SELECT ""Id"" FROM ""PMCoinPrices""
                    ORDER BY ""CreatedAt"" DESC
                    LIMIT 1
                )
            ");

            // Đảm bảo record còn lại có IsActive = true
            migrationBuilder.Sql("UPDATE \"PMCoinPrices\" SET \"IsActive\" = true");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
