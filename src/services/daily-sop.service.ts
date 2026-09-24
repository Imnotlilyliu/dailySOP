// src/services/daily-sop.service.ts
// DailySop 业务服务层：封装 Prisma 8 查询 + CLAUDE.md 第 4 节业务规则
//
// 业务规则（CLAUDE.md 第 4 节）：
//   - 每个 Goal 同一天只能有一个 Daily Sop（数据库 @@unique 保证）
//   - DailySop.completed 不等于 MinimumAction.completed
//   - DailySop 属于 (userId, goalId, stageId, date) 四元组
//
// API 端点（CONTRACT.md #15-#17 + 扩展 CRUD）：
//   GET    /api/today                              — 聚合今日数据（所有 active goal 的 sop + tasks + 全局最小动作）
//   GET    /api/goals/:goalId/daily-sops/:date      — 获取某日 sop
//   POST   /api/goals/:goalId/daily-sops            — 创建某日 sop
//   POST   /api/daily-sops/:sopId/complete           — 完成 sop
//   POST   /api/daily-sops/:sopId/uncomplete         — 取消完成

import { db } from '../prisma/db';
import { Errors } from '../lib/response';
import { MAX_DAILY_SOP_PER_GOAL_PER_DAY } from '../types/api';

// ============================================================
// 输入类型
// ============================================================

export interface CreateDailySopInput {
  goalId: string;
  date: string; // YYYY-MM-DD
  stageId: string;
}

// ============================================================
// Helpers
// ============================================================

/** 生成 UUID v4（无外部依赖） */
function uuid(): string {
  // crypto.randomUUID 在 Node 19+ 可用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** 当前 ISO 时间戳 */
function now(): string {
  return new Date().toISOString();
}

// ============================================================
// Service
// ============================================================

export const dailySopService = {
  /**
   * GET /api/today — 聚合今日数据
   * 返回当前用户所有 active goal 的今日 sop、相关 tasks、全局最小动作。
   * 如果某 goal 的今日 sop 不存在，返回 null（前端可选择创建）。
   */
  async getToday(userId: string, date: string) {
    // 1. 拉取所有 active goals
    const goals = await db.orm.public.Goal
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.eq('active'))
      .orderBy((g) => g.createdAt.asc())
      .all();

    // 2. 拉取每个 goal 的今日 sop（含 dailySopTasks.task + minimumActions.task）
    const sops = await Promise.all(
      goals.map(async (goal) => {
        const sop = await db.orm.public.DailySop
          .where((s) => s.userId.eq(userId))
          .where((s) => s.goalId.eq(goal.id))
          .where((s) => s.date.eq(date))
          .first();
        if (!sop) return { goalId: goal.id, sop: null };
        // 拉取关联的 daily_sop_tasks + minimum_actions（含 task 详情）
        const dailySopTasks = await db.orm.public.DailySopTask
          .where((dst) => dst.dailySopId.eq(sop.id))
          .orderBy((dst) => dst.orderIndex.asc())
          .all();
        const minimumActions = await db.orm.public.MinimumAction
          .where((ma) => ma.dailySopId.eq(sop.id))
          .all();
        return { goalId: goal.id, sop: { ...sop, dailySopTasks, minimumActions } };
      }),
    );

    // 3. 拉取今日全局最小动作（user 全局唯一）
    const dailyMinimumAction = await db.orm.public.DailyMinimumAction
      .where((dma) => dma.userId.eq(userId))
      .where((dma) => dma.date.eq(date))
      .first();
    let globalMinimumAction = null;
    if (dailyMinimumAction) {
      const ma = await db.orm.public.MinimumAction
        .where((m) => m.id.eq(dailyMinimumAction.minimumActionId))
        .first();
      globalMinimumAction = ma
        ? { ...ma, dailyMinimumActionId: dailyMinimumAction.id }
        : null;
    }

    return {
      date,
      goals: goals.map((g) => ({ id: g.id, title: g.title, status: g.status })),
      sops,
      globalMinimumAction,
    };
  },

  /**
   * GET /api/goals/:goalId/daily-sops/:date — 获取某日 sop
   */
  async getByDate(goalId: string, date: string, userId: string) {
    await this.assertGoalOwned(goalId, userId);
    const sop = await db.orm.public.DailySop
      .where((s) => s.goalId.eq(goalId))
      .where((s) => s.date.eq(date))
      .where((s) => s.userId.eq(userId))
      .first();
    if (!sop) {
      throw Errors.notFound('DailySop', `${goalId}/${date}`);
    }
    // 拉取关联数据
    const dailySopTasks = await db.orm.public.DailySopTask
      .where((dst) => dst.dailySopId.eq(sop.id))
      .orderBy((dst) => dst.orderIndex.asc())
      .all();
    const minimumActions = await db.orm.public.MinimumAction
      .where((ma) => ma.dailySopId.eq(sop.id))
      .all();
    return { ...sop, dailySopTasks, minimumActions };
  },

  /**
   * POST /api/goals/:goalId/daily-sops — 创建某日 sop
   * CLAUDE.md: 同 (userId, goalId, date) 只能有一个 sop
   */
  async create(input: CreateDailySopInput, userId: string) {
    const { goalId, date, stageId } = input;
    await this.assertGoalOwned(goalId, userId);
    await this.assertStageOfGoal(stageId, goalId);

    // 检查是否已存在
    const existing = await db.orm.public.DailySop
      .where((s) => s.goalId.eq(goalId))
      .where((s) => s.date.eq(date))
      .where((s) => s.userId.eq(userId))
      .first();
    if (existing) {
      throw Errors.business(
        'DAILY_SOP_ALREADY_EXISTS',
        `Goal ${goalId} 在 ${date} 已有 DailySop`,
        { goalId, date, existingSopId: existing.id },
      );
    }

    const id = uuid();
    const ts = now();
    await db.orm.public.DailySop.create({
      id,
      goalId,
      stageId,
      date,
      status: 'pending',
      userId,
      createdAt: ts,
      updatedAt: ts,
      completedAt: null,
    });

    const sop = await db.orm.public.DailySop
      .where((s) => s.id.eq(id))
      .first();
    return sop;
  },

  /**
   * POST /api/daily-sops/:sopId/complete — 完成 sop
   * CLAUDE.md: DailySop.completed 不等于 MinimumAction.completed（独立状态机）
   */
  async complete(sopId: string, userId: string) {
    const sop = await this.assertOwned(sopId, userId);
    if (sop.status === 'completed') {
      throw Errors.business('SOP_ALREADY_COMPLETED', 'DailySop 已完成', { sopId });
    }
    const ts = now();
    await db.orm.public.DailySop
      .where((s) => s.id.eq(sopId))
      .update({ status: 'completed', completedAt: ts, updatedAt: ts });
    return await db.orm.public.DailySop.where((s) => s.id.eq(sopId)).first();
  },

  /** POST /api/daily-sops/:sopId/uncomplete — 取消完成 */
  async uncomplete(sopId: string, userId: string) {
    const sop = await this.assertOwned(sopId, userId);
    if (sop.status === 'pending') {
      throw Errors.business('SOP_ALREADY_PENDING', 'DailySop 已是 pending', { sopId });
    }
    const ts = now();
    await db.orm.public.DailySop
      .where((s) => s.id.eq(sopId))
      .update({ status: 'pending', completedAt: null, updatedAt: ts });
    return await db.orm.public.DailySop.where((s) => s.id.eq(sopId)).first();
  },

  // ============================================================
  // 内部 helper
  // ============================================================

  async assertGoalOwned(goalId: string, userId: string) {
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(goalId))
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.neq('deleted'))
      .first();
    if (!goal) throw Errors.notFound('Goal', goalId);
    return goal;
  },

  async assertStageOfGoal(stageId: string, goalId: string) {
    const stage = await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .where((s) => s.goalId.eq(goalId))
      .first();
    if (!stage) {
      throw Errors.business('STAGE_NOT_OF_GOAL', 'Stage 不属于该 Goal', { stageId, goalId });
    }
    return stage;
  },

  async assertOwned(sopId: string, userId: string) {
    const sop = await db.orm.public.DailySop
      .where((s) => s.id.eq(sopId))
      .where((s) => s.userId.eq(userId))
      .first();
    if (!sop) throw Errors.notFound('DailySop', sopId);
    return sop;
  },
};

// 防止 unused 警告
void MAX_DAILY_SOP_PER_GOAL_PER_DAY;
