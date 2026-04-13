import { test, expect } from "@playwright/test";

test.describe("Article filter tabs", () => {
  test("displays filter tabs", async ({ page }) => {
    await page.goto("/articles");
    await expect(page.getByText("전체")).toBeVisible();
    await expect(page.getByText("일반 글")).toBeVisible();
    await expect(page.getByText("시리즈")).toBeVisible();
    await expect(page.getByText("독후감")).toBeVisible();
  });

  test("clicking filter changes URL", async ({ page }) => {
    await page.goto("/articles");
    await page.getByRole("button", { name: "시리즈" }).click();
    await expect(page).toHaveURL(/filter=series/);
  });
});
