import type { RecentComment } from "@/types";

interface RecentCommentsProps {
  comments: RecentComment[];
}

export function RecentComments({ comments }: RecentCommentsProps) {
  if (comments.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
        최신 댓글
      </h3>
      <ul className="space-y-2">
        {comments.map((comment, i) => (
          <li key={i}>
            <a
              href={comment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
            >
              <span className="font-medium">{comment.author}</span>
              <span className="ml-1 line-clamp-1">
                {comment.body}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
