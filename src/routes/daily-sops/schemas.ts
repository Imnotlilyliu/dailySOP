// src/routes/daily-sops/schemas.ts
// DailySop / MinimumAction Zod schemas — 对齐 contract.d.ts

import { z } from '@hono/zod-openapi';
import { ApiErrorSchema, ApiSuccessSchema, DateStringSchema } from '../goals/schemas';

export { ApiErrorSchema, ApiSuccessSchema, DateStringSchema };

// ============================================================
// DailySop
// ============================================================

export const DailySopStatusSchema = z.enum(['pending', 'completed']);

export const DailySopSchema = z.object({
  id: z.string().uuid(),
  goalId: z.string().uuid(),
  stageId: z.string().uuid(),
  date: DateStringSchema,
  status: DailySopStatusSchema,
  userId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
});

export const CreateDailySopRequestSchema = z.object({
  date: DateStringSchema,
  stageId: z.string().uuid(),
});

// ============================================================
// MinimumAction
// ============================================================

export const MinimumActionSchema = z.object({
  id: z.string().uuid(),
  dailySopId: z.string().uuid(),
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  estimatedMinutes: z.number().int(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateMinimumActionRequestSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullish(),
  estimatedMinutes: z.number().int().positive(),
});

export const SetGlobalMinimumActionRequestSchema = z.object({
  date: DateStringSchema,
  minimumActionId: z.string().uuid(),
});

// ============================================================
// /api/today 响应
// ============================================================

export const TodayResponseSchema = z.object({
  date: DateStringSchema,
  goals: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: z.string(),
  })),
  sops: z.array(z.object({
    goalId: z.string().uuid(),
    sop: DailySopSchema.nullable(),
  })),
  globalMinimumAction: MinimumActionSchema.nullable(),
});
