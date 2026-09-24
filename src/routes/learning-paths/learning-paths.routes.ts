// src/routes/learning-paths/learning-paths.routes.ts
// LearningPath API 路由 — 扩展 CONTRACT.md（CLAUDE.md 第 8 节 LearningPath 模型）
// 路径分两组：
//   /api/stages/:stageId/learning-paths  → GET, POST
//   /api/learning-paths/:pathId          → PATCH, DELETE

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { learningPathService } from '../../services/learningPath.service';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  CreateLearningPathRequestSchema,
  UpdateLearningPathRequestSchema,
  LearningPathSchema,
} from './schemas';

type AppEnv = { Variables: { userId: string } };

// 路由器 1：挂在 /api/stages/:stageId/learning-paths
export const stageLearningPathsRouter = new OpenAPIHono<AppEnv>();
// 路由器 2：挂在 /api/learning-paths
export const learningPathsRouter = new OpenAPIHono<AppEnv>();

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
  console.error('[LearningPath Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. GET /api/stages/:stageId/learning-paths — 列出某 Stage 的 LearningPaths
// ============================================================
stageLearningPathsRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['LearningPaths'],
    summary: '列出某 Stage 的 LearningPaths',
    description: '按 orderIndex 升序返回某 Stage 的所有 LearningPaths。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'LearningPath 列表',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ learningPaths: z.array(LearningPathSchema) })) } },
      },
      ...errorResponses('列出 LearningPaths'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const learningPaths = await learningPathService.list(stageId, userId);
      return c.json(ok({ learningPaths }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/stages/:stageId/learning-paths — 创建 LearningPath
// ============================================================
stageLearningPathsRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['LearningPaths'],
    summary: '创建 LearningPath',
    description: '在某 Stage 下创建 LearningPath。手动创建 source_type 固定为 user；AI 生成由 /api/ai/learning-path/generate 处理。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CreateLearningPathRequestSchema } } },
    },
    responses: {
      201: {
        description: '创建成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ learningPath: LearningPathSchema })) } },
      },
      ...errorResponses('创建 LearningPath'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const body = c.req.valid('json');
      const learningPath = await learningPathService.create({ stageId, ...body }, userId);
      return c.json(ok({ learningPath }), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. PATCH /api/learning-paths/:pathId — 更新 LearningPath
// ============================================================
learningPathsRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/:pathId',
    tags: ['LearningPaths'],
    summary: '更新 LearningPath',
    description: '更新 LearningPath 字段（不能改 stageId / sourceType）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ pathId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UpdateLearningPathRequestSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ learningPath: LearningPathSchema })) } },
      },
      ...errorResponses('更新 LearningPath'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { pathId } = c.req.valid('param');
      const body = c.req.valid('json');
      const learningPath = await learningPathService.update(pathId, userId, body);
      return c.json(ok({ learningPath }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. DELETE /api/learning-paths/:pathId — 删除 LearningPath
// ============================================================
learningPathsRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/:pathId',
    tags: ['LearningPaths'],
    summary: '删除 LearningPath',
    description: '删除 LearningPath。关联 Task 的 learningPathId 会被自动设为 null（onDelete: SetNull）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ pathId: z.string().uuid() }),
    },
    responses: {
      204: { description: '删除成功（无内容）' },
      ...errorResponses('删除 LearningPath'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { pathId } = c.req.valid('param');
      await learningPathService.remove(pathId, userId);
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
