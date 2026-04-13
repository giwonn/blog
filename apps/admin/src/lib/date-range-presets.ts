export type PresetKey = "today" | "yesterday" | "week" | "month" | "custom";

export function getPresetRange(key: Exclude<PresetKey, "custom">): { from: Date; to: Date } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (key) {
    case "today":
      return { from: today, to: today };
    case "yesterday": {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return { from: yesterday, to: yesterday };
    }
    case "week": {
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return { from: weekAgo, to: today };
    }
    case "month": {
      const monthAgo = new Date(today);
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      return { from: monthAgo, to: today };
    }
  }
}
