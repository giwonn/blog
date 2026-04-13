import { test, expect } from "@playwright/test";

test.describe("Header navigation", () => {
  test("displays all nav links", async ({ page }) => {
    await page.goto("/");
    const nav = page.locator("header nav");
    await expect(nav.getByText("글")).toBeVisible();
    await expect(nav.getByText("시리즈")).toBeVisible();
    await expect(nav.getByText("독후감")).toBeVisible();
    await expect(nav.getByText("소개")).toBeVisible();
  });

  test("navigates to series page", async ({ page }) => {
    await page.goto("/");
    await page.click("header nav >> text=시리즈");
    await expect(page).toHaveURL("/series");
  });

  test("navigates to books page", async ({ page }) => {
    await page.goto("/");
    await page.click("header nav >> text=독후감");
    await expect(page).toHaveURL("/books");
  });
});
