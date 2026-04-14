import { Hono } from "hono";
import { imageUploadToTemp } from "@api-next/core";

export const imagesAdminRoute = new Hono();

imagesAdminRoute.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body["file"];
  if (!(file instanceof File)) {
    return c.json({ message: "file field required" }, 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const result = await imageUploadToTemp(bytes, file.type);
  return c.json({ data: result });
});
