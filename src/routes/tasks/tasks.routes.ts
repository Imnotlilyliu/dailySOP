// src/routes/tasks/tasks.routes.ts
// Task API 路由 — 对齐 CONTRACT.md #13/#14 + 扩展 CRUD
// 路径分三组：
//   /api/stages/:stageId/tasks             → GET, POST
//   /api/learning-paths/:pathId/tasks      → GET
//   /api/tasks/:taskId                      → PATCH, DELETE, POST /complete, POST /uncomplete

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { taskService } from '../../services/task.service';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  CreateTaskRequestSchema,
  UpdateTaskRequestSchema,
  TaskSchema,
} from './schemas';

type AppEnv = { Variables: { userId: string } };

// 路由器 1：挂在 /api/stages/:stageId/tasks
export const stageTasksRouter = new OpenAPIHono<AppEnv>();
// 路由器 2：挂在 /api/learning-paths/:pathId/tasks
export const learningPathTasksRouter = new OpenAPIHono<AppEnv>();
// 路由器 3：挂在 /api/tasks
export const tasksRouter = new OpenAPIHono<AppEnv>();

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
  console.error('[Task Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. GET /api/stages/:stageId/tasks — 列出某 Stage 的 Tasks
// ============================================================
stageTasksRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Tasks'],
    summary: '列出某 Stage 的 Tasks',
    description: '按 orderIndex 升序返回某 Stage 的所有 Tasks（含未关联 LearningPath 的）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Task 列表',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ tasks: z.array(TaskSchema) })) } },
      },
      ...errorResponses('列出 Tasks'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const tasks = await taskService.listByStage(stageId, userId);
      return c.json(ok({ tasks }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/stages/:stageId/tasks — 创建 Task
// ============================================================
stageTasksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Tasks'],
    summary: '创建 Task',
    description: '在某 Stage 下创建 Task。可关联 learningPathId（需属于同一 Stage）。新建默认 pending。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ stageId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: CreateTaskRequestSchema } } },
    },
    responses: {
      201: {
        description: '创建成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ task: TaskSchema })) } },
      },
      ...errorResponses('创建 Task'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { stageId } = c.req.valid('param');
      const body = c.req.valid('json');
      const task = await taskService.create({ stageId, ...body }, userId);
      return c.json(ok({ task }), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. GET /api/learning-paths/:pathId/tasks — 列出某 LearningPath 的 Tasks
// ============================================================
learningPathTasksRouter.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Tasks'],
    summary: '列出某 LearningPath 的 Tasks',
    description: '按 orderIndex 升序返回某 LearningPath 关联的所有 Tasks。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ pathId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: 'Task 列表',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ tasks: z.array(TaskSchema) })) } },
      },
      ...errorResponses('列出 LearningPath 的 Tasks'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { pathId } = c.req.valid('param');
      const tasks = await taskService.listByLearningPath(pathId, userId);
      return c.json(ok({ tasks }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. PATCH /api/tasks/:taskId — 更新 Task
// ============================================================
tasksRouter.openapi(
  createRoute({
    method: 'patch',
    path: '/:taskId',
    tags: ['Tasks'],
    summary: '更新 Task',
    description: '更新 Task 字段（不能改 stageId / status，状态由状态机控制）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ taskId: z.string().uuid() }),
      body: { content: { 'application/json': { schema: UpdateTaskRequestSchema } } },
    },
    responses: {
      200: {
        description: '更新成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ task: TaskSchema })) } },
      },
      ...errorResponses('更新 Task'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { taskId } = c.req.valid('param');
      const body = c.req.valid('json');
      const task = await taskService.update(taskId, userId, body);
      return c.json(ok({ task }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. DELETE /api/tasks/:taskId — 删除 Task
// ============================================================
tasksRouter.openapi(
  createRoute({
    method: 'delete',
    path: '/:taskId',
    tags: ['Tasks'],
    summary: '删除 Task',
    description: '删除 Task。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ taskId: z.string().uuid() }),
    },
    responses: {
      204: { description: '删除成功（无内容）' },
      ...errorResponses('删除 Task'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { taskId } = c.req.valid('param');
      await taskService.remove(taskId, userId);
      return c.body(null, 204);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 6. POST /api/tasks/:taskId/complete — 完成 Task（CONTRACT.md #13）
// ============================================================
tasksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:taskId/complete',
    tags: ['Tasks'],
    summary: '完成 Task',
    description: '状态机：pending → completed，写 completedAt。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ taskId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '完成成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ task: TaskSchema })) } },
      },
      ...errorResponses('完成 Task'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { taskId } = c.req.valid('param');
      const task = await taskService.complete(taskId, userId);
      return c.json(ok({ task }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 7. POST /api/tasks/:taskId/uncomplete — 取消完成（CONTRACT.md #14）
// ============================================================
tasksRouter.openapi(
  createRoute({
    method: 'post',
    path: '/:taskId/uncomplete',
    tags: ['Tasks'],
    summary: '取消完成 Task',
    description: '状态机：completed → pending，清空 completedAt。注意 CLAUDE.md 第 4 节：最小动作完成后不自动生成第二个（不在此接口处理）。',
    middleware: [authMiddleware],
    request: {
      params: z.object({ taskId: z.string().uuid() }),
    },
    responses: {
      200: {
        description: '取消成功',
        content: { 'application/json': { schema: ApiSuccessSchema(z.object({ task: TaskSchema })) } },
      },
      ...errorResponses('取消完成 Task'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const { taskId } = c.req.valid('param');
      const task = await taskService.uncomplete(taskId, userId);
      return c.json(ok({ task }), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
