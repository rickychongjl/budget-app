using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Budget.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CycleCategoryAutoPay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Expand only: the previous app version inserts without the column and gets false, which is what it meant.
            migrationBuilder.AddColumn<bool>(
                name: "AutoPay",
                table: "CycleCategory",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AutoPay",
                table: "CycleCategory");
        }
    }
}
