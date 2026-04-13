import { test, expect } from "@playwright/test";

test.describe("Books flow", () => {
  test("books list page loads", async ({ page }) => {
    await page.goto("/books");
    await expect(page.getByText("독후감")).toBeVisible();
  });
});
