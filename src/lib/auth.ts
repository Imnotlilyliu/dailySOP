// src/lib/auth.ts
// 认证中间件 — MVP 阶段：JWT (Authorization: Bearer) 优先，X-User-Id fallback（dev）
//
// 鉴权顺序：
//   1. Authorization: Bearer <jwt>  → 校验 JWT，提取 sub (userId)
//   2. X-User-Id: <uuid>           → dev 兼容（需 NODE_ENV !== 'production'）
//   3. 都没有                       → 401
//
// 生产环境应禁用 X-User-Id fallback。

import { createMiddleware } from 'hono/factory';
import { Errors } from './response';
import { authService } from '../services/auth.service';

const isDev = process.env['NODE_ENV'] !== 'production';

export const authMiddleware = createMiddleware<{
  Variables: { userId: string };
}>(async (c, next) => {
  // 1. JWT 优先
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const { userId } = authService.verifyToken(token);
      c.set('userId', userId);
      await next();
      return;
    } catch (e) {
      const error = e instanceof Error && 'code' in e
        ? e
        : Errors.unauthorized('Invalid or expired JWT');
      return c.json({ success: false, error }, 401);
    }
  }

  // 2. X-User-Id fallback（dev）
  const xUserId = c.req.header('X-User-Id');
  if (xUserId && isDev) {
    c.set('userId', xUserId);
    await next();
    return;
  }

  // 3. 都没有
  return c.json(
    { success: false, error: Errors.unauthorized('缺少 Authorization 或 X-User-Id') },
    401,
  );
});
