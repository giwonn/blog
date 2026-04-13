import { describe, it, expect } from "vitest";
import { sortBy } from "@/lib/sort-utils";

describe("sortBy", () => {
  const data = [
    { name: "Charlie", age: 30, score: 80 },
    { name: "Alice", age: 25, score: 95 },
    { name: "Bob", age: 35, score: 80 },
  ];

  it("문자열 키로 오름차순 정렬한다", () => {
    const result = sortBy(data, "name", "asc");
    expect(result.map((d) => d.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("문자열 키로 내림차순 정렬한다", () => {
    const result = sortBy(data, "name", "desc");
    expect(result.map((d) => d.name)).toEqual(["Charlie", "Bob", "Alice"]);
  });

  it("숫자 키로 오름차순 정렬한다", () => {
    const result = sortBy(data, "age", "asc");
    expect(result.map((d) => d.age)).toEqual([25, 30, 35]);
  });

  it("숫자 키로 내림차순 정렬한다", () => {
    const result = sortBy(data, "age", "desc");
    expect(result.map((d) => d.age)).toEqual([35, 30, 25]);
  });

  it("null 값은 항상 뒤로 보낸다", () => {
    const withNulls = [
      { name: "Bob", value: null as string | null },
      { name: "Alice", value: "hello" },
      { name: "Charlie", value: null as string | null },
    ];
    const asc = sortBy(withNulls, "value", "asc");
    expect(asc.map((d) => d.name)).toEqual(["Alice", "Bob", "Charlie"]);

    const desc = sortBy(withNulls, "value", "desc");
    expect(desc.map((d) => d.name)).toEqual(["Alice", "Bob", "Charlie"]);
  });

  it("원본 배열을 변경하지 않는다", () => {
    const original = [...data];
    sortBy(data, "name", "desc");
    expect(data).toEqual(original);
  });
});
