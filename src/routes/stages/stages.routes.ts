// src/routes/stages/stages.routes.ts
// Stage API 路由 — 对齐 CLAUDE.md 第 8 节，5 个端点
// 路径分两组：
//   /api/goals/:goalId/stages  → GET, POST
//   /api/stages/:stageId        → PATCH, DELETE, POST /complete

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { stageService } from '../../services/stage.service';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  CreateStageRequestSchema,
  UpdateStageRequestSchema,
  StageSchema,
  CompleteStageResponseSchema,
} from './schemas';

type AppEnv = { Variables: { userId: string } };

// 路由器 1：挂在 /api/goals/:goalId/stages
export const goalStagesRouter = new OpenAPIHono<AppEnv>();
// 路由器 2：挂在 /api/stages
export const stagesRouter = new OpenAPIHono<AppEnv>();

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

function handleError(c: { json: (body: unknown, status: number) => any }, e: unknown): any {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = e as any;
    return c.json({ success: false, error }, httpStatusFor(error.code));
  }
  console.error('[Stage Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. GET /api/goals/:goalId/stages — 列出某 Goal 的 Stages
// ============================================================
goalStagesRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Stages'],
    summary: '列出某 Goal 的所有 Stages',
    description: '按 orderIndex 升序返回某 Goal 的所有 Stages。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ goalId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Stage 列表',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ stages: z.array(StageSchema) })) } },
      },
      ...errorResponses('列出 Stages'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const stages = await stageService.list(goalId, userId);
      return c.json(ok({ stages }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/goals/:goalId/stages — 创建 Stage
// ============================================================
goalStagesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Stages'],
    summary: '创建 Stage',
    description: '在某 Goal 下创建 Stage。第一个 Stage 自动设为 in_progress 并写入 goal.current_stage_id。其余默认 not_started。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ goalId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CreateStageRequestSchema } } },
    },
    responses: {
      201: {
        description: '创建成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ stage: StageSchema })) } },
      },
      ...errorResponses('创建 Stage'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { goalId } = c.req.valid('param');
      const body = c.req.valid('json');
      const stage = await stageService.create({ goalId, ...body }, userId);
      return c.json(ok({ stage }), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. PATCH /api/stages/:stageId — 更新 Stage
// ============================================================
stagesRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/:stageId',
    tags: ['Stages'],
    summary: '更新 Stage',
    description: '更新 Stage 字段（不能改 status / goalId，状态由状态机控制）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UpdateStageRequestSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ stage: StageSchema })) } },
      },
      ...errorResponses('更新 Stage'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const body = c.req.valid('json');
      const stage = await stageService.update(stageId, userId, body);
      return c.json(ok({ stage }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. DELETE /api/stages/:stageId — 删除 Stage
// ============================================================
stagesRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/:stageId',
    tags: ['Stages'],
    summary: '删除 Stage',
    description: '删除 Stage。in_progress 状态的 Stage 不可删除。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
    },
    responses: {
      204: { description: '删除成功（无内容）' },
      ...errorResponses('删除 Stage'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      await stageService.remove(stageId, userId);
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. POST /api/stages/:stageId/complete — 完成 Stage（状态机核心）
// ============================================================
stagesRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:stageId/complete',
    tags: ['Stages'],
    summary: '完成 Stage',
    description:
      '状态机：in_progress → completed。' +
      '完成后自动推进下一 not_started Stage 为 in_progress 并更新 goal.current_stage_id。' +
      '若此 Stage 为最后一个，则 Goal.status → completed。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '完成成功',
        content: { 'application/json': { schema: ApiSuccessSchema(CompleteStageResponseSchema) } },
      },
      ...errorResponses('完成 Stage'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const result = await stageService.complete(stageId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
