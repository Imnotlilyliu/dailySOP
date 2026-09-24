// src/routes/ai/schemas.ts
// Zod schemas for AI API — 对齐 src/types/dto.ts AiXxxRequest/Response

import { z } from '@hono/zod-openapi';

// ============================================================
// 共用
// ============================================================

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).passthrough(),
});

export const ApiSuccessSchema = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true),
    data,
    meta: z.object({}).optional(),
  });

export const DateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// ============================================================
// 1. Goal Parser — POST /api/ai/goal/parse
// ============================================================

export const AiGoalParseRequestSchema = z.object({
  rawText: z.string().min(1).max(2000),
  existingGoalId: z.string().uuid().optional(),
});

export const AiGoalParseResponseSchema = z.object({
  goal: z.object({
    title: z.string().min(1).max(100),
    description: z.string().nullable(),
    expectedOutcome: z.string().nullable(),
  }),
  aiLogId: z.string().uuid(),
});

// ============================================================
// 2. Stage Generator — POST /api/ai/stages/generate
// ============================================================

export const AiStagesGenerateRequestSchema = z.object({
  goalId: z.string().uuid(),
});

export const AiStagesGenerateResponseSchema = z.object({
  stages: z.array(z.object({
    name: z.string().min(1).max(100),
    description: z.string().optional(),
    orderIndex: z.number().int().min(0),
    durationDays: z.number().int().positive().optional(),
  })),
  aiLogId: z.string().uuid(),
});

// ============================================================
// 3. Learning Path Organizer — POST /api/ai/learning-path/generate
// ============================================================

export const AiLearningPathGenerateRequestSchema = z.object({
  stageId: z.string().uuid(),
});

export const AiLearningPathGenerateResponseSchema = z.object({
  learningPaths: z.array(z.object({
    title: z.string().min(1).max(200),
    type: z.string().min(1),
    description: z.string().optional(),
    orderIndex: z.number().int().min(0),
    sourceType: z.literal('ai'),
  })),
  aiLogId: z.string().uuid(),
});

/** 内部校验用：不含 sourceType（service 层固定为 'ai'） */
export const AiLearningPathGenerateResponseInnerSchema = z.object({
  learningPaths: z.array(z.object({
    title: z.string().min(1).max(200),
    type: z.string().min(1),
    description: z.string().optional(),
    orderIndex: z.number().int().min(0),
  })),
});

// ============================================================
// 4. Task Decomposer — POST /api/ai/tasks/generate
// ============================================================

export const AiTasksGenerateRequestSchema = z.object({
  stageId: z.string().uuid(),
  learningPathId: z.string().uuid().optional(),
});

export const AiTasksGenerateResponseSchema = z.object({
  tasks: z.array(z.object({
    title: z.string().min(1).max(200),
    description: z.string().optional(),
    estimatedMinutes: z.number().int().positive(),
    orderIndex: z.number().int().min(0),
    learningPathId: z.string().uuid().optional(),
  })),
  aiLogId: z.string().uuid(),
});

// ============================================================
// 5. Daily SOP Generator — POST /api/ai/daily-sop/generate
// ============================================================

export const AiDailySopGenerateRequestSchema = z.object({
  goalId: z.string().uuid(),
  date: DateStringSchema,
});

export const AiDailySopGenerateResponseSchema = z.object({
  tasks: z.array(z.object({
    taskId: z.string().uuid(),
    orderIndex: z.number().int().min(0),
  })),
  aiLogId: z.string().uuid(),
});

// ============================================================
// 6. Minimum Action Generator — POST /api/ai/minimum-action/generate
// ============================================================

export const AiMinimumActionGenerateRequestSchema = z.object({
  date: DateStringSchema,
  candidateTaskIds: z.array(z.string().uuid()).optional(),
});

export const AiMinimumActionGenerateResponseSchema = z.object({
  taskId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nullable(),
  estimatedMinutes: z.number().int().positive(),
  aiLogId: z.string().uuid(),
});
