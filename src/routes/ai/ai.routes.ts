// src/routes/ai/ai.routes.ts
// AI API 路由 — 6 个端点（CLAUDE.md 第 9 节，CONTRACT.md 第 20-25 条）
//
// 关键约束（CLAUDE.md 第 8 节）：
//   - AI 不直接修改业务状态，仅返回建议
//   - 用户确认后由 CRUD API（/api/goals POST 等）落库

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import type { ApiError } from '../../types/api';
import { aiService } from '../../services/ai.service';
import {
  ApiErrorSchema,
  ApiSuccessSchema,
  AiGoalParseRequestSchema,
  AiGoalParseResponseSchema,
  AiStagesGenerateRequestSchema,
  AiStagesGenerateResponseSchema,
  AiLearningPathGenerateRequestSchema,
  AiLearningPathGenerateResponseSchema,
  AiTasksGenerateRequestSchema,
  AiTasksGenerateResponseSchema,
  AiDailySopGenerateRequestSchema,
  AiDailySopGenerateResponseSchema,
  AiMinimumActionGenerateRequestSchema,
  AiMinimumActionGenerateResponseSchema,
} from './schemas';

// ============================================================
// App 类型
// ============================================================

type AppEnv = { Variables: { userId: string } };
export const aiRouter = new OpenAPIHono<AppEnv>();

// ============================================================
// Helpers
// ============================================================

/** 统一错误响应定义 */
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
    description: `${desc} - AI 生成失败`,
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
  console.error('[AI Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

// ============================================================
// 1. POST /api/ai/goal/parse — Goal Parser
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/goal/parse',
    tags: ['AI'],
    summary: 'Goal Parser — 解析用户输入为结构化 Goal 建议',
    description:
      'CLAUDE.md 第 10 节：用户创建/整理 Goal 时调用。' +
      '流程：读 prompt_configs → 调 OpenAI → JSON Parse → Schema Validation → 写 ai_generation_logs(success) → 返回建议（不入库）。' +
      '用户确认后由 POST /api/goals 落库。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiGoalParseRequestSchema } } },
    },
    responses: {
      200: {
        description: 'AI 解析建议',
        content: { 'application/json': { schema: ApiSuccessSchema(AiGoalParseResponseSchema) } },
      },
      ...errorResponses('Goal Parser'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.parseGoal(body.rawText, body.existingGoalId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/ai/stages/generate — Stage Generator
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/stages/generate',
    tags: ['AI'],
    summary: 'Stage Generator — 为 Goal 生成 Stage 候选',
    description:
      'CLAUDE.md 第 10 节：创建 Goal 后生成 Stage 候选。' +
      '返回值仅建议，用户确认后由 POST /api/goals/:goalId/stages 落库。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiStagesGenerateRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Stage 候选列表',
        content: { 'application/json': { schema: ApiSuccessSchema(AiStagesGenerateResponseSchema) } },
      },
      ...errorResponses('Stage Generator'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.generateStages(body.goalId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. POST /api/ai/learning-path/generate — Learning Path Organizer
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/learning-path/generate',
    tags: ['AI'],
    summary: 'Learning Path Organizer — 为 Stage 生成 LearningPath 建议',
    description:
      'CLAUDE.md 第 10 节：用户提交当前 Stage 学习路径时调用。' +
      '返回值仅建议，source_type 固定为 ai。用户确认后由 POST /api/stages/:stageId/learning-paths 落库。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiLearningPathGenerateRequestSchema } } },
    },
    responses: {
      200: {
        description: 'LearningPath 建议',
        content: { 'application/json': { schema: ApiSuccessSchema(AiLearningPathGenerateResponseSchema) } },
      },
      ...errorResponses('Learning Path Organizer'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.generateLearningPaths(body.stageId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 4. POST /api/ai/tasks/generate — Task Decomposer
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/tasks/generate',
    tags: ['AI'],
    summary: 'Task Decomposer — 为 Stage/LearningPath 生成 Task 建议',
    description:
      'CLAUDE.md 第 10 节：当前 Stage 的 Learning Path 确认后调用。' +
      '返回值仅建议，用户确认后由 POST /api/stages/:stageId/tasks 落库。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiTasksGenerateRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Task 候选列表',
        content: { 'application/json': { schema: ApiSuccessSchema(AiTasksGenerateResponseSchema) } },
      },
      ...errorResponses('Task Decomposer'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.generateTasks(body.stageId, body.learningPathId, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 5. POST /api/ai/daily-sop/generate — Daily SOP Generator
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/daily-sop/generate',
    tags: ['AI'],
    summary: 'Daily SOP Generator — 为当前 Stage 生成每日 SOP 建议',
    description:
      'CLAUDE.md 第 10 节：当前 Stage 需要生成 Daily SOP 时调用。' +
      '候选 Task 来自当前 Stage 的所有 pending Task。返回值仅建议，不直接写 daily_sops。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiDailySopGenerateRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Daily SOP 建议',
        content: { 'application/json': { schema: ApiSuccessSchema(AiDailySopGenerateResponseSchema) } },
      },
      ...errorResponses('Daily SOP Generator'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.generateDailySop(body.goalId, body.date, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 6. POST /api/ai/minimum-action/generate — Minimum Action Generator
// ============================================================
aiRouter.openapi(
  createRoute({
    method: 'post',
    path: '/minimum-action/generate',
    tags: ['AI'],
    summary: 'Minimum Action Generator — 当天最小动作建议',
    description:
      'CLAUDE.md 第 10 节：当天不存在 Global Minimum Action 时调用。' +
      '业务规则（CONTRACT #25）：taskId 必须来自当天已有 Task，AI 不得创建新 Task。',
    middleware: [authMiddleware],
    request: {
      body: { content: { 'application/json': { schema: AiMinimumActionGenerateRequestSchema } } },
    },
    responses: {
      200: {
        description: 'Minimum Action 建议',
        content: { 'application/json': { schema: ApiSuccessSchema(AiMinimumActionGenerateResponseSchema) } },
      },
      ...errorResponses('Minimum Action Generator'),
    },
  }),
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      const result = await aiService.generateMinimumAction(body.date, body.candidateTaskIds, userId);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
