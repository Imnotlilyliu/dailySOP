// web/lib/api.ts
// 后端 API 客户端：fetch wrapper，自动注入 Authorization: Bearer。
// 鉴权：JWT 优先；dev 阶段若 localStorage 无 token，回退 X-User-Id（兼容 SSR）。
//
// Token 管理：
//   - 客户端组件用 useAuthToken() 拿到 token 后再调 API
//   - Server Component 通过 props 注入 token（fetch 时显式传）

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
const DEV_USER_ID =
  process.env.NEXT_PUBLIC_DEV_USER_ID ?? '00000000-0000-0000-0000-000000000001';

// ============================================================
// Token 管理（仅 client 侧可用）
// ============================================================

const TOKEN_KEY = 'daily-sop-token';
const USER_KEY = 'daily-sop-user';

export interface AuthUser {
  id: string;
  email: string | null;
  name: string;
}

/** 读取 localStorage 中的 JWT（仅 client） */
export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/** 读取 localStorage 中的 user 信息（仅 client） */
export function getStoredUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// ============================================================
// 请求工具
// ============================================================

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public context?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    rule?: string;
    fields?: Array<{ field: string; message: string }>;
    context?: unknown;
  };
}

/**
 * 显式传 token 时使用 Authorization: Bearer；否则 fallback X-User-Id（dev SSR）。
 */
async function request<T>(
  path: string,
  init?: RequestInit & { token?: string; skipJson?: boolean },
): Promise<T> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (init?.token) {
    headers['Authorization'] = `Bearer ${init.token}`;
  } else if (typeof window !== 'undefined') {
    // client 优先用 localStorage token
    const t = getStoredToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
    else headers['X-User-Id'] = DEV_USER_ID;
  } else {
    // SSR fallback
    headers['X-User-Id'] = DEV_USER_ID;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    cache: 'no-store',
  });

  if (res.status === 204) return undefined as T;

  const json: ApiResponse<T> = await res.json().catch(() => ({ success: false }));

  if (!res.ok || !json.success) {
    const err = json.error ?? { code: 'UNKNOWN', message: `HTTP ${res.status}` };
    throw new ApiError(res.status, err.code, err.message, err.context ?? err);
  }

  return json.data as T;
}

export const api = {
  get: <T>(path: string, token?: string) =>
    request<T>(path, { method: 'GET', token }),
  post: <T>(path: string, body?: unknown, token?: string) =>
    request<T>(path, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      token,
    }),
  patch: <T>(path: string, body?: unknown, token?: string) =>
    request<T>(path, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      token,
    }),
  delete: <T>(path: string, token?: string) =>
    request<T>(path, { method: 'DELETE', token }),
};

// ============================================================
// Auth API
// ============================================================

export interface AuthResponse {
  user: AuthUser;
  token: string;
}

export async function devLogin(input: { email?: string; userId?: string; name?: string }): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/dev-login', input);
}

export async function emailLogin(input: { email: string; name?: string }): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/email-login', input);
}

export async function registerUser(input: { email: string; name: string }): Promise<AuthResponse> {
  return api.post<AuthResponse>('/api/auth/register', input);
}

// ============================================================
// 类型定义（对齐后端 DTO）
// ============================================================

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  expectedOutcome: string | null;
  status: 'active' | 'paused' | 'completed' | 'deleted';
  startDate: string | null;
  targetDate: string | null;
  currentStageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Stage {
  id: string;
  goalId: string;
  name: string;
  description: string | null;
  orderIndex: number;
  durationDays: number | null;
  startDate: string | null;
  endDate: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  completedAt: string | null;
}

export interface LearningPath {
  id: string;
  stageId: string;
  title: string;
  type: string;
  description: string | null;
  sourceType: 'user' | 'ai';
  orderIndex: number;
}

export interface Task {
  id: string;
  stageId: string;
  learningPathId: string | null;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  orderIndex: number;
  status: 'pending' | 'completed';
  completedAt: string | null;
}

export interface DailySop {
  id: string;
  goalId: string;
  stageId: string;
  date: string;
  status: 'pending' | 'completed';
  userId: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface MinimumAction {
  id: string;
  dailySopId: string;
  taskId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// AI 响应
export interface AiGoalParseResult {
  goal: {
    title: string;
    description: string | null;
    expectedOutcome: string | null;
  };
  aiLogId: string;
}

export interface AiStageGenerateResult {
  stages: Array<{
    name: string;
    description: string | null;
    orderIndex: number;
    durationDays: number | null;
  }>;
  aiLogId: string;
}

export interface AiLearningPathGenerateResult {
  learningPaths: Array<{
    title: string;
    type: string;
    description?: string;
    orderIndex: number;
    sourceType: 'ai';
  }>;
  aiLogId: string;
}

export interface AiTaskGenerateResult {
  tasks: Array<{
    title: string;
    description: string | null;
    estimatedMinutes: number;
    orderIndex: number;
    learningPathId?: string | null;
  }>;
  aiLogId: string;
}

export interface AiDailySopGenerateResult {
  tasks: Array<{
    taskId: string;
    orderIndex: number;
  }>;
  aiLogId: string;
}

export interface AiMinimumActionResult {
  taskId: string;
  title: string;
  description: string | null;
  estimatedMinutes: number;
  aiLogId: string;
}
