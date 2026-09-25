// src/routes/learning-paths/schemas.ts
// LearningPath Zod schemas — 扩展 CONTRACT.md（CLAUDE.md 第 8 节 LearningPath 模型）

import { z } from '@hono/zod-openapi';
import { ApiErrorSchema, ApiSuccessSchema, TimestamptzStringSchema } from '../goals/schemas';

export const LearningPathSourceSchema = z.enum(['user', 'ai']);

export const LearningPathSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: z.string(),
  description: z.string().nullable(),
  sourceType: LearningPathSourceSchema,
  orderIndex: z.number().int(),
  stageId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateLearningPathRequestSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.string().min(1),
  description: z.string().nullish(),
  orderIndex: z.number().int().min(0),
});

export const UpdateLearningPathRequestSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.string().min(1).optional(),
  description: z.string().nullish(),
  orderIndex: z.number().int().min(0).optional(),
});

export { ApiErrorSchema, ApiSuccessSchema, TimestamptzStringSchema };
