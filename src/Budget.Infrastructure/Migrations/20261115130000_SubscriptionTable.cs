using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Budget.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SubscriptionTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Expand only: a new table that the previous app version never reads or writes.
            migrationBuilder.CreateTable(
                name: "Subscription",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UserId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Source = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ExternalId = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    Plan = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    CurrentPeriodEnd = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    TrialEnd = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: true),
                    CancelAtPeriodEnd = table.Column<bool>(type: "bit", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "datetimeoffset", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Subscription", x => x.Id);
                    table.CheckConstraint("CK_Subscription_Plan", "[Plan] COLLATE Latin1_General_100_BIN2 IN ('premium')");
                    table.CheckConstraint("CK_Subscription_Source", "[Source] COLLATE Latin1_General_100_BIN2 IN ('app_store', 'google_play', 'manual')");
                    table.CheckConstraint("CK_Subscription_Status", "[Status] COLLATE Latin1_General_100_BIN2 IN ('trialing', 'active', 'past_due', 'cancelled', 'expired')");
                    table.ForeignKey(
                        name: "FK_Subscription_User_UserId",
                        column: x => x.UserId,
                        principalTable: "User",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Subscription_UserId_Source_ExternalId",
                table: "Subscription",
                columns: new[] { "UserId", "Source", "ExternalId" },
                unique: true,
                filter: "[ExternalId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Subscription");
        }
    }
}
