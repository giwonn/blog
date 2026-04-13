import { test, expect } from "@playwright/test";

test.describe("Series CRUD", () => {
  test("series management page loads", async ({ page }) => {
    await page.goto("/series");
    await expect(page.getByText("시리즈")).toBeVisible();
  });
});
