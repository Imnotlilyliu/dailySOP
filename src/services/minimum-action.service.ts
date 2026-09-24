// src/services/minimum-action.service.ts
// MinimumAction + DailyMinimumAction 业务服务层
//
// 业务规则（CLAUDE.md 第 4 节）：
//   - 每个 DailySop 只能有一个 MinimumAction（DB @@unique）
//   - 每个用户每天只有 1 个全局最小动作（DailyMinimumAction DB @@unique）
//   - MinimumAction 必须来自当天已有 Task（taskId 必须属于该 sop 关联的 stage）
//   - MinimumAction 不得创建新 Task
//   - 最小动作完成后不自动生成第二个
//   - MinimumAction.completed 不等于 DailySop.completed

import { db } from '../prisma/db';
import { Errors } from '../lib/response';

// ============================================================
// 输入类型
// ============================================================

export interface CreateMinimumActionInput {
  dailySopId: string;
  taskId: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
}

export interface SetGlobalMinimumActionInput {
  date: string; // YYYY-MM-DD
  minimumActionId: string;
}

// ============================================================
// Helpers
// ============================================================

function uuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function now(): string {
  return new Date().toISOString();
}

// ============================================================
// Service
// ============================================================

export const minimumActionService = {
  /**
   * GET /api/daily-sops/:sopId/minimum-action — 获取 sop 的最小动作
   */
  async getBySop(sopId: string, userId: string) {
    await this.assertSopOwned(sopId, userId);
    const ma = await db.orm.public.MinimumAction
      .where((m) => m.dailySopId.eq(sopId))
      .first();
    return ma;
  },

  /**
   * POST /api/daily-sops/:sopId/minimum-action — 保存用户确认的最小动作
   * CLAUDE.md: 必须来自当天已有 Task，不得创建新 Task
   * 业务规则：
   *   - sop 已有 minimum action → 返回 CONFLICT
   *   - taskId 必须属于该 sop 的 stage
   *   - task 必须是 pending（不能选已完成的）
   */
  async create(input: CreateMinimumActionInput, userId: string) {
    const { dailySopId, taskId, title, description, estimatedMinutes } = input;
    const sop = await this.assertSopOwned(dailySopId, userId);

    // 校验：sop 已有 minimum action → 冲突
    const existing = await db.orm.public.MinimumAction
      .where((m) => m.dailySopId.eq(dailySopId))
      .first();
    if (existing) {
      throw Errors.business(
        'MINIMUM_ACTION_ALREADY_EXISTS',
        '该 DailySop 已有 MinimumAction（每 sop 限 1 个）',
        { dailySopId, existingId: existing.id },
      );
    }

    // 校验：task 必须属于该 sop 的 stage
    const task = await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .first();
    if (!task) {
      throw Errors.notFound('Task', taskId);
    }
    if (task.stageId !== sop.stageId) {
      throw Errors.business(
        'TASK_NOT_OF_SOP_STAGE',
        'Task 不属于该 sop 关联的 Stage',
        { taskId, taskStageId: task.stageId, sopStageId: sop.stageId },
      );
    }
    if (task.status === 'completed') {
      throw Errors.business(
        'TASK_ALREADY_COMPLETED',
        '不能选择已完成的 Task 作为最小动作',
        { taskId, status: task.status },
      );
    }

    const id = uuid();
    const ts = now();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.orm.public.MinimumAction.create({
      id,
      dailySopId,
      taskId,
      title: title as any, // VarChar<200> branded type
      description: description ?? null,
      estimatedMinutes,
      completedAt: null,
      createdAt: ts,
      updatedAt: ts,
    } as any);

    return await db.orm.public.MinimumAction.where((m) => m.id.eq(id)).first();
  },

  /**
   * DELETE /api/daily-sops/:sopId/minimum-action — 删除最小动作（用户改主意）
   * 仅在未完成时允许删除
   */
  async deleteBySop(sopId: string, userId: string) {
    await this.assertSopOwned(sopId, userId);
    const ma = await db.orm.public.MinimumAction
      .where((m) => m.dailySopId.eq(sopId))
      .first();
    if (!ma) {
      throw Errors.notFound('MinimumAction', `sop:${sopId}`);
    }
    if (ma.completedAt) {
      throw Errors.business(
        'MINIMUM_ACTION_COMPLETED',
        '已完成的最小动作不能删除',
        { minimumActionId: ma.id },
      );
    }
    // 同步删除引用（如果有）DailyMinimumAction
    const refs = await db.orm.public.DailyMinimumAction
      .where((d) => d.minimumActionId.eq(ma.id))
      .all();
    for (const ref of refs) {
      await db.orm.public.DailyMinimumAction.where((d) => d.id.eq(ref.id)).delete();
    }
    await db.orm.public.MinimumAction.where((m) => m.id.eq(ma.id)).delete();
    return null;
  },

  /**
   * POST /api/minimum-actions/:actionId/complete — 完成最小动作
   * CLAUDE.md: 最小动作完成后不自动生成第二个
   * 注意：MinimumAction.completed 不等于 DailySop.completed（独立状态机）
   *   - 同时把关联 Task 也置为 completed（业务上"做完了最小动作"=该 task 完成）
   */
  async complete(actionId: string, userId: string) {
    const ma = await this.assertOwned(actionId, userId);
    if (ma.completedAt) {
      throw Errors.business('MINIMUM_ACTION_ALREADY_COMPLETED', 'MinimumAction 已完成', { actionId });
    }
    const ts = now();
    await db.orm.public.MinimumAction
      .where((m) => m.id.eq(actionId))
      .update({ completedAt: ts, updatedAt: ts });

    // 同步完成关联 Task
    const task = await db.orm.public.Task
      .where((t) => t.id.eq(ma.taskId))
      .first();
    if (task && task.status === 'pending') {
      await db.orm.public.Task
        .where((t) => t.id.eq(task.id))
        .update({ status: 'completed', completedAt: ts });
    }

    return await db.orm.public.MinimumAction.where((m) => m.id.eq(actionId)).first();
  },

  /** POST /api/minimum-actions/:actionId/uncomplete — 取消完成 */
  async uncomplete(actionId: string, userId: string) {
    const ma = await this.assertOwned(actionId, userId);
    if (!ma.completedAt) {
      throw Errors.business('MINIMUM_ACTION_NOT_COMPLETED', 'MinimumAction 未完成', { actionId });
    }
    const ts = now();
    await db.orm.public.MinimumAction
      .where((m) => m.id.eq(actionId))
      .update({ completedAt: null, updatedAt: ts });

    // 同步取消关联 Task（仅当 Task 当前是 completed）
    const task = await db.orm.public.Task
      .where((t) => t.id.eq(ma.taskId))
      .first();
    if (task && task.status === 'completed') {
      await db.orm.public.Task
        .where((t) => t.id.eq(task.id))
        .update({ status: 'pending', completedAt: null });
    }

    return await db.orm.public.MinimumAction.where((m) => m.id.eq(actionId)).first();
  },

  // ============================================================
  // 全局每日最小动作（DailyMinimumAction）
  // ============================================================

  /**
   * GET /api/daily-minimum-actions/:date — 获取今日全局最小动作
   */
  async getGlobal(date: string, userId: string) {
    const dma = await db.orm.public.DailyMinimumAction
      .where((d) => d.userId.eq(userId))
      .where((d) => d.date.eq(date))
      .first();
    if (!dma) return null;
    const ma = await db.orm.public.MinimumAction
      .where((m) => m.id.eq(dma.minimumActionId))
      .first();
    return ma ? { ...ma, dailyMinimumActionId: dma.id } : null;
  },

  /**
   * POST /api/daily-minimum-actions — 设置今日全局最小动作
   * CLAUDE.md: 每个用户每天只有 1 个全局最小动作（DB @@unique 保证）
   * 业务规则：
   *   - minimumActionId 必须属于当前用户的某 sop（同日）
   *   - 如果已存在，返回 CONFLICT
   */
  async setGlobal(input: SetGlobalMinimumActionInput, userId: string) {
    const { date, minimumActionId } = input;
    // 校验 minimum action 存在且属于当前用户
    const ma = await db.orm.public.MinimumAction
      .where((m) => m.id.eq(minimumActionId))
      .first();
    if (!ma) {
      throw Errors.notFound('MinimumAction', minimumActionId);
    }
    const sop = await db.orm.public.DailySop
      .where((s) => s.id.eq(ma.dailySopId))
      .where((s) => s.userId.eq(userId))
      .first();
    if (!sop) {
      throw Errors.business(
        'MINIMUM_ACTION_NOT_OWNED',
        'MinimumAction 不属于当前用户',
        { minimumActionId },
      );
    }
    if (sop.date !== date) {
      throw Errors.business(
        'MINIMUM_ACTION_DATE_MISMATCH',
        'MinimumAction 的 sop 日期与请求日期不一致',
        { minimumActionId, sopDate: sop.date, requestDate: date },
      );
    }

    // 已存在 → 冲突
    const existing = await db.orm.public.DailyMinimumAction
      .where((d) => d.userId.eq(userId))
      .where((d) => d.date.eq(date))
      .first();
    if (existing) {
      throw Errors.business(
        'DAILY_MINIMUM_ACTION_ALREADY_EXISTS',
        `用户在 ${date} 已设置全局最小动作`,
        { date, existingId: existing.id },
      );
    }

    const id = uuid();
    const ts = now();
    await db.orm.public.DailyMinimumAction.create({
      id,
      userId,
      date,
      minimumActionId,
      createdAt: ts,
      updatedAt: ts,
    });

    const dma = await db.orm.public.DailyMinimumAction
      .where((d) => d.id.eq(id))
      .first();
    return dma;
  },

  /** DELETE /api/daily-minimum-actions/:date — 清除今日全局最小动作 */
  async clearGlobal(date: string, userId: string) {
    const dma = await db.orm.public.DailyMinimumAction
      .where((d) => d.userId.eq(userId))
      .where((d) => d.date.eq(date))
      .first();
    if (!dma) return null;
    await db.orm.public.DailyMinimumAction.where((d) => d.id.eq(dma.id)).delete();
    return null;
  },

  // ============================================================
  // 内部 helper
  // ============================================================

  async assertSopOwned(sopId: string, userId: string) {
    const sop = await db.orm.public.DailySop
      .where((s) => s.id.eq(sopId))
      .where((s) => s.userId.eq(userId))
      .first();
    if (!sop) throw Errors.notFound('DailySop', sopId);
    return sop;
  },

  async assertOwned(actionId: string, userId: string) {
    const ma = await db.orm.public.MinimumAction
      .where((m) => m.id.eq(actionId))
      .first();
    if (!ma) throw Errors.notFound('MinimumAction', actionId);
    // 通过 sop 反查 userId
    const sop = await db.orm.public.DailySop
      .where((s) => s.id.eq(ma.dailySopId))
      .where((s) => s.userId.eq(userId))
      .first();
    if (!sop) throw Errors.notFound('MinimumAction', actionId);
    return ma;
  },
};
