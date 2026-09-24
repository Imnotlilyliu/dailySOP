// src/services/auth.service.ts
// 认证业务服务层 — MVP 阶段：JWT 签发/校验 + dev-login（不校验密码）
//
// 设计取舍（CLAUDE.md 未明确认证要求，MVP 阶段）：
//   - 数据库 User 表无 password 字段，不引入 schema migration
//   - dev-login：根据 userId 或 email 直接签 JWT（仅 dev 环境）
//   - 生产：需替换为真实认证（OAuth/Email 验证码）
//   - JWT payload: { sub: userId, iat, exp }
//
// 复用 Hono 自带 jwt 中间件（不引入外部依赖）

import { db } from '../prisma/db';
import { Errors } from '../lib/response';

// ============================================================
// JWT 辅助（轻量实现，不引外部库）
// ============================================================

function base64UrlEncode(s: string): string {
  const b64 = Buffer.from(s, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(s: string): string {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return Buffer.from(b64, 'base64').toString('utf-8');
}

function hmacSha256(key: string, message: string): string {
  // Node 18+ 有 globalThis.crypto.subtle，使用同步回退到 createHmac
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac } = require('crypto');
  return createHmac('sha256', key).update(message).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface JwtPayload {
  sub: string; // userId
  iat: number; // issued at（秒）
  exp: number; // expiration（秒）
}

function signJwt(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInSec = 7 * 24 * 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JwtPayload = { ...payload, iat: now, exp: now + expiresInSec };
  const h = base64UrlEncode(JSON.stringify(header));
  const p = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = hmacSha256(getSecret(), `${h}.${p}`);
  return `${h}.${p}.${sig}`;
}

function verifyJwt(token: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw Errors.unauthorized('Invalid JWT format');
  }
  const [h, p, sig] = parts;
  const expected = hmacSha256(getSecret(), `${h}.${p}`);
  if (sig !== expected) {
    throw Errors.unauthorized('Invalid JWT signature');
  }
  const payload = JSON.parse(base64UrlDecode(p)) as JwtPayload;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    throw Errors.unauthorized('JWT expired');
  }
  return payload;
}

function getSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) {
    if (process.env['NODE_ENV'] === 'production') {
      throw Errors.internal('JWT_SECRET 未配置（生产环境必填）');
    }
    // dev 默认值（生产必须设置）
    return 'dev-secret-please-change-in-production';
  }
  return secret;
}

// ============================================================
// Service
// ============================================================

export const authService = {
  /**
   * POST /api/auth/email-login — 邮箱登录（生产可用）
   * 不校验密码：根据 email 查找用户，若不存在则自动创建
   * 适用于"分享 URL + 手机使用"的极简密码less登录
   */
  async emailLogin(input: { email: string; name?: string }) {
    let user = await db.orm.public.User
      .where((u) => u.email.eq(input.email))
      .first();
    if (!user) {
      // 自动创建（密码less 便捷登录）
      user = await this.createUser({
        email: input.email,
        name: input.name ?? input.email.split('@')[0]!,
      });
    }
    if (!user) {
      throw Errors.internal('用户加载失败');
    }
    const token = signJwt({ sub: user.id });
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  },

  /**
   * POST /api/auth/dev-login — 开发登录（仅 dev 环境）
   * 不校验密码，根据 userId 或 email 直接签 JWT
   * 仅在 NODE_ENV !== 'production' 时启用
   */
  async devLogin(input: { userId?: string; email?: string; name?: string }) {
    if (process.env['NODE_ENV'] === 'production') {
      throw Errors.forbidden('dev-login 仅在非生产环境可用');
    }

    let user;
    if (input.userId) {
      user = await db.orm.public.User
        .where((u) => u.id.eq(input.userId!))
        .first();
      if (!user) {
        throw Errors.notFound('User', input.userId);
      }
    } else if (input.email) {
      // dev 模式直接走 emailLogin（创建或查找）
      return this.emailLogin({ email: input.email, name: input.name });
    } else {
      throw Errors.validation('需提供 userId 或 email');
    }

    if (!user) {
      throw Errors.internal('用户加载失败');
    }
    const token = signJwt({ sub: user.id });
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  },

  /**
   * GET /api/auth/me — 获取当前用户信息
   * 已通过 authMiddleware 校验
   */
  async me(userId: string) {
    const user = await db.orm.public.User
      .where((u) => u.id.eq(userId))
      .first();
    if (!user) {
      throw Errors.notFound('User', userId);
    }
    return { id: user.id, email: user.email, name: user.name };
  },

  /** 创建用户（dev 便捷） */
  async createUser(input: { email: string; name: string }) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g: any = globalThis;
    const id = g.crypto?.randomUUID() ?? `u-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ts = new Date().toISOString();
    await db.orm.public.User.create({
      id,
      email: input.email,
      name: input.name,
      createdAt: ts,
      updatedAt: ts,
    });
    return await db.orm.public.User.where((u) => u.id.eq(id)).first();
  },

  /** 校验 JWT（authMiddleware 调用） */
  verifyToken(token: string): { userId: string } {
    const payload = verifyJwt(token);
    return { userId: payload.sub };
  },
};
