// Intentionally duplicated with apps/blog/src/middleware/errorHandler.ts.
// Extraction to @api/core/middleware is deferred until real divergence
// appears across Plans B–J (see Plan A spec Out of Scope section).

import type { ErrorHandler } from "hono";
import { BusinessError, ErrorCode } from "@api/core";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof BusinessError) {
    return c.json({ message: err.message }, err.status as 400);
  }
  console.error("[unhandled]", err);
  const internal = ErrorCode.INTERNAL;
  return c.json({ message: internal.message }, internal.status as 500);
};
