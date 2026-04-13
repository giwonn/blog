import { describe, it, expect } from "vitest";
import { formatDateTime } from "@/lib/format-date-time";

describe("formatDateTime", () => {
  it("UTC 시간을 KST(+9)로 변환한다", () => {
    expect(formatDateTime("2026-04-10T14:30:00")).toBe("2026.04.10 23:30");
  });

  it("UTC 자정은 KST 09:00으로 변환한다", () => {
    expect(formatDateTime("2026-04-10T00:00:00")).toBe("2026.04.10 09:00");
  });

  it("UTC 15시 이후는 KST 다음날로 넘어간다", () => {
    expect(formatDateTime("2026-04-10T18:00:00")).toBe("2026.04.11 03:00");
  });

  it("한 자리 월/일/시/분도 앞에 0을 붙인다", () => {
    expect(formatDateTime("2026-01-05T03:07:00")).toBe("2026.01.05 12:07");
  });

  it("Z 접미사가 이미 있는 경우도 처리한다", () => {
    expect(formatDateTime("2026-04-10T14:30:00Z")).toBe("2026.04.10 23:30");
  });
});
