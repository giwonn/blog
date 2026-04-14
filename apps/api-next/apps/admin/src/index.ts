import { Cron } from "croner";
import { createApp } from "./app";
import { env, analyticsVisitorStatsAggregate } from "@api-next/core";

const app = createApp();

// Nightly visitor stats aggregation. Mirrors Kotlin @Scheduled(cron = "0 5 3 * * *").
// Croner is 5-field standard cron, no seconds. Timezone matches legacy JVM.
new Cron("5 3 * * *", { timezone: "Asia/Seoul" }, async () => {
  try {
    await analyticsVisitorStatsAggregate();
    console.info("[scheduler] visitor stats aggregate ok");
  } catch (err) {
    console.error("[scheduler] visitor stats aggregate failed", err);
  }
});
console.info("[scheduler] visitor stats aggregate cron registered (5 3 * * * Asia/Seoul)");

export default {
  fetch: app.fetch,
  port: env.ADMIN_PORT,
};
