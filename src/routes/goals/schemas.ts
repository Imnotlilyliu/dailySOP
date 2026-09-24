// src/routes/goals/schemas.ts
// Zod schemas for Goal API — 对齐 src/types/dto.ts 与 contract.prisma 字段约束

import { z } from '@hono/zod-openapi';

// ============================================================
// Prisma 字段约束（来自 contract.prisma）
// ============================================================

export const GoalStatusSchema = z.enum(['active', 'paused', 'completed', 'deleted']);

// VarChar(100) → 字符串长度 ≤ 100
export const GoalTitleSchema = z.string().min(1).max(100);
// VarChar(100) for Stage.name; Goal.title 同上
export const StageNameSchema = z.string().min(1).max(100);
// VarChar(200) for Task.title / MinimumAction.title / LearningPath.title
export const TaskTitleSchema = z.string().min(1).max(200);

// ISO 8601 时间戳字符串（对应 TimestamptzString）
export const TimestamptzStringSchema = z.string().datetime();
// ISO 日期字符串 YYYY-MM-DD（对应 DateString）
export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============================================================
// 响应/请求 DTO
// ============================================================

export const GoalSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  expectedOutcome: z.string().nullable(),
  status: GoalStatusSchema,
  startDate: z.string().nullable(),
  targetDate: z.string().nullable(),
  currentStageId: z.string().nullable(),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
});

export const CreateGoalRequestSchema = z.object({
  title: GoalTitleSchema,
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  startDate: TimestamptzStringSchema.optional(),
  targetDate: TimestamptzStringSchema.optional(),
});

export const UpdateGoalRequestSchema = z.object({
  title: GoalTitleSchema.optional(),
  description: z.string().optional(),
  expectedOutcome: z.string().optional(),
  startDate: TimestamptzStringSchema.optional(),
  targetDate: TimestamptzStringSchema.optional(),
  currentStageId: z.string().nullable().optional(),
});

export const GoalListQuerySchema = z.object({
  status: GoalStatusSchema.optional(),
});

// 统一响应包装
export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    meta: z.object({}).optional(),
  });

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).passthrough(),
});
