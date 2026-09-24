// src/routes/daily-sops/daily-sops.routes.ts
// DailySop API 路由 — 对齐 CLAUDE.md 第 4 节 + CONTRACT.md #15-#17
// 路径分三组：
//   /api/today                                 → GET
//   /api/goals/:goalId/daily-sops              → POST（创建某日 sop）
//   /api/goals/:goalId/daily-sops/:date        → GET（获取某日 sop）
//   /api/daily-sops/:sopId/complete             → POST
//   /api/daily-sops/:sopId/uncomplete           → POST
//   /api/daily-sops/:sopId/minimum-action      → GET, POST, DELETE（挂 MinimumAction）

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { dailySopService } from '../../services/daily-sop.service';
import { minimumActionService } from '../../services/minimum-action.service';
import type { ApiError } from '../../types/api';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  CreateDailySopRequestSchema,
  CreateMinimumActionRequestSchema,
  DailySopSchema,
  DateStringSchema,
  MinimumActionSchema,
  TodayResponseSchema,
} from './schemas';

type AppEnv = { Variables: { userId: string } };

// 路由器 1：挂在 / （/api/today）
export const todayRouter = new OpenAPIHono<AppEnv>();
// 路由器 2：挂在 /api/goals/:goalId/daily-sops
export const goalDailySopsRouter = new OpenAPIHono<AppEnv>();
// 路由器 3：挂在 /api/daily-sops
export const dailySopsRouter = new OpenAPIHono<AppEnv>();

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
  console.error('[DailySop Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. GET /api/today — 聚合今日数据
// ============================================================
todayRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Today'],
    summary: '聚合今日数据（所有 active goal 的 sop + tasks + 全局最小动作）',
    middleware: [authMiddleware],
    request: {
      query: z.object({
        date: DateStringSchema.optional(),
      }),
    },
    responses: {
      200: {
        description: '今日聚合数据',
        content: { 'application/json': { schema: ApiSuccessSchema(TodayResponseSchema) } },
      },
      ...errorResponses('聚合今日数据'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { date } = c.req.valid('query');
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      const data = await dailySopService.getToday(userId, targetDate);
      return c.json(ok(data), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. GET /api/goals/:goalId/daily-sops/:date — 获取某日 sop
// ============================================================
goalDailySopsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:date',
    tags: ['DailySops'],
    summary: '获取某 Goal 某日的 DailySop',
    middleware: [authMiddleware],
    request: {
      params: z.object({
        goalId: z.string().uuid(),
        date: DateStringSchema,
      }),
    },
    responses: {
      200: {
        description: 'DailySop 详情',
        content: { 'application/json': { schema: ApiSuccessSchema(DailySopSchema) } },
      },
      ...errorResponses('获取 DailySop'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId, date } = c.req.valid('param');
      const sop = await dailySopService.getByDate(goalId, date, userId);
      return c.json(ok(sop), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. POST /api/goals/:goalId/daily-sops — 创建某日 sop
// ============================================================
goalDailySopsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['DailySops'],
    summary: '创建某 Goal 某日的 DailySop',
    description: '同 (userId, goalId, date) 只能有一个 sop。已有则返回 422。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ goalId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CreateDailySopRequestSchema } } },
    },
    responses: {
      201: {
        description: '创建成功',
        content: { 'application/json': { schema: ApiSuccessSchema(DailySopSchema) } },
      },
      ...errorResponses('创建 DailySop'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const body = c.req.valid('json');
      const sop = await dailySopService.create(
        { goalId, date: body.date, stageId: body.stageId },
        userId,
      );
      return c.json(ok(sop), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. POST /api/daily-sops/:sopId/complete — 完成 sop
// ============================================================
dailySopsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:sopId/complete',
    tags: ['DailySops'],
    summary: '完成 DailySop',
    description: 'CLAUDE.md: DailySop.completed 不等于 MinimumAction.completed（独立状态机）',
    middleware: [authMiddleware],
    request: {
      params: z.object({ sopId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '完成成功',
        content: { 'application/json': { schema: ApiSuccessSchema(DailySopSchema) } },
      },
      ...errorResponses('完成 DailySop'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { sopId } = c.req.valid('param');
      const sop = await dailySopService.complete(sopId, userId);
      return c.json(ok(sop), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. POST /api/daily-sops/:sopId/uncomplete — 取消完成
// ============================================================
dailySopsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:sopId/uncomplete',
    tags: ['DailySops'],
    summary: '取消完成 DailySop',
    middleware: [authMiddleware],
    request: {
      params: z.object({ sopId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '取消成功',
        content: { 'application/json': { schema: ApiSuccessSchema(DailySopSchema) } },
      },
      ...errorResponses('取消完成 DailySop'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { sopId } = c.req.valid('param');
      const sop = await dailySopService.uncomplete(sopId, userId);
      return c.json(ok(sop), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 6. GET /api/daily-sops/:sopId/minimum-action — 获取 sop 的最小动作
// ============================================================
dailySopsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/:sopId/minimum-action',
    tags: ['MinimumActions'],
    summary: '获取 DailySop 的 MinimumAction',
    middleware: [authMiddleware],
    request: {
      params: z.object({ sopId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '最小动作（不存在则 data=null）',
        content: { 'application/json': { schema: ApiSuccessSchema(MinimumActionSchema.nullable()) } },
      },
      ...errorResponses('获取 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { sopId } = c.req.valid('param');
      const ma = await minimumActionService.getBySop(sopId, userId);
      return c.json(ok(ma), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 7. POST /api/daily-sops/:sopId/minimum-action — 保存最小动作
// ============================================================
dailySopsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:sopId/minimum-action',
    tags: ['MinimumActions'],
    summary: '保存 DailySop 的 MinimumAction（用户确认 AI 建议后调用）',
    description: 'CLAUDE.md: MinimumAction 必须来自当天已有 Task，不得创建新 Task。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ sopId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CreateMinimumActionRequestSchema } } },
    },
    responses: {
      201: {
        description: '保存成功',
        content: { 'application/json': { schema: ApiSuccessSchema(MinimumActionSchema) } },
      },
      ...errorResponses('保存 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { sopId } = c.req.valid('param');
      const body = c.req.valid('json');
      const ma = await minimumActionService.create(
        {
          dailySopId: sopId,
          taskId: body.taskId,
          title: body.title,
          description: body.description,
          estimatedMinutes: body.estimatedMinutes,
        },
        userId,
      );
      return c.json(ok(ma), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 8. DELETE /api/daily-sops/:sopId/minimum-action — 删除最小动作
// ============================================================
dailySopsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/:sopId/minimum-action',
    tags: ['MinimumActions'],
    summary: '删除 DailySop 的 MinimumAction（用户改主意）',
    description: '仅在未完成时允许删除。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ sopId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '删除成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.null()) } },
      },
      ...errorResponses('删除 MinimumAction'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { sopId } = c.req.valid('param');
      await minimumActionService.deleteBySop(sopId, userId);
      return c.json(ok(null), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
