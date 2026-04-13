export type ErrorCodeValue = {
  status: number;
  message: string;
};

export const ErrorCode = {
  UNAUTHORIZED: { status: 401, message: "Unauthorized" },
  INTERNAL: { status: 500, message: "Internal server error" },
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
