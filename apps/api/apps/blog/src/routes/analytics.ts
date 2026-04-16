import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PageViewRequestSchema, analyticsRecordPageView } from "@api/core";

type ZodIssueLike = { path: PropertyKey[]; message: string };
type ZodErrorLike = { issues: ZodIssueLike[] };

function validationErrorMessage(error: ZodErrorLike): string {
  const first = error.issues[0];
  if (!first) return "Invalid request body";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export const analyticsTrackRoute = new Hono();

analyticsTrackRoute.post(
  "/page-view",
  zValidator("json", PageViewRequestSchema, (result, c) => {
    if (!result.success) {
      return c.json({ message: validationErrorMessage(result.error) }, 400);
    }
  }),
  async (c) => {
    const body = c.req.valid("json");
    // Fire-and-forget: do not await the recording. The user gets 204 immediately.
    analyticsRecordPageView(body).catch((err) =>
      console.warn("[analytics] page view recording failed", err),
    );
    return c.body(null, 204);
  },
);
