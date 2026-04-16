export { type RecentComment } from "./types";
export {
  getRecentComments as commentsGetRecent,
  parseComments as commentsParse,
  __clearCommentsCache,
} from "./service";
