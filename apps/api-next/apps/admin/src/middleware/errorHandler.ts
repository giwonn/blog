import type { ErrorHandler } from "hono";
import { BusinessError, ErrorCode } from "@api-next/core";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof BusinessError) {
    return c.json({ message: err.message }, err.status as 400);
  }
  console.error("[unhandled]", err);
  const internal = ErrorCode.INTERNAL;
  return c.json({ message: internal.message }, internal.status as 500);
};
