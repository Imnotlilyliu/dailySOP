// src/routes/auth/auth.routes.ts
// Auth API 路由 — MVP 阶段
//   POST /api/auth/dev-login   — 开发登录（不校验密码，签 JWT）
//   GET  /api/auth/me          — 获取当前用户
//   POST /api/auth/register    — 注册（创建 user + 签 JWT）

import { createRoute, OpenAPIHono } from '@hono/zod-openapi';
import { z } from '@hono/zod-openapi';
import { authMiddleware } from '../../lib/auth';
import { Errors, ok, httpStatusFor } from '../../lib/response';
import { authService } from '../../services/auth.service';
import type { ApiError } from '../../types/api';
import { ApiErrorSchema, ApiSuccessSchema } from '../goals/schemas';

type AppEnv = { Variables: { userId: string } };

export const authRouter = new OpenAPIHono<AppEnv>();

const errorResponses = (desc: string) => ({
  '400': {
    description: `${desc} - 参数校验失败`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '401': {
    description: `${desc} - 未登录`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '403': {
    description: `${desc} - 禁止访问`,
    content: { 'application/json': { schema: ApiErrorSchema } },
  },
  '404': {
    description: `${desc} - 资源不存在`,
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
  console.error('[Auth Route] Unexpected error:', e);
  return c.json({ success: false, error: Errors.internal('服务端内部错误') }, 500);
}

const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  name: z.string(),
});

const AuthResponseSchema = z.object({
  user: UserSchema,
  token: z.string(),
});

const DevLoginRequestSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().email().optional(),
  name: z.string().optional(),
}).refine((d) => d.userId || d.email, {
  message: '需提供 userId 或 email',
});

const RegisterRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
});

const EmailLoginRequestSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100).optional(),
});

// ============================================================
// 1. POST /api/auth/dev-login — 开发登录
// ============================================================
authRouter.openapi(
  createRoute({
    method: 'post',
    path: '/dev-login',
    tags: ['Auth'],
    summary: '开发登录（不校验密码，直接签 JWT）',
    description: 'MVP 阶段开发用：根据 userId 或 email 直接签 JWT。生产环境禁用。',
    request: {
      body: { content: { 'application/json': { schema: DevLoginRequestSchema } } },
    },
    responses: {
      200: {
        description: '登录成功',
        content: { 'application/json': { schema: ApiSuccessSchema(AuthResponseSchema) } },
      },
      ...errorResponses('开发登录'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const body = c.req.valid('json');
      const result = await authService.devLogin(body);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 2. POST /api/auth/email-login — 邮箱登录（生产可用，密码less）
// ============================================================
authRouter.openapi(
  createRoute({
    method: 'post',
    path: '/email-login',
    tags: ['Auth'],
    summary: '邮箱登录（密码less，自动注册）',
    description: '根据 email 查找用户；不存在则自动创建。生产环境可用，适合分享 URL 给朋友使用。',
    request: {
      body: { content: { 'application/json': { schema: EmailLoginRequestSchema } } },
    },
    responses: {
      200: {
        description: '登录成功',
        content: { 'application/json': { schema: ApiSuccessSchema(AuthResponseSchema) } },
      },
      ...errorResponses('邮箱登录'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const body = c.req.valid('json');
      const result = await authService.emailLogin(body);
      return c.json(ok(result), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. POST /api/auth/register — 注册（创建 user + 签 JWT）
// ============================================================
authRouter.openapi(
  createRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: '注册新用户',
    description: '创建 user 记录并签 JWT。email 唯一。',
    request: {
      body: { content: { 'application/json': { schema: RegisterRequestSchema } } },
    },
    responses: {
      201: {
        description: '注册成功',
        content: { 'application/json': { schema: ApiSuccessSchema(AuthResponseSchema) } },
      },
      ...errorResponses('注册'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const body = c.req.valid('json');
      // 检查 email 是否已存在
      const existing = await (await import('../../prisma/db')).db.orm.public.User
        .where((u) => u.email.eq(body.email))
        .first();
      if (existing) {
        throw Errors.conflict('email 已注册', 'email');
      }
      await authService.createUser({
        email: body.email,
        name: body.name,
      });
      // 创建完成后用 emailLogin 签 JWT（生产可用）
      const result = await authService.emailLogin({ email: body.email, name: body.name });
      return c.json(ok(result), 201);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);

// ============================================================
// 3. GET /api/auth/me — 获取当前用户
// ============================================================
authRouter.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['Auth'],
    summary: '获取当前用户',
    middleware: [authMiddleware],
    responses: {
      200: {
        description: '当前用户信息',
        content: { 'application/json': { schema: ApiSuccessSchema(UserSchema) } },
      },
      ...errorResponses('获取当前用户'),
    },
  }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (async (c: any): Promise<any> => {
    try {
      const userId = c.get('userId');
      const user = await authService.me(userId);
      return c.json(ok(user), 200);
    } catch (e) {
      return handleError(c, e);
    }
  }) as any,
);
