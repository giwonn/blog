import { test, expect } from "@playwright/test";

const API_BASE = "http://localhost:8081";

test.describe("글 작성/발행 흐름", () => {
  let createdArticleId: number;

  test("글을 임시저장한다", async ({ page }) => {
    await page.goto("/articles/new");

    await page.fill('input[placeholder="제목을 입력하세요"]', "E2E 테스트 글");

    // Tiptap 에디터에 내용 입력
    const editor = page.locator(".ProseMirror");
    await editor.click();
    await editor.fill("E2E 테스트 내용입니다.");

    // 임시저장 버튼 클릭
    await page.click('button:has-text("임시저장")');

    // 글 목록으로 이동 확인
    await page.waitForURL(/\/articles/);

    // 목록에서 방금 작성한 글 확인
    await expect(page.locator("text=E2E 테스트 글")).toBeVisible();
  });

  test("임시저장된 글을 발행한다", async ({ page }) => {
    // API로 글 생성
    const res = await fetch(`${API_BASE}/admin/articles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "발행 테스트 글", content: "발행할 내용" }),
    });
    const { data } = await res.json();
    createdArticleId = data.id;

    // 글 상세 페이지
    await page.goto(`/articles/${createdArticleId}`);

    // 임시저장 상태 확인
    await expect(page.locator("text=임시저장")).toBeVisible();

    // 발행 버튼 클릭
    await page.click('button:has-text("발행")');

    // 발행 확인
    await page.waitForTimeout(1000);
    await expect(page.locator("text=발행")).toBeVisible();
  });

  test("발행된 글이 블로그 API에서 조회된다", async () => {
    // api-blog에서 PUBLISHED 글만 조회
    const res = await fetch("http://localhost:8080/articles");
    const { data } = await res.json();

    const found = data.content.find(
      (a: { id: number }) => a.id === createdArticleId
    );
    expect(found).toBeTruthy();
    expect(found.title).toBe("발행 테스트 글");
  });

  test("글 목록에서 상태 필터가 동작한다", async ({ page }) => {
    await page.goto("/articles");

    // 임시저장 탭 클릭
    await page.click('button:has-text("임시저장")');
    await page.waitForTimeout(500);

    // 임시저장 상태의 글만 표시되어야 함 (발행된 글은 안 보임)
    const rows = page.locator("tbody tr");
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      await expect(rows.nth(i).locator("text=임시저장")).toBeVisible();
    }
  });

  test("글을 삭제한다", async ({ page }) => {
    if (!createdArticleId) return;

    await page.goto(`/articles/${createdArticleId}`);

    // 삭제 확인 다이얼로그 처리
    page.on("dialog", (dialog) => dialog.accept());
    await page.click('button:has-text("삭제")');

    await page.waitForURL(/\/articles/);
  });

  test.afterAll(async () => {
    // 테스트 데이터 정리
    if (createdArticleId) {
      await fetch(`${API_BASE}/admin/articles/${createdArticleId}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    // E2E 테스트 글 정리
    const res = await fetch(`${API_BASE}/admin/articles?size=100`);
    const { data } = await res.json();
    for (const article of data.content) {
      if (article.title.startsWith("E2E 테스트")) {
        await fetch(`${API_BASE}/admin/articles/${article.id}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    }
  });
});

test.describe("설정 페이지", () => {
  test("블로그 이름을 수정한다", async ({ page }) => {
    await page.goto("/settings");

    const nameInput = page.locator('input[type="text"]').first();
    await nameInput.clear();
    await nameInput.fill("테스트 블로그");

    await page.click('button:has-text("저장")');

    // 토스트 알림 확인
    await expect(page.locator("text=저장되었습니다")).toBeVisible();
  });

  test("분석 추적을 토글한다", async ({ page }) => {
    await page.goto("/settings");

    // 토글 클릭
    const toggle = page.locator('[role="switch"]');
    await toggle.click();

    // 분석 설정 저장
    const saveButtons = page.locator('button:has-text("저장")');
    await saveButtons.last().click();

    await expect(page.locator("text=저장되었습니다")).toBeVisible();
  });
});
