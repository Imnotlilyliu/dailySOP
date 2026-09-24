// src/services/learningPath.service.ts
// LearningPath 业务服务层：封装 Prisma 8 查询 + CLAUDE.md 第 8 节业务规则
//
// 业务规则（数据库为状态来源，代码控制，不调用 AI）：
//   - LearningPath 属于 Stage（不是 Goal）
//   - 手动创建时 source_type = 'user'；AI 生成时 source_type = 'ai'
//   - orderIndex 由用户指定（不自动计算，保持代码控制）
//   - 删除 LearningPath 时，关联 Task 的 learningPathId 被置为 null（onDelete: SetNull）
//
// API 扩展（CONTRACT.md 之外的 4 个端点）：
//   GET    /api/stages/:stageId/learning-paths
//   POST   /api/stages/:stageId/learning-paths
//   PATCH  /api/learning-paths/:pathId
//   DELETE /api/learning-paths/:pathId

import { db } from '../prisma/db';
import { Errors } from '../lib/response';

// ============================================================
// 输入类型
// ============================================================

export interface CreateLearningPathInput {
  stageId: string;
  title: string;
  type: string;
  description?: string;
  orderIndex: number;
}

export interface UpdateLearningPathInput {
  title?: string;
  type?: string;
  description?: string;
  orderIndex?: number;
}

// ============================================================
// Service
// ============================================================

export const learningPathService = {
  /** GET /api/stages/:stageId/learning-paths — 列出某 Stage 的 LearningPaths（按 orderIndex 升序） */
  async list(stageId: string, userId: string) {
    await this.assertStageOwned(stageId, userId);
    const paths = await db.orm.public.LearningPath
      .where((p) => p.stageId.eq(stageId))
      .orderBy((p) => p.orderIndex.asc())
      .all();
    return paths;
  },

  /** POST /api/stages/:stageId/learning-paths — 创建 LearningPath（手动创建 → source_type='user'） */
  async create(input: CreateLearningPathInput, userId: string) {
    await this.assertStageOwned(input.stageId, userId);

    const id = crypto.randomUUID();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const path = await db.orm.public.LearningPath.create({
      id,
      title: input.title as any, // VarChar<200> branded type
      type: input.type,
      description: input.description ?? null,
      sourceType: 'user', // 手动创建固定为 'user'；AI 生成由 /api/ai/learning-path/generate 处理
      orderIndex: input.orderIndex,
      stageId: input.stageId,
    } as any);

    return path;
  },

  /** PATCH /api/learning-paths/:pathId — 更新 LearningPath（不能改 stageId / sourceType） */
  async update(pathId: string, userId: string, input: UpdateLearningPathInput) {
    await this.assertLearningPathOwned(pathId, userId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.orderIndex !== undefined) updateData.orderIndex = input.orderIndex;

    const updated = await db.orm.public.LearningPath
      .where((p) => p.id.eq(pathId))
      .update(updateData);
    return updated;
  },

  /** DELETE /api/learning-paths/:pathId — 删除 LearningPath */
  async remove(pathId: string, userId: string) {
    await this.assertLearningPathOwned(pathId, userId);

    // Prisma schema: Task.learningPath onDelete: SetNull
    // 删除 LearningPath 后，关联 Task 的 learningPathId 自动设为 null
    await db.orm.public.LearningPath
      .where((p) => p.id.eq(pathId))
      .delete();
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
    // 通过 stageId → goalId → userId 反查
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
};
