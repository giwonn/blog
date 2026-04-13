import { test, expect } from "@playwright/test";
import { createMockApiServer } from "./mock-api-server";
import type http from "http";

let mockServer: http.Server;

test.beforeAll(async () => {
  mockServer = createMockApiServer(8081);
  await new Promise<void>((resolve) => mockServer.listen(8081, resolve));
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => mockServer.close(() => resolve()));
});

test.describe("분석 페이지 - 접속 IP", () => {
  test("IP 클릭 시 목록이 상세 이력으로 전환되고, 뒤로가기로 복귀한다", async ({ page }) => {
    await page.goto("/analytics");

    // IP 목록 로드 대기
    const ipRow = page.locator("#map tbody tr").first();
    await ipRow.waitFor({ state: "visible", timeout: 30000 });

    // IP 목록이 보이는지 확인
    await expect(page.locator("#map th:has-text('IP')")).toBeVisible();
    await expect(page.locator("#map th:has-text('방문수')")).toBeVisible();
    await expect(page.locator("#map td:has-text('1.1.1.1')")).toBeVisible();

    // IP 클릭 → 상세 이력으로 전환
    await ipRow.click();

    // 뒤로가기 버튼 표시 확인
    const backButton = page.locator("#map button").first();
    await expect(backButton).toBeVisible();

    // IP 주소와 위치 정보가 헤더에 표시
    await expect(page.locator("#map h3:has-text('1.1.1.1')")).toBeVisible();

    // 상세 이력 테이블 (페이지, 위치, 접속 시간)
    await expect(page.locator("#map th:has-text('페이지')")).toBeVisible();
    await expect(page.locator("#map th:has-text('접속 시간')")).toBeVisible();

    // 기존 IP 목록의 "방문수" 컬럼은 사라져야 함
    await expect(page.locator("#map th:has-text('방문수')")).not.toBeVisible();

    await page.screenshot({ path: "e2e/screenshots/ip-detail-view.png", fullPage: true });

    // 뒤로가기 클릭 → IP 목록 복귀
    await backButton.click();

    // IP 목록이 다시 표시
    await expect(page.locator("#map th:has-text('방문수')")).toBeVisible();
    await expect(page.locator("#map td:has-text('1.1.1.1')")).toBeVisible();

    // 상세 이력 헤더는 사라짐
    await expect(page.locator("#map h3:has-text('1.1.1.1')")).not.toBeVisible();
  });
});

test.describe("분석 페이지 - 인기 페이지 모달", () => {
  test("인기 페이지 클릭 시 접속 이력 모달이 표시된다", async ({ page }) => {
    await page.goto("/analytics");

    // 인기 페이지 섹션 대기
    const pageRow = page.locator("#popular tbody tr").first();
    await pageRow.waitFor({ state: "visible", timeout: 30000 });

    // 클릭하여 모달 열기
    await pageRow.click();
    const modalBackdrop = page.locator(".fixed.inset-0").first();
    await modalBackdrop.waitFor({ state: "visible", timeout: 5000 });

    // 모달 내용 확인
    const dialog = page.locator(".fixed.inset-0 .bg-white.rounded-lg").first();
    await expect(dialog).toBeVisible();

    // 모달 헤더에 글 제목
    await expect(dialog.locator("h3")).toContainText("TDD로 개발하기");

    // IP, 지역, 접속 시간 컬럼
    const headers = dialog.locator("thead th");
    await expect(headers.nth(0)).toContainText("IP");
    await expect(headers.nth(1)).toContainText("지역");
    await expect(headers.nth(2)).toContainText("접속 시간");

    // 데이터 행
    const rows = dialog.locator("tbody tr");
    expect(await rows.count()).toBe(3);
    await expect(rows.first().locator("td").first()).toContainText("1.1.1.1");

    await page.screenshot({ path: "e2e/screenshots/popular-page-modal.png", fullPage: true });
  });
});
