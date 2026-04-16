export type ErrorCodeValue = {
  status: number;
  message: string;
};

export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
  BOOK_NOT_FOUND: { status: 404, message: "책을 찾을 수 없습니다" },
  BOOK_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 책 slug입니다" },
  SERIES_NOT_FOUND: { status: 404, message: "시리즈를 찾을 수 없습니다" },
  SERIES_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 시리즈 slug입니다" },
  ARTICLE_NOT_FOUND: { status: 404, message: "게시글을 찾을 수 없습니다" },
  ARTICLE_PASSWORD_REQUIRED: { status: 403, message: "비밀번호가 필요한 게시글입니다" },
  ARTICLE_PASSWORD_INCORRECT: { status: 403, message: "비밀번호가 올바르지 않습니다" },
  ARTICLE_SLUG_DUPLICATE: { status: 400, message: "이미 사용 중인 slug입니다" },
  INVALID_IMAGE_TYPE: { status: 400, message: "지원하지 않는 이미지 형식입니다" },
  IMAGE_TOO_LARGE: { status: 400, message: "이미지 크기가 10MB를 초과합니다" },
} as const satisfies Record<string, ErrorCodeValue>;

export type ErrorCodeKey = keyof typeof ErrorCode;

export class BusinessError extends Error {
  readonly status: number;
  readonly code?: ErrorCodeKey;

  constructor(status: number, message: string, code?: ErrorCodeKey) {
    super(message);
    this.name = "BusinessError";
    this.status = status;
    this.code = code;
  }

  static from(code: ErrorCodeKey): BusinessError {
    const entry = ErrorCode[code];
    return new BusinessError(entry.status, entry.message, code);
  }
}
