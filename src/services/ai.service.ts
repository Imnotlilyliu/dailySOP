// src/services/ai.service.ts
// AI 业务服务层（CLAUDE.md 第 9、11 节）
//
// 严格流程：
//   1. 读取 PromptConfig（MVP 内嵌，结构对齐 prompt_configs 表）
//   2. 构造 Input JSON
//   3. 调用 OpenAI（MVP: mock；真实接入：替换 callOpenAI 函数体）
//   4. JSON.parse
//   5. Zod Schema Validation
//   6. 成功：写 ai_generation_logs(success) + 返回建议（不入业务表）
//   7. 失败：Retry 1 次 → 仍失败 → 写 ai_generation_logs(failure) → 抛 AI_GENERATION_FAILED
//
// 关键约束（CLAUDE.md 第 8 节）：
//   - AI 不直接修改业务状态（仅返回建议，由用户确认后由 CRUD API 落库）
//   - AI 输出未经 Schema Validation 不得进入数据库

import { db } from '../prisma/db';
import { Errors } from '../lib/response';
import { getPrompt, type PromptConfig } from '../ai/prompts';
import { callOpenAI } from '../ai/client';
import {
  AiGoalParseResponseSchema,
  AiStagesGenerateResponseSchema,
  AiLearningPathGenerateResponseInnerSchema,
  AiTasksGenerateResponseSchema,
  AiDailySopGenerateResponseSchema,
  AiMinimumActionGenerateResponseSchema,
} from '../routes/ai/schemas';
import type { ZodTypeAny } from 'zod';

// ============================================================
// 类型：AI 调用上下文
// ============================================================

interface AiCallContext<TOutput> {
  promptId: string;
  input: unknown;
  outputSchema: ZodTypeAny; // Zod schema for validation
  // 业务辅助：拿到 AI 输出后做额外校验（例如 taskId 必须在 input 候选里）
  postValidate?: (output: TOutput, input: unknown) => void | string; // 返回 error message 或 undefined
}

// ============================================================
// Service
// ============================================================

export const aiService = {
  // ----------------------------------------------------------
  // 1. POST /api/ai/goal/parse — Goal Parser
  // ----------------------------------------------------------
  async parseGoal(rawText: string, existingGoalId: string | undefined, userId: string) {
    // 若 existingGoalId 提供：拉取现有 Goal 作为上下文（不写入）
    let existingGoalCtx: { id: string; title: string; description: string | null } | undefined;
    if (existingGoalId) {
      const goal = await db.orm.public.Goal
        .where((g) => g.id.eq(existingGoalId))
        .first();
      if (!goal) {
        throw Errors.notFound('Goal', existingGoalId);
      }
      if (goal.userId !== userId) {
        throw Errors.forbidden('无权访问该 Goal');
      }
      existingGoalCtx = { id: goal.id, title: goal.title, description: goal.description };
    }

    const input = {
      rawText,
      ...(existingGoalCtx ? { existingGoal: existingGoalCtx } : {}),
    };

    const output = await this.invokeAi<{ goal: { title: string; description: string | null; expectedOutcome: string | null } }>({
      promptId: 'goal-parser',
      input,
      outputSchema: AiGoalParseResponseSchema.omit({ aiLogId: true }),
      userId,
    });

    return { goal: output.goal, aiLogId: output.__aiLogId };
  },

  // ----------------------------------------------------------
  // 2. POST /api/ai/stages/generate — Stage Generator
  // ----------------------------------------------------------
  async generateStages(goalId: string, userId: string) {
    const goal = await db.orm.public.Goal.where((g) => g.id.eq(goalId)).first();
    if (!goal) throw Errors.notFound('Goal', goalId);
    if (goal.userId !== userId) throw Errors.forbidden('无权访问该 Goal');

    const input = {
      goal: {
        id: goal.id,
        title: goal.title,
        description: goal.description,
        expectedOutcome: goal.expectedOutcome,
      },
    };

    const output = await this.invokeAi<{ stages: Array<{ name: string; description?: string; orderIndex: number; durationDays?: number }> }>({
      promptId: 'stage-generator',
      input,
      outputSchema: AiStagesGenerateResponseSchema.omit({ aiLogId: true }),
      userId,
    });

    return { stages: output.stages, aiLogId: output.__aiLogId };
  },

  // ----------------------------------------------------------
  // 3. POST /api/ai/learning-path/generate — Learning Path Organizer
  // ----------------------------------------------------------
  async generateLearningPaths(stageId: string, userId: string) {
    const stage = await db.orm.public.Stage.where((s) => s.id.eq(stageId)).first();
    if (!stage) throw Errors.notFound('Stage', stageId);

    const goal = await db.orm.public.Goal.where((g) => g.id.eq(stage.goalId)).first();
    if (!goal) throw Errors.notFound('Goal', stage.goalId);
    if (goal.userId !== userId) throw Errors.forbidden('无权访问该 Stage');

    const input = {
      stage: {
        id: stage.id,
        name: stage.name,
        description: stage.description,
        goal: { id: goal.id, title: goal.title },
      },
    };

    const output = await this.invokeAi<{ learningPaths: Array<{ title: string; type: string; description?: string; orderIndex: number }> }>({
      promptId: 'learning-path-organizer',
      input,
      outputSchema: AiLearningPathGenerateResponseInnerSchema,
      userId,
    });

    // 服务层固定 source_type=ai（CONTRACT #13-LP 业务规则）
    const learningPaths = output.learningPaths.map((p) => ({
      ...p,
      sourceType: 'ai' as const,
    }));

    return { learningPaths, aiLogId: output.__aiLogId };
  },

  // ----------------------------------------------------------
  // 4. POST /api/ai/tasks/generate — Task Decomposer
  // ----------------------------------------------------------
  async generateTasks(stageId: string, learningPathId: string | undefined, userId: string) {
    const stage = await db.orm.public.Stage.where((s) => s.id.eq(stageId)).first();
    if (!stage) throw Errors.notFound('Stage', stageId);

    const goal = await db.orm.public.Goal.where((g) => g.id.eq(stage.goalId)).first();
    if (!goal) throw Errors.notFound('Goal', stage.goalId);
    if (goal.userId !== userId) throw Errors.forbidden('无权访问该 Stage');

    let learningPath: { id: string; title: string; type: string } | undefined;
    if (learningPathId) {
      const lp = await db.orm.public.LearningPath
        .where((p) => p.id.eq(learningPathId))
        .first();
      if (!lp) throw Errors.notFound('LearningPath', learningPathId);
      if (lp.stageId !== stageId) {
        throw Errors.business(
          'TASK_PATH_STAGE_MISMATCH',
          'LearningPath 不属于该 Stage',
          { stageId, learningPathId, pathStageId: lp.stageId },
        );
      }
      learningPath = { id: lp.id, title: lp.title, type: lp.type };
    }

    const input = {
      stage: { id: stage.id, name: stage.name },
      ...(learningPath ? { learningPath } : {}),
    };

    const output = await this.invokeAi<{ tasks: Array<{ title: string; description?: string; estimatedMinutes: number; orderIndex: number; learningPathId?: string }> }>({
      promptId: 'task-decomposer',
      input,
      outputSchema: AiTasksGenerateResponseSchema.omit({ aiLogId: true }),
      userId,
    });

    return { tasks: output.tasks, aiLogId: output.__aiLogId };
  },

  // ----------------------------------------------------------
  // 5. POST /api/ai/daily-sop/generate — Daily SOP Generator
  // ----------------------------------------------------------
  async generateDailySop(goalId: string, date: string, userId: string) {
    const goal = await db.orm.public.Goal.where((g) => g.id.eq(goalId)).first();
    if (!goal) throw Errors.notFound('Goal', goalId);
    if (goal.userId !== userId) throw Errors.forbidden('无权访问该 Goal');

    // 拉取当前 Stage 的所有 pending tasks 作为候选
    let stage: { id: string; name: string } | undefined;
    const candidateTasks: Array<{ id: string; title: string; estimatedMinutes: number }> = [];

    if (goal.currentStageId) {
      const s = await db.orm.public.Stage
        .where((st) => st.id.eq(goal.currentStageId as string))
        .first();
      if (s) {
        stage = { id: s.id, name: s.name };

        const tasks = await db.orm.public.Task
          .where((t) => t.stageId.eq(s.id))
          .orderBy((t) => t.orderIndex.asc())
          .all();

        for (const t of tasks) {
          if (t.status === 'pending') {
            candidateTasks.push({
              id: t.id,
              title: t.title,
              estimatedMinutes: t.estimatedMinutes,
            });
          }
        }
      }
    }

    const input = {
      goal: { id: goal.id, title: goal.title },
      stage,
      tasks: candidateTasks,
      date,
    };

    const output = await this.invokeAi<{ tasks: Array<{ taskId: string; orderIndex: number }> }>({
      promptId: 'daily-sop-generator',
      input,
      outputSchema: AiDailySopGenerateResponseSchema.omit({ aiLogId: true }),
      userId,
      // 业务校验：AI 输出的 taskId 必须来自候选
      postValidate: (out) => {
        const validIds = new Set(candidateTasks.map((t) => t.id));
        for (const item of out.tasks) {
          if (!validIds.has(item.taskId)) {
            return `AI 返回的 taskId 不在候选列表中: ${item.taskId}`;
          }
        }
      },
    });

    return { tasks: output.tasks, aiLogId: output.__aiLogId };
  },

  // ----------------------------------------------------------
  // 6. POST /api/ai/minimum-action/generate — Minimum Action Generator
  // ----------------------------------------------------------
  async generateMinimumAction(date: string, candidateTaskIds: string[] | undefined, userId: string) {
    // 候选任务：若用户提供 candidateTaskIds 则使用之；否则拉取当天/当前所有 pending tasks
    let candidates: Array<{ id: string; title: string; estimatedMinutes: number }>;

    if (candidateTaskIds && candidateTaskIds.length > 0) {
      // Prisma 8 ORM 没有 whereIn：逐个查询（MVP 候选数量小，可接受）
      const tasks: Array<{ id: string; stageId: string; title: string; status: string; estimatedMinutes: number }> = [];
      for (const tid of candidateTaskIds) {
        const t = await db.orm.public.Task.where((x) => x.id.eq(tid)).first();
        if (t) {
          tasks.push({
            id: t.id,
            stageId: t.stageId,
            title: t.title,
            status: t.status,
            estimatedMinutes: t.estimatedMinutes,
          });
        }
      }
      // 校验所有候选都属于该用户
      const userIds = new Set<string>();
      for (const t of tasks) {
        const stage = await db.orm.public.Stage
          .where((s) => s.id.eq(t.stageId))
          .first();
        if (!stage) continue;
        const goal = await db.orm.public.Goal
          .where((g) => g.id.eq(stage.goalId))
          .first();
        if (goal) userIds.add(goal.userId);
      }
      if (userIds.size === 1 && !userIds.has(userId)) {
        throw Errors.forbidden('候选 Task 不属于当前用户');
      }
      candidates = tasks
        .filter((t: { status: string }) => t.status === 'pending')
        .map((t: { id: string; title: string; estimatedMinutes: number }) => ({
          id: t.id,
          title: t.title,
          estimatedMinutes: t.estimatedMinutes,
        }));
    } else {
      candidates = [];
    }

    const input = {
      date,
      candidateTasks: candidates,
    };

    const output = await this.invokeAi<{ taskId: string; title: string; description: string | null; estimatedMinutes: number }>({
      promptId: 'minimum-action-generator',
      input,
      outputSchema: AiMinimumActionGenerateResponseSchema.omit({ aiLogId: true }),
      userId,
      // 业务校验：AI 返回的 taskId 必须来自候选（CLAUDE.md: 不得创建新 Task）
      postValidate: (out) => {
        const validIds = new Set(candidates.map((t) => t.id));
        if (!validIds.has(out.taskId)) {
          return `AI 返回的 taskId 不在候选列表中: ${out.taskId}`;
        }
      },
    });

    return {
      taskId: output.taskId,
      title: output.title,
      description: output.description,
      estimatedMinutes: output.estimatedMinutes,
      aiLogId: output.__aiLogId,
    };
  },

  // ============================================================
  // 通用 AI 调用流水线（CLAUDE.md 第 11 节）
  // ============================================================
  async invokeAi<TOutput>(
    ctx: {
      promptId: string;
      input: unknown;
      outputSchema: ZodTypeAny;
      userId: string;
      postValidate?: (output: TOutput, input: unknown) => void | string;
    },
  ): Promise<TOutput & { __aiLogId: string }> {
    const prompt: PromptConfig = getPrompt(ctx.promptId);
    const inputJson = JSON.stringify(ctx.input);

    // 尝试 + Retry 1 次
    const maxAttempts = 2;
    let lastError: unknown = null;
    let lastRawOutput: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // 3. 调用 OpenAI（mock）
        const rawOutput = await callOpenAI({ prompt, inputJson });
        lastRawOutput = rawOutput;

        // 4. JSON.parse
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawOutput);
        } catch (e) {
          lastError = e;
          continue; // 重试
        }

        // 5. Zod Schema Validation
        const result = ctx.outputSchema.safeParse(parsed);
        if (!result.success) {
          lastError = new Error(`Schema validation failed: ${JSON.stringify(result.error.issues)}`);
          continue;
        }

        // 6. 业务校验
        if (ctx.postValidate) {
          const errMsg = ctx.postValidate(result.data as TOutput, ctx.input);
          if (errMsg) {
            lastError = new Error(errMsg);
            continue;
          }
        }

        // 成功：写 ai_generation_logs(success)
        const logId = await this.writeLog({
          userId: ctx.userId,
          promptId: prompt.promptId,
          promptVersion: prompt.version,
          inputJson,
          outputJson: rawOutput,
          status: 'success',
          errorMessage: null,
        });

        return { ...(result.data as TOutput), __aiLogId: logId };
      } catch (e) {
        lastError = e;
        // 继续重试
      }
    }

    // 7. 全部失败：写 ai_generation_logs(failure) + 抛错
    await this.writeLog({
      userId: ctx.userId,
      promptId: prompt.promptId,
      promptVersion: prompt.version,
      inputJson,
      outputJson: lastRawOutput,
      status: 'failure',
      errorMessage: lastError instanceof Error ? lastError.message : String(lastError),
    });

    throw Errors.business(
      'AI_GENERATION_FAILED',
      'AI 生成失败，已重试 1 次仍未通过校验',
      {
        promptId: prompt.promptId,
        promptVersion: prompt.version,
        error: lastError instanceof Error ? lastError.message : String(lastError),
      },
    );
  },

  /** 写入 ai_generation_logs */
  async writeLog(params: {
    userId: string;
    promptId: string;
    promptVersion: string;
    inputJson: string;
    outputJson: string | null;
    status: 'success' | 'failure';
    errorMessage: string | null;
  }): Promise<string> {
    const id = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.orm.public.AiGenerationLog.create({
      id,
      userId: params.userId,
      promptId: params.promptId as any,
      promptVersion: params.promptVersion as any,
      inputJson: params.inputJson,
      outputJson: params.outputJson,
      status: params.status,
      errorMessage: params.errorMessage,
    } as any);
    return id;
  },
};
