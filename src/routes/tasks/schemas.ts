// src/routes/tasks/schemas.ts
// Task Zod schemas — 对齐 CONTRACT.md #13/#14 + 扩展 CRUD

import { z } from '@hono/zod-openapi';
import { ApiErrorSchema, ApiSuccessSchema, TimestamptzStringSchema } from '../goals/schemas';

export const TaskStatusSchema = z.enum(['pending', 'completed']);

export const TaskSchema = z.object({
  id: z.string().uuid(),
  stageId: z.string(),
  learningPathId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  estimatedMinutes: z.number().int(),
  orderIndex: z.number().int(),
  status: TaskStatusSchema,
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateTaskRequestSchema = z.object({
  learningPathId: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  estimatedMinutes: z.number().int().positive(),
  orderIndex: z.number().int().min(0),
});

export const UpdateTaskRequestSchema = z.object({
  learningPathId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

export { ApiErrorSchema, ApiSuccessSchema, TimestamptzStringSchema };
