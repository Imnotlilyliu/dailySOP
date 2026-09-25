// src/routes/stages/schemas.ts
// Stage Zod schemas — 对齐 CLAUDE.md 第 8 节 + API Contract 第 78-99 行

import { z } from '@hono/zod-openapi';
import { ApiErrorSchema, ApiSuccessSchema, DateStringSchema, TimestamptzStringSchema } from '../goals/schemas';

export const StageStatusSchema = z.enum(['not_started', 'in_progress', 'completed']);

export const StageSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  orderIndex: z.number().int(),
  durationDays: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: StageStatusSchema,
  goalId: z.string(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateStageRequestSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullish(),
  orderIndex: z.number().int().min(0),
  durationDays: z.number().int().positive().nullish(),
  startDate: TimestamptzStringSchema.nullish(),
  endDate: TimestamptzStringSchema.nullish(),
});

export const UpdateStageRequestSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullish(),
  orderIndex: z.number().int().min(0).optional(),
  durationDays: z.number().int().positive().nullish(),
  startDate: TimestamptzStringSchema.nullish(),
  endDate: TimestamptzStringSchema.nullish(),
});

export const CompleteStageResponseSchema = z.object({
  stage: StageSchema,
  nextStage: StageSchema.nullable(),
  goalCompleted: z.boolean(),
});

export { ApiErrorSchema, ApiSuccessSchema, DateStringSchema };
