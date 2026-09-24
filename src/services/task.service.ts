// src/services/task.service.ts
// Task 业务服务层：封装 Prisma 8 查询 + CLAUDE.md 第 8 节业务规则
//
// 状态机（数据库为状态来源，代码控制，不调用 AI）：
//   - Task 状态：pending ↔ completed（双向切换）
//   - pending → completed: 写 completedAt = now
//   - completed → pending: 清空 completedAt
//   - Task 属于 Stage（必填），可关联 LearningPath（可选）
//   - 当 Task 关联到 LearningPath 时，learningPathId 必须属于同一 Stage
//
// API 扩展（CONTRACT.md 之外的 4 个 CRUD + 已有 2 个动作 = 6 个端点）：
//   GET    /api/stages/:stageId/tasks             — 列出某 Stage 的 Tasks
//   POST   /api/stages/:stageId/tasks             — 创建 Task
//   GET    /api/learning-paths/:pathId/tasks      — 列出某 LearningPath 的 Tasks
//   PATCH  /api/tasks/:taskId                     — 更新 Task
//   DELETE /api/tasks/:taskId                      — 删除 Task
//   POST   /api/tasks/:taskId/complete             — 完成（CONTRACT.md #13）
//   POST   /api/tasks/:taskId/uncomplete           — 取消完成（CONTRACT.md #14）

import { db } from '../prisma/db';
import { Errors } from '../lib/response';

// ============================================================
// 输入类型
// ============================================================

export interface CreateTaskInput {
  stageId: string;
  learningPathId?: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  orderIndex: number;
}

export interface UpdateTaskInput {
  learningPathId?: string | null;
  title?: string;
  description?: string;
  estimatedMinutes?: number;
  orderIndex?: number;
}

// ============================================================
// Service
// ============================================================

export const taskService = {
  /** GET /api/stages/:stageId/tasks — 列出某 Stage 的 Tasks（按 orderIndex 升序） */
  async listByStage(stageId: string, userId: string) {
    await this.assertStageOwned(stageId, userId);
    const tasks = await db.orm.public.Task
      .where((t) => t.stageId.eq(stageId))
      .orderBy((t) => t.orderIndex.asc())
      .all();
    return tasks;
  },

  /** GET /api/learning-paths/:pathId/tasks — 列出某 LearningPath 的 Tasks（按 orderIndex 升序） */
  async listByLearningPath(pathId: string, userId: string) {
    await this.assertLearningPathOwned(pathId, userId);
    const tasks = await db.orm.public.Task
      .where((t) => t.learningPathId.eq(pathId))
      .orderBy((t) => t.orderIndex.asc())
      .all();
    return tasks;
  },

  /** POST /api/stages/:stageId/tasks — 创建 Task */
  async create(input: CreateTaskInput, userId: string) {
    await this.assertStageOwned(input.stageId, userId);

    // 若指定 learningPathId，校验属于同一 Stage
    if (input.learningPathId) {
      const pathId = input.learningPathId;
      const path = await db.orm.public.LearningPath
        .where((p) => p.id.eq(pathId))
        .first();
      if (!path) {
        throw Errors.notFound('LearningPath', pathId);
      }
      if (path.stageId !== input.stageId) {
        throw Errors.business(
          'TASK_PATH_STAGE_MISMATCH',
          'LearningPath 不属于该 Stage，无法关联',
          { stageId: input.stageId, learningPathId: pathId, pathStageId: path.stageId },
        );
      }
    }

    const id = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = await db.orm.public.Task.create({
      id,
      stageId: input.stageId,
      learningPathId: input.learningPathId ?? null,
      title: input.title as any, // VarChar<200> branded type
      description: input.description ?? null,
      estimatedMinutes: input.estimatedMinutes,
      orderIndex: input.orderIndex,
      status: 'pending',
    } as any);

    return task;
  },

  /** PATCH /api/tasks/:taskId — 更新 Task（不能改 stageId / status） */
  async update(taskId: string, userId: string, input: UpdateTaskInput) {
    const task = await this.assertTaskOwned(taskId, userId);

    // 若改 learningPathId，校验属于同一 Stage
    if (input.learningPathId !== undefined && input.learningPathId !== null) {
      const path = await db.orm.public.LearningPath
        .where((p) => p.id.eq(input.learningPathId as string))
        .first();
      if (!path) {
        throw Errors.notFound('LearningPath', input.learningPathId as string);
      }
      if (path.stageId !== task.stageId) {
        throw Errors.business(
          'TASK_PATH_STAGE_MISMATCH',
          'LearningPath 不属于该 Stage，无法关联',
          { stageId: task.stageId, learningPathId: input.learningPathId },
        );
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (input.learningPathId !== undefined) updateData.learningPathId = input.learningPathId;
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.estimatedMinutes !== undefined) updateData.estimatedMinutes = input.estimatedMinutes;
    if (input.orderIndex !== undefined) updateData.orderIndex = input.orderIndex;

    const updated = await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .update(updateData);
    return updated;
  },

  /** DELETE /api/tasks/:taskId — 删除 Task */
  async remove(taskId: string, userId: string) {
    await this.assertTaskOwned(taskId, userId);
    await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .delete();
  },

  /**
   * POST /api/tasks/:taskId/complete — 完成 Task（状态机）
   * pending → completed，写 completedAt = now
   */
  async complete(taskId: string, userId: string) {
    const task = await this.assertTaskOwned(taskId, userId);

    if (task.status === 'completed') {
      throw Errors.business('TASK_ALREADY_COMPLETED', 'Task 已完成', {
        taskId, status: task.status,
      });
    }
    if (task.status !== 'pending') {
      throw Errors.business(
        'TASK_NOT_PENDING',
        'Only pending Task can be completed',
        { taskId, status: task.status },
      );
    }

    const now = new Date().toISOString();
    await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .update({ status: 'completed', completedAt: now });

    const updated = await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .first();
    return updated;
  },

  /**
   * POST /api/tasks/:taskId/uncomplete — 取消完成（状态机）
   * completed → pending，清空 completedAt
   *
   * 注意 CLAUDE.md 第 4 节：最小动作完成后不自动生成第二个（不在此接口处理）
   */
  async uncomplete(taskId: string, userId: string) {
    const task = await this.assertTaskOwned(taskId, userId);

    if (task.status === 'pending') {
      throw Errors.business('TASK_ALREADY_PENDING', 'Task 已是 pending 状态', {
        taskId, status: task.status,
      });
    }
    if (task.status !== 'completed') {
      throw Errors.business(
        'TASK_NOT_COMPLETED',
        'Only completed Task can be uncompleted',
        { taskId, status: task.status },
      );
    }

    await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .update({ status: 'pending', completedAt: null });

    const updated = await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .first();
    return updated;
  },

  // ============================================================
  // 内部 helper
  // ============================================================

  /** 校验 Stage 属于当前用户（通过 Goal 关联反查） */
  async assertStageOwned(stageId: string, userId: string) {
    const stage = await db.orm.public.Stage
      .where((s) => s.id.eq(stageId))
      .first();
    if (!stage) {
      throw Errors.notFound('Stage', stageId);
    }
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

  /** 校验 LearningPath 属于当前用户（通过 Stage → Goal 反查） */
  async assertLearningPathOwned(pathId: string, userId: string) {
    const path = await db.orm.public.LearningPath
      .where((p) => p.id.eq(pathId))
      .first();
    if (!path) {
      throw Errors.notFound('LearningPath', pathId);
    }
    const stage = await db.orm.public.Stage
      .where((s) => s.id.eq(path.stageId))
      .first();
    if (!stage) {
      throw Errors.notFound('LearningPath', pathId);
    }
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(stage.goalId))
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.neq('deleted'))
      .first();
    if (!goal) {
      throw Errors.notFound('LearningPath', pathId);
    }
    return path;
  },

  /** 校验 Task 属于当前用户（通过 Stage → Goal 反查） */
  async assertTaskOwned(taskId: string, userId: string) {
    const task = await db.orm.public.Task
      .where((t) => t.id.eq(taskId))
      .first();
    if (!task) {
      throw Errors.notFound('Task', taskId);
    }
    const stage = await db.orm.public.Stage
      .where((s) => s.id.eq(task.stageId))
      .first();
    if (!stage) {
      throw Errors.notFound('Task', taskId);
    }
    const goal = await db.orm.public.Goal
      .where((g) => g.id.eq(stage.goalId))
      .where((g) => g.userId.eq(userId))
      .where((g) => g.status.neq('deleted'))
      .first();
    if (!goal) {
      throw Errors.notFound('Task', taskId);
    }
    return task;
  },
};
