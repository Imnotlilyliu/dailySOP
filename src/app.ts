// src/app.ts
// Hono 主应用：挂载所有 API 路由 + Swagger UI

import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { goalsRouter } from './routes/goals/goals.routes';
import { goalStagesRouter, stagesRouter } from './routes/stages/stages.routes';
import { stageLearningPathsRouter, learningPathsRouter } from './routes/learning-paths/learning-paths.routes';
import { stageTasksRouter, learningPathTasksRouter, tasksRouter } from './routes/tasks/tasks.routes';
import { aiRouter } from './routes/ai/ai.routes';
import { todayRouter, goalDailySopsRouter, dailySopsRouter } from './routes/daily-sops/daily-sops.routes';
import { minimumActionsRouter, dailyMinimumActionsRouter } from './routes/minimum-actions/minimum-actions.routes';
import { authRouter } from './routes/auth/auth.routes';
import { Errors, httpStatusFor } from './lib/response';

const app = new OpenAPIHono({
  // 统一 Zod 校验失败响应格式，对齐 src/types/api.ts 契约
  defaultHook: (result, c) => {
    if (!result.success) {
      const error = Errors.validation('请求参数校验失败', result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })));
      return c.json({ success: false, error }, httpStatusFor(error.code));
    }
  },
});

// CORS：允许前端跨域调用 API
//   开发：http://localhost:3001
//   生产：通过 CORS_ORIGIN 环境变量配置（逗号分隔多域名）
const corsOrigins = (process.env['CORS_ORIGIN'] ?? 'http://localhost:3001,http://127.0.0.1:3001')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use('/api/*', cors({
  origin: corsOrigins,
  allowHeaders: ['Content-Type', 'X-User-Id', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Type'],
  maxAge: 86400,
}));

// 健康检查
app.get('/health', (c) => c.json({ status: 'ok' }));

// Auth 路由：/api/auth/* 3 个端点（dev-login, register, me）
app.route('/api/auth', authRouter);

// API 路由
app.route('/api/goals', goalsRouter);

// Stage 路由：在 /api/goals/:goalId/stages 上挂 GET / POST
// 由于嵌套路径需要参数化，使用 route('/api/goals/:goalId/stages', ...)
app.route('/api/goals/:goalId/stages', goalStagesRouter);
app.route('/api/stages', stagesRouter);

// LearningPath 路由：
//   /api/stages/:stageId/learning-paths 上挂 GET / POST
//   /api/learning-paths/:pathId 上挂 PATCH / DELETE
app.route('/api/stages/:stageId/learning-paths', stageLearningPathsRouter);
app.route('/api/learning-paths', learningPathsRouter);

// Task 路由：
//   /api/stages/:stageId/tasks 上挂 GET / POST
//   /api/learning-paths/:pathId/tasks 上挂 GET
//   /api/tasks/:taskId 上挂 PATCH / DELETE / POST complete / POST uncomplete
app.route('/api/stages/:stageId/tasks', stageTasksRouter);
app.route('/api/learning-paths/:pathId/tasks', learningPathTasksRouter);
app.route('/api/tasks', tasksRouter);

// DailySop 路由：
//   /api/today 上挂 GET（聚合今日数据）
//   /api/goals/:goalId/daily-sops 上挂 GET /:date, POST /
//   /api/daily-sops/:sopId 上挂 POST /complete, /uncomplete
//   /api/daily-sops/:sopId/minimum-action 上挂 GET, POST, DELETE
app.route('/api/today', todayRouter);
app.route('/api/goals/:goalId/daily-sops', goalDailySopsRouter);
app.route('/api/daily-sops', dailySopsRouter);

// MinimumAction 路由：
//   /api/minimum-actions/:actionId 上挂 POST /complete, /uncomplete
//   /api/daily-minimum-actions 上挂 GET /:date, POST /, DELETE /:date
app.route('/api/minimum-actions', minimumActionsRouter);
app.route('/api/daily-minimum-actions', dailyMinimumActionsRouter);

// AI 路由：/api/ai/* 6 个端点（CLAUDE.md 第 9 节）
//   /goal/parse, /stages/generate, /learning-path/generate,
//   /tasks/generate, /daily-sop/generate, /minimum-action/generate
app.route('/api/ai', aiRouter);

// OpenAPI spec
const apiServerUrl = process.env['API_BASE_URL'] ?? `http://localhost:${process.env['PORT'] ?? 3000}`;
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Daily SOP API',
    version: '1.0.0',
    description: '每日 SOP MVP API — Goal / Stage / LearningPath / Task / AI 后端。对齐 CLAUDE.md 第 8、9 节。',
  },
  servers: [{ url: apiServerUrl, description: process.env['NODE_ENV'] === 'production' ? '生产' : '本地开发' }],
});

// Swagger UI（手动测试入口）
app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default app;
