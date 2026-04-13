import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getPresetRange } from "@/lib/date-range-presets";

describe("getPresetRange", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("today는 오늘 날짜를 from/to 모두 반환한다", () => {
    const { from, to } = getPresetRange("today");
    expect(from).toEqual(new Date("2026-04-10T00:00:00"));
    expect(to).toEqual(new Date("2026-04-10T00:00:00"));
  });

  it("yesterday는 전날 날짜를 from/to 모두 반환한다", () => {
    const { from, to } = getPresetRange("yesterday");
    expect(from).toEqual(new Date("2026-04-09T00:00:00"));
    expect(to).toEqual(new Date("2026-04-09T00:00:00"));
  });

  it("week은 7일 전부터 오늘까지 반환한다", () => {
    const { from, to } = getPresetRange("week");
    expect(from).toEqual(new Date("2026-04-03T00:00:00"));
    expect(to).toEqual(new Date("2026-04-10T00:00:00"));
  });

  it("month는 한달 전부터 오늘까지 반환한다", () => {
    const { from, to } = getPresetRange("month");
    expect(from).toEqual(new Date("2026-03-10T00:00:00"));
    expect(to).toEqual(new Date("2026-04-10T00:00:00"));
  });
});
