// src/services/goal.service.ts
// Goal 业务服务层：封装 Prisma 8 查询 + CLAUDE.md 第 4 节业务规则
// 数据库是真实状态来源；不调用 AI。

import { db } from '../prisma/db';
import { MAX_ACTIVE_GOALS } from '../types/api';
import { Errors, type ApiError } from '../lib/response';

// ============================================================
// 输入类型
// ============================================================

export interface ListGoalsInput {
  userId: string;
  status?: 'active' | 'paused' | 'completed' | 'deleted';
}

export interface CreateGoalInput {
  userId: string;
  title: string;
  description?: string;
  expectedOutcome?: string;
  startDate?: string;
  targetDate?: string;
}

export interface UpdateGoalInput {
  title?: string;
  description?: string;
  expectedOutcome?: string;
  startDate?: string;
  targetDate?: string;
  currentStageId?: string | null;
}

// ============================================================
// Service
// ============================================================

export const goalService = {
  /** GET /api/goals — 列出当前用户的目标（默认仅 active，不含 deleted） */
  async list({ userId, status }: ListGoalsInput) {
    const filterStatus = status ?? 'active';
    const goals = await db.orm.public.Goal
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.eq(filterStatus))
      .orderBy((g) => g.createdAt.desc())
      .all();
    return goals;
  },

  /** 统计当前用户 active goals 数量 */
  async countActive(userId: string): Promise<number> {
    const goals = await db.orm.public.Goal
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.eq('active'))
      .all();
    return goals.length;
  },

  /** POST /api/goals — 创建 Goal */
  async create(input: CreateGoalInput) {
    const activeCount = await this.countActive(input.userId);
    if (activeCount >= MAX_ACTIVE_GOALS) {
      throw Errors.business(
        'MAX_ACTIVE_GOALS',
        `已有 ${activeCount} 个 active goal，上限 ${MAX_ACTIVE_GOALS}`,
        { currentActive: activeCount, max: MAX_ACTIVE_GOALS },
      );
    }

    const id = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const goal = await db.orm.public.Goal.create({
      id,
      title: input.title as any, // Varchar<100> branded type
      description: input.description ?? null,
      expectedOutcome: input.expectedOutcome ?? null,
      status: 'active',
      startDate: input.startDate ?? null,
      targetDate: input.targetDate ?? null,
      currentStageId: null,
      userId: input.userId,
    } as any);
    return goal;
  },

  /** GET /api/goals/:goalId — 详情 */
  async getDetail(goalId: string, userId: string) {
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .where((g) => g.userId.eq(userId))
      .first();

    if (!goal) {
      throw Errors.notFound('Goal', goalId);
    }

    // stages count via separate query
    const stages = await db.orm.public.Stage
      .where((s) => s.goalId.eq(goalId))
      .all();

    let currentStage = null;
    if (goal.currentStageId) {
      currentStage = await db.orm.public.Stage
        .where((s) => s.id.eq(goal.currentStageId!))
        .first();
    }

    return {
      goal,
      currentStage,
      stagesCount: stages.length,
    };
  },

  /** PATCH /api/goals/:goalId — 更新 */
  async update(goalId: string, userId: string, input: UpdateGoalInput) {
    await this.getOwnedActiveOrPaused(goalId, userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.expectedOutcome !== undefined) updateData.expectedOutcome = input.expectedOutcome;
    if (input.startDate !== undefined) updateData.startDate = input.startDate;
    if (input.targetDate !== undefined) updateData.targetDate = input.targetDate;
    if (input.currentStageId !== undefined) updateData.currentStageId = input.currentStageId;

    const updated = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .update(updateData);
    return updated;
  },

  /** DELETE /api/goals/:goalId — 软删除 */
  async softDelete(goalId: string, userId: string) {
    await this.getOwnedActiveOrPaused(goalId, userId);
    const now = new Date().toISOString();
    await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .update({ status: 'deleted', deletedAt: now });
  },

  /** POST /api/goals/:goalId/pause — 暂停 */
  async pause(goalId: string, userId: string) {
    const existing = await this.getOwnedActiveOrPaused(goalId, userId);
    if (existing.status === 'paused') {
      throw Errors.business('GOAL_ALREADY_PAUSED', 'Goal 已处于暂停状态', {
        goalId, status: existing.status,
      });
    }
    if (existing.status !== 'active') {
      throw Errors.business('GOAL_NOT_ACTIVE', '只有 active 状态的 Goal 可以暂停', {
        goalId, status: existing.status,
      });
    }
    const updated = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .update({ status: 'paused' });
    return updated;
  },

  /** POST /api/goals/:goalId/resume — 恢复（检查 active < 3） */
  async resume(goalId: string, userId: string) {
    const existing = await this.getOwnedActiveOrPaused(goalId, userId);
    if (existing.status !== 'paused') {
      throw Errors.business('GOAL_NOT_PAUSED', '只有 paused 状态的 Goal 可以恢复', {
        goalId, status: existing.status,
      });
    }

    const activeCount = await this.countActive(userId);
    if (activeCount >= MAX_ACTIVE_GOALS) {
      throw Errors.business(
        'MAX_ACTIVE_GOALS',
        `当前已有 ${activeCount} 个 active goal，无法恢复（上限 ${MAX_ACTIVE_GOALS}）`,
        { currentActive: activeCount, max: MAX_ACTIVE_GOALS },
      );
    }

    const updated = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .update({ status: 'active' });
    return updated;
  },

  /** 获取属于当前用户且未软删除的 Goal */
  async getOwnedActiveOrPaused(goalId: string, userId: string) {
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.neq('deleted'))
      .first();

    if (!goal) {
      throw Errors.notFound('Goal', goalId);
    }
    return goal;
  },
};

export type GoalServiceError = ApiError;
