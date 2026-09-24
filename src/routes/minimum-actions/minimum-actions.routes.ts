// src/routes/minimum-actions/minimum-actions.routes.ts
// MinimumAction + DailyMinimumAction API 路由
// 路径分两组：
//   /api/minimum-actions/:actionId  → POST /complete, POST /uncomplete
//   /api/daily-minimum-actions       → GET /:date, POST /, DELETE /:date

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { minimumActionService } from '../../services/minimum-action.service';
import type { ApiError } from '../../types/api';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  DateStringSchema,
  MinimumActionSchema,
  SetGlobalMinimumActionRequestSchema,
} from '../daily-sops/schemas';

type AppEnv = { Variables: { userId: string } };

export const minimumActionsRouter = new OpenAPIHono<AppEnv>();
export const dailyMinimumActionsRouter = new OpenAPIHono<AppEnv>();

const errorResponses = (desc: string) => ({
  '400': {
    description: `${desc} - 参数校验失败`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '401': {
    description: `${desc} - 未登录`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '404': {
    description: `${desc} - 资源不存在`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '422': {
    description: `${desc} - 业务规则违反`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '500': {
    description: `${desc} - 服务端错误`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(c: { json: (body: unknown, status: number) => any }, e: unknown): any {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const error = e as ApiError;
    return c.json({ success: false, error }, httpStatusFor(error.code));
  }
  console.error('[MinimumAction Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. POST /api/minimum-actions/:actionId/complete — 完成最小动作
// ============================================================
minimumActionsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:actionId/complete',
    tags: ['MinimumActions'],
    summary: '完成 MinimumAction',
    description: 'CLAUDE.md: 最小动作完成后不自动生成第二个。同时把关联 Task 置为 completed。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ actionId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '完成成功',
        content: { 'application/json': { schema: ApiSuccessSchema(MinimumActionSchema) } },
      },
      ...errorResponses('完成 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { actionId } = c.req.valid('param');
      const ma = await minimumActionService.complete(actionId, userId);
      return c.json(ok(ma), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/minimum-actions/:actionId/uncomplete — 取消完成
// ============================================================
minimumActionsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:actionId/uncomplete',
    tags: ['MinimumActions'],
    summary: '取消完成 MinimumAction',
    description: '同时把关联 Task 置回 pending。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ actionId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '取消成功',
        content: { 'application/json': { schema: ApiSuccessSchema(MinimumActionSchema) } },
      },
      ...errorResponses('取消完成 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { actionId } = c.req.valid('param');
      const ma = await minimumActionService.uncomplete(actionId, userId);
      return c.json(ok(ma), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. GET /api/daily-minimum-actions/:date — 获取今日全局最小动作
// ============================================================
dailyMinimumActionsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:date',
    tags: ['DailyMinimumActions'],
    summary: '获取某日全局 MinimumAction',
    description: 'CLAUDE.md: 每个用户每天只有 1 个全局最小动作。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ date: DateStringSchema }),
    },
    responses: {
      200: {
        description: '全局最小动作（不存在则 data=null）',
        content: { 'application/json': { schema: ApiSuccessSchema(MinimumActionSchema.nullable()) } },
      },
      ...errorResponses('获取全局 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { date } = c.req.valid('param');
      const ma = await minimumActionService.getGlobal(date, userId);
      return c.json(ok(ma), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. POST /api/daily-minimum-actions — 设置今日全局最小动作
// ============================================================
dailyMinimumActionsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['DailyMinimumActions'],
    summary: '设置某日全局 MinimumAction',
    description: 'CLAUDE.md: 每个用户每天只有 1 个全局最小动作。已有则返回 422。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: SetGlobalMinimumActionRequestSchema } } },
    },
    responses: {
      201: {
        description: '设置成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({
          id: z.string().uuid(),
          userId: z.string().uuid(),
          date: DateStringSchema,
          minimumActionId: z.string().uuid(),
          createdAt: z.string(),
          updatedAt: z.string(),
        })) } },
      },
      ...errorResponses('设置全局 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const dma = await minimumActionService.setGlobal(body, userId);
      return c.json(ok(dma), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. DELETE /api/daily-minimum-actions/:date — 清除今日全局最小动作
// ============================================================
dailyMinimumActionsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/:date',
    tags: ['DailyMinimumActions'],
    summary: '清除某日全局 MinimumAction',
    middleware: [authMiddleware],
    request: {
      params: z.object({ date: DateStringSchema }),
    },
    responses: {
      200: {
        description: '清除成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.null()) } },
      },
      ...errorResponses('清除全局 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { date } = c.req.valid('param');
      await minimumActionService.clearGlobal(date, userId);
      return c.json(ok(null), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
