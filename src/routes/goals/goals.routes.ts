// src/routes/goals/goals.routes.ts
// Goal API 路由 — 对齐 CLAUDE.md 第 8 节，7 个端点
// 使用 @hono/zod-openapi 自动生成 OpenAPI spec + Swagger UI

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import type { ApiError } from '../../types/api';
import { goalService } from '../../services/goal.service';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  CreateGoalRequestSchema,
  GoalListQuerySchema,
  GoalSchema,
  UpdateGoalRequestSchema,
} from './schemas';

// ============================================================
// App 类型（Variables 含 userId）
// ============================================================

type AppEnv = { Variables: { userId: string } };
export const goalsRouter = new OpenAPIHono<AppEnv>();

// ============================================================
// Helpers
// ============================================================

const GoalIdParam = z.object({ goalId: z.string().uuid() });

/** 统一错误响应定义（每个 route 共用） */
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

/**
 * 统一错误处理：service 抛出的 ApiError → 对应 HTTP 状态码 + ApiErrorResponse
 * 返回 any 以兼容 zod-openapi 的严格响应类型推断。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleError(c: { json: (body: unknown, status: number) => any }, e: unknown): any {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const error = e as ApiError;
    return c.json({ success: false, error }, httpStatusFor(error.code));
  }
  console.error('[Goal Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. GET / — 列出目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Goals'],
    summary: '列出当前用户的目标',
    description:
      '列出当前用户的目标。默认只返回 active 状态（不展示已软删除）。可通过 ?status= 查询其他状态。',
    middleware: [authMiddleware],
    request: { query: GoalListQuerySchema },
    responses: {
      200: {
        description: '目标列表',
        content: {
          'application/json': { schema: ApiSuccessSchema(z.array(GoalSchema)) },
        },
      },
      ...errorResponses('列出目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { status } = c.req.valid('query');
      const goals = await goalService.list({ userId, status });
      return c.json(ok(goals), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST / — 创建目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Goals'],
    summary: '创建目标',
    description:
      '创建新的 Goal。CLAUDE.md 业务规则：每个用户最多 3 个 active goals。超出返回 BUSINESS_RULE_VIOLATION。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: CreateGoalRequestSchema } } },
    },
    responses: {
      201: {
        description: '创建成功',
        content: {
          'application/json': {
            schema: ApiSuccessSchema(z.object({ goal: GoalSchema })),
          },
        },
      },
      ...errorResponses('创建目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const goal = await goalService.create({ userId, ...body });
      return c.json(ok({ goal }), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. GET /:goalId — 目标详情
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/{goalId}',
    tags: ['Goals'],
    summary: '获取目标详情',
    description: '获取指定 Goal 的详情，含 currentStage 与 stagesCount。',
    middleware: [authMiddleware],
    request: { params: GoalIdParam },
    responses: {
      200: {
        description: '目标详情',
        content: {
          'application/json': {
            schema: ApiSuccessSchema(
              z.object({
                goal: GoalSchema,
                currentStage: z.any().nullable(),
                stagesCount: z.number(),
              }),
            ),
          },
        },
      },
      ...errorResponses('获取目标详情'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const result = await goalService.getDetail(goalId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. PATCH /:goalId — 更新目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/{goalId}',
    tags: ['Goals'],
    summary: '更新目标字段',
    description:
      '更新 Goal 的字段（title/description/expectedOutcome/startDate/targetDate/currentStageId）。status 不在此修改，通过 pause/resume 接口控制。',
    middleware: [authMiddleware],
    request: {
      params: GoalIdParam,
      body: { content: { 'application/json': { schema: UpdateGoalRequestSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: {
          'application/json': {
            schema: ApiSuccessSchema(z.object({ goal: GoalSchema })),
          },
        },
      },
      ...errorResponses('更新目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const body = c.req.valid('json');
      const goal = await goalService.update(goalId, userId, body);
      return c.json(ok({ goal }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. DELETE /:goalId — 软删除目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/{goalId}',
    tags: ['Goals'],
    summary: '软删除目标',
    description:
      '软删除 Goal：设置 status=deleted + deletedAt=now。关联数据通过 onDelete: Cascade 级联清理。',
    middleware: [authMiddleware],
    request: { params: GoalIdParam },
    responses: {
      204: { description: '软删除成功（无响应体）' },
      ...errorResponses('软删除目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      await goalService.softDelete(goalId, userId);
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 6. POST /:goalId/pause — 暂停目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{goalId}/pause',
    tags: ['Goals'],
    summary: '暂停目标',
    description: '将 Goal 状态从 active 改为 paused。CLAUDE.md 业务规则：暂停后不生成新的 SOP。',
    middleware: [authMiddleware],
    request: { params: GoalIdParam },
    responses: {
      200: {
        description: '暂停成功',
        content: {
          'application/json': {
            schema: ApiSuccessSchema(z.object({ goal: GoalSchema })),
          },
        },
      },
      ...errorResponses('暂停目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const goal = await goalService.pause(goalId, userId);
      return c.json(ok({ goal }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 7. POST /:goalId/resume — 恢复目标
// ============================================================
goalsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/{goalId}/resume',
    tags: ['Goals'],
    summary: '恢复目标',
    description:
      '将 Goal 状态从 paused 改为 active。CLAUDE.md 业务规则：恢复前检查 active goals < 3，超出返回 BUSINESS_RULE_VIOLATION。',
    middleware: [authMiddleware],
    request: { params: GoalIdParam },
    responses: {
      200: {
        description: '恢复成功',
        content: {
          'application/json': {
            schema: ApiSuccessSchema(z.object({ goal: GoalSchema })),
          },
        },
      },
      ...errorResponses('恢复目标'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const goal = await goalService.resume(goalId, userId);
      return c.json(ok({ goal }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
