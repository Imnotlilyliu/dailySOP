// src/services/stage.service.ts
// Stage 业务服务层：封装 Prisma 8 查询 + CLAUDE.md 第 13 节状态机
// 状态机规则（数据库为状态来源，代码控制，不调用 AI）：
//   - 同一 Goal 同时只能有 1 个 in_progress Stage
//   - 创建 Stage 默认 not_started
//   - 第一个被推进的 not_started → in_progress 时，写入 goal.current_stage_id
//   - in_progress → completed（POST /complete）
//   - 完成 Stage 后：自动推进下一 Stage 为 in_progress，更新 goal.current_stage_id
//   - 最后一个 Stage 完成 → Goal.status=completed, goal.completed_at=now
//   - in_progress Stage 不可删除

import { db } from '../prisma/db';
import { Errors } from '../lib/response';

// ============================================================
// 输入类型
// ============================================================

export interface CreateStageInput {
  goalId: string;
  name: string;
  description?: string;
  orderIndex: number;
  durationDays?: number;
  startDate?: string;
  endDate?: string;
}

export interface UpdateStageInput {
  name?: string;
  description?: string;
  orderIndex?: number;
  durationDays?: number;
  startDate?: string;
  endDate?: string;
}

// ============================================================
// Service
// ============================================================

export const stageService = {
  /** GET /api/goals/:goalId/stages — 列出某 Goal 的 Stages（按 orderIndex 升序） */
  async list(goalId: string, userId: string) {
    await this.assertGoalOwned(goalId, userId);
    const stages = await db.orm.public.Stage
      .where((s) => s.goalId.eq(goalId))
      .orderBy((s) => s.orderIndex.asc())
      .all();
    return stages;
  },

  /** POST /api/goals/:goalId/stages — 创建 Stage */
  async create(input: CreateStageInput, userId: string) {
    const goal = await this.assertGoalOwned(input.goalId, userId);

    // 业务规则：completed/deleted Goal 不允许新增 Stage
    if (goal.status === 'completed') {
      throw Errors.business('GOAL_COMPLETED', '已完成的 Goal 不能新增 Stage', {
        goalId: input.goalId, status: goal.status,
      });
    }
    if (goal.status === 'deleted') {
      throw Errors.business('GOAL_DELETED', '已删除的 Goal 不能新增 Stage', {
        goalId: input.goalId, status: goal.status,
      });
    }

    // 业务规则：同一 Goal 同时只能有 1 个 in_progress Stage
    // 新建默认 not_started；除非这是 Goal 的第一个 Stage —— 此时自动设为 in_progress
    // 并写入 goal.current_stage_id（CLAUDE.md 第 13 节：创建 Goal → 多个 Stage → 选择/确定当前 Stage）
    const existing = await db.orm.public.Stage
      .where((s) => s.goalId.eq(input.goalId))
      .all();
    const isFirstStage = existing.length === 0;

    const id = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stage = await db.orm.public.Stage.create({
      id,
      name: input.name as any, // VarChar<100> branded type
      description: input.description ?? null,
      orderIndex: input.orderIndex,
      durationDays: input.durationDays ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: isFirstStage ? 'in_progress' : 'not_started',
      goalId: input.goalId,
    } as any);

    // 第一个 Stage 创建后，更新 Goal.current_stage_id
    if (isFirstStage) {
      await db.orm.public.Goal
        .where((g) => g.id.eq(input.goalId))
        .update({ currentStageId: id });
    }

    return stage;
  },

  /** PATCH /api/stages/:stageId — 更新 Stage（不能改 status / goalId） */
  async update(stageId: string, userId: string, input: UpdateStageInput) {
    const stage = await this.assertStageOwned(stageId, userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.orderIndex !== undefined) updateData.orderIndex = input.orderIndex;
    if (input.durationDays !== undefined) updateData.durationDays = input.durationDays;
    if (input.startDate !== undefined) updateData.startDate = input.startDate;
    if (input.endDate !== undefined) updateData.endDate = input.endDate;

    const updated = await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .update(updateData);
    return updated;
  },

  /** DELETE /api/stages/:stageId — 删除 Stage（软删除语义：直接物理删除，但 in_progress 不可删） */
  async remove(stageId: string, userId: string) {
    const stage = await this.assertStageOwned(stageId, userId);
    if (stage.status === 'in_progress') {
      throw Errors.business(
        'STAGE_IN_PROGRESS',
        'in_progress 状态的 Stage 不可删除',
        { stageId, status: stage.status },
      );
    }

    // Prisma schema 中 Stage.onDelete: Cascade 由 DB 处理关联数据
    // 这里使用 ORM 删除（直接物理删除，因 schema 未定义软删除字段）
    await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .delete();
  },

  /**
   * POST /api/stages/:stageId/complete — 完成 Stage（状态机核心）
   *
   * 流程：
   *   1. 校验 Stage 属于当前用户且 status=in_progress
   *   2. Stage.status → completed, completedAt = now
   *   3. 查找下一 not_started Stage（按 orderIndex 升序）
   *   4. 若存在下一 Stage：
   *        - 下一 Stage.status → in_progress
   *        - 更新 goal.current_stage_id = 下一 Stage.id
   *        - goalCompleted = false
   *      若不存在（即此 Stage 为最后一个）：
   *        - Goal.status → completed
   *        - Goal.completedAt = now
   *        - goalCompleted = true
   */
  async complete(stageId: string, userId: string) {
    const stage = await this.assertStageOwned(stageId, userId);

    if (stage.status === 'completed') {
      throw Errors.business('STAGE_ALREADY_COMPLETED', 'Stage 已完成', {
        stageId, status: stage.status,
      });
    }
    if (stage.status !== 'in_progress') {
      throw Errors.business(
        'STAGE_NOT_IN_PROGRESS',
        'Only in_progress Stage can be completed',
        { stageId, status: stage.status },
      );
    }

    const now = new Date().toISOString();

    // 1) 当前 Stage → completed
    await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .update({ status: 'completed', completedAt: now });

    // 2) 查找下一 not_started Stage（按 orderIndex 升序，取第一个）
    const nextStages = await db.orm.public.Stage
      .where((s) => s.goalId.eq(stage.goalId))
      .where((s) => s.status.eq('not_started'))
      .orderBy((s) => s.orderIndex.asc())
      .all();
    const nextStage = nextStages[0] ?? null;

    let goalCompleted = false;

    if (nextStage) {
      // 3a) 推进下一 Stage → in_progress，并更新 goal.current_stage_id
      await db.orm.public.Stage
        .where((s) => s.id.eq(nextStage.id))
        .update({ status: 'in_progress' });
      await db.orm.public.Goal
        .where((g) => g.id.eq(stage.goalId))
        .update({ currentStageId: nextStage.id });
    } else {
      // 3b) 最后一个 Stage 完成 → Goal → completed
      await db.orm.public.Goal
        .where((g) => g.id.eq(stage.goalId))
        .update({ status: 'completed', completedAt: now });
      goalCompleted = true;
    }

    // 重新读取最新状态返回
    const completedStage = await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .first();
    const refreshedNext = nextStage
      ? await db.orm.public.Stage.where((s) => s.id.eq(nextStage.id)).first()
      : null;

    return {
      stage: completedStage,
      nextStage: refreshedNext,
      goalCompleted,
    };
  },

  // ============================================================
  // 内部 helper
  // ============================================================

  /** 校验 Goal 属于当前用户 */
  async assertGoalOwned(goalId: string, userId: string) {
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

  /** 校验 Stage 属于当前用户（通过 Goal 关联） */
  async assertStageOwned(stageId: string, userId: string) {
    const stage = await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .first();
    if (!stage) {
      throw Errors.notFound('Stage', stageId);
    }
    // 通过 goalId 反查 Goal，校验属于当前用户且未删除
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(stage.goalId))
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.neq('deleted'))
      .first();
    if (!goal) {
      throw Errors.notFound('Stage', stageId);
    }
    return stage;
  },
};
