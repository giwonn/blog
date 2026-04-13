import { createApp } from "./app";
import { env } from "@api-next/core";

const app = createApp();

export default {
  fetch: app.fetch,
  port: env.ADMIN_PORT,
};
