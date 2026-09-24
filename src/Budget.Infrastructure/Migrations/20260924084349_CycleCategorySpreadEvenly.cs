using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Budget.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class CycleCategorySpreadEvenly : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // True by hand, not EF's false: existing rows, and inserts from the previous app version (which does not
            // know the column), are categories spent a little at a time. The model has no default on purpose
            // (BudgetDbContext), so the snapshot does not record this one.
            migrationBuilder.AddColumn<bool>(
                name: "SpreadEvenly",
                table: "CycleCategory",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SpreadEvenly",
                table: "CycleCategory");
        }
    }
}
