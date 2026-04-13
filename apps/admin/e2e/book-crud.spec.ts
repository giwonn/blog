import { test, expect } from "@playwright/test";

test.describe("Book CRUD", () => {
  test("book management page loads", async ({ page }) => {
    await page.goto("/books");
    await expect(page.getByText("독후감")).toBeVisible();
  });
});
