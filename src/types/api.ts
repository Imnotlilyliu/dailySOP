// src/types/api.ts
// 统一响应、错误类型与业务约束常量

// ============================================================
// 业务约束常量（对应 CLAUDE.md 第 4 节）
// ============================================================

/** CLAUDE.md: 一个用户最多 3 个 active goals */
export const MAX_ACTIVE_GOALS = 3;

/** CLAUDE.md: 一个 Goal 同时只能有一个 in_progress Stage */
export const MAX_IN_PROGRESS_STAGES_PER_GOAL = 1;

/** CLAUDE.md: 一个 Goal 同一天只能有一个 Daily SOP（数据库层有 @@unique 保证） */
export const MAX_DAILY_SOP_PER_GOAL_PER_DAY = 1;

/** CLAUDE.md: 一个 SOP 只能有一个 Minimum Action（数据库层 @@unique 保证） */
export const MAX_MINIMUM_ACTION_PER_SOP = 1;

/** CLAUDE.md: 每个用户每天只有 1 个全局最小动作（数据库层 @@unique 保证） */
export const MAX_DAILY_MINIMUM_ACTION_PER_USER_PER_DAY = 1;

// ============================================================
// 统一成功响应
// ============================================================

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    /** 分页信息（可选，列表接口使用） */
    page?: number;
    pageSize?: number;
    total?: number;
    /** 标识当前 AI 是否触发了 ai_generation_logs */
    aiLogId?: string;
    /** 标识调用是否经过重试 */
    retried?: boolean;
  };
}

// ============================================================
// 统一错误响应
// ============================================================

export type ApiError =
  | ValidationError
  | UnauthorizedError
  | ForbiddenError
  | NotFoundError
  | ConflictError
  | BusinessRuleError
  | AiGenerationError
  | InternalServerError;

export interface ApiErrorResponse {
  success: false;
  error: ApiError;
}

export interface ValidationError {
  code: 'VALIDATION_ERROR';
  message: string;
  /** 字段级错误（可选） */
  fields?: Array<{ field: string; message: string }>;
}

export interface UnauthorizedError {
  code: 'UNAUTHORIZED';
  message: string;
}

export interface ForbiddenError {
  code: 'FORBIDDEN';
  message: string;
}

export interface NotFoundError {
  code: 'NOT_FOUND';
  message: string;
  /** 缺失资源类型与 ID */
  resource?: { type: string; id: string };
}

export interface ConflictError {
  code: 'CONFLICT';
  message: string;
  /** 触发冲突的字段 */
  field?: string;
}

/** CLAUDE.md 第 4 节定义的业务规则违反 */
export interface BusinessRuleError {
  code: 'BUSINESS_RULE_VIOLATION';
  /** 规则标识，例如 MAX_ACTIVE_GOALS、GOAL_PAUSED、NOT_CURRENT_STAGE */
  rule: string;
  message: string;
  /** 当前状态快照（便于客户端调试） */
  context?: Record<string, unknown>;
}

/** AI 生成失败（CLAUDE.md 第 11 节：Retry 1 次仍失败 → ai_generation_logs → 返回错误） */
export interface AiGenerationError {
  code: 'AI_GENERATION_FAILED';
  message: string;
  /** 对应 ai_generation_logs.id，可用于排查 */
  aiLogId: string;
  promptId: string;
  promptVersion: string;
  /** 失败原因：schema_validation | parse_error | model_error | retry_exhausted */
  reason: string;
}

export interface InternalServerError {
  code: 'INTERNAL_ERROR';
  message: string;
  /** 用于日志追踪（仅在开发环境返回） */
  traceId?: string;
}

// ============================================================
// HTTP 状态码映射
// ============================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR: 500,
} as const;

// ============================================================
// 工具类型：从 ApiSuccessResponse 提取 data
// ============================================================

export type UnwrapData<T> = T extends ApiSuccessResponse<infer U> ? U : never;
