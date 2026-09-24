// src/lib/response.ts
// 统一成功/错误响应 helper，对齐 src/types/api.ts 定义的契约

import type {
  ApiErrorResponse,
  ApiError,
  ApiSuccessResponse,
} from '../types/api';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export type { ApiError } from '../types/api';

/** 构造成功响应体 */
export function ok<T>(data: T, meta?: ApiSuccessResponse<T>['meta']): ApiSuccessResponse<T> {
  return meta ? { success: true, data, meta } : { success: true, data };
}

/** 构造错误响应体 */
export function err(error: ApiError): ApiErrorResponse {
  return { success: false, error };
}

/** 错误码 → HTTP 状态码 映射 */
export function httpStatusFor(code: ApiError['code']): ContentfulStatusCode {
  switch (code) {
    case 'VALIDATION_ERROR':
      return 400;
    case 'UNAUTHORIZED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
      return 409;
    case 'BUSINESS_RULE_VIOLATION':
    case 'AI_GENERATION_FAILED':
      return 422;
    case 'INTERNAL_ERROR':
    default:
      return 500;
  }
}

/** 快捷构造器 */
export const Errors = {
  validation: (message: string, fields?: Array<{ field: string; message: string }>): ApiError => ({
    code: 'VALIDATION_ERROR',
    message,
    ...(fields ? { fields } : {}),
  }),
  unauthorized: (message = '未登录'): ApiError => ({ code: 'UNAUTHORIZED', message }),
  forbidden: (message = '无权限'): ApiError => ({ code: 'FORBIDDEN', message }),
  notFound: (resource: string, id: string, message?: string): ApiError => ({
    code: 'NOT_FOUND',
    message: message ?? `${resource} 不存在`,
    resource: { type: resource, id },
  }),
  conflict: (message: string, field?: string): ApiError => ({
    code: 'CONFLICT',
    message,
    ...(field ? { field } : {}),
  }),
  business: (rule: string, message: string, context?: Record<string, unknown>): ApiError => ({
    code: 'BUSINESS_RULE_VIOLATION',
    rule,
    message,
    ...(context ? { context } : {}),
  }),
  internal: (message: string, traceId?: string): ApiError => ({
    code: 'INTERNAL_ERROR',
    message,
    ...(traceId ? { traceId } : {}),
  }),
};
