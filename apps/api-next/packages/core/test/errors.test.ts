import { describe, it, expect } from "bun:test";
import { BusinessError, ErrorCode } from "../src/errors";

describe("BusinessError", () => {
  it("carries status, message, and optional code", () => {
    const err = new BusinessError(418, "teapot", "UNAUTHORIZED");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(418);
    expect(err.message).toBe("teapot");
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("constructs from an ErrorCode", () => {
    const err = BusinessError.from("UNAUTHORIZED");
    expect(err.status).toBe(401);
    expect(err.message).toBe("Unauthorized");
    expect(err.code).toBe("UNAUTHORIZED");
  });

  it("exposes canonical error entries", () => {
    expect(ErrorCode.INTERNAL).toEqual({ status: 500, message: "Internal server error" });
  });
});
