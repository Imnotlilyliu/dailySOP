// src/types/models.ts
// 实体类型定义 - 与 src/prisma/contract.prisma 保持一致
// 字段命名：TypeScript 使用 camelCase（Prisma 8 客户端契约）

// ============================================================
// Enums（对应 contract.prisma 中的枚举）
// ============================================================

export type GoalStatus = 'active' | 'paused' | 'completed' | 'deleted';
export type StageStatus = 'not_started' | 'in_progress' | 'completed';
export type TaskStatus = 'pending' | 'completed';
export type SopStatus = 'pending' | 'completed';
export type PromptStatus = 'active' | 'inactive';
export type AiLogStatus = 'success' | 'failure';
export type LearningPathSource = 'user' | 'ai';

// ============================================================
// 通用字段（ISO 8601 字符串形式，符合 P8 String 编解码约定）
// ============================================================

/** ISO 8601 date string (YYYY-MM-DD)，对应 contract.prisma 的 DateString */
export type ISODateString = string;

/** ISO 8601 timestamp string，对应 contract.prisma 的 TimestamptzString */
export type ISOTimestampString = string;

// ============================================================
// 实体接口（与 Prisma 模型字段一一对应，去除关联对象）
// ============================================================

export interface User {
  id: string;
  email: string | null;
  name: string;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface Goal {
  id: string;
  title: string; // VarChar(100)
  description: string | null;
  expectedOutcome: string | null;
  status: GoalStatus;
  startDate: ISOTimestampString | null;
  targetDate: ISOTimestampString | null;
  currentStageId: string | null;
  userId: string;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
  completedAt: ISOTimestampString | null;
  deletedAt: ISOTimestampString | null;
}

export interface Stage {
  id: string;
  name: string; // VarChar(100)
  description: string | null;
  orderIndex: number;
  durationDays: number | null;
  startDate: ISOTimestampString | null;
  endDate: ISOTimestampString | null;
  status: StageStatus;
  goalId: string;
  completedAt: ISOTimestampString | null;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface LearningPath {
  id: string;
  title: string; // VarChar(200)
  type: string;
  description: string | null;
  sourceType: LearningPathSource;
  orderIndex: number;
  stageId: string;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface Task {
  id: string;
  stageId: string;
  learningPathId: string | null;
  title: string; // VarChar(200)
  description: string | null;
  estimatedMinutes: number;
  orderIndex: number;
  status: TaskStatus;
  completedAt: ISOTimestampString | null;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface DailySop {
  id: string;
  goalId: string;
  stageId: string;
  date: ISODateString; // DateString
  status: SopStatus;
  userId: string;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
  completedAt: ISOTimestampString | null;
}

export interface DailySopTask {
  id: string;
  dailySopId: string;
  taskId: string;
  orderIndex: number;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface MinimumAction {
  id: string;
  dailySopId: string;
  taskId: string;
  title: string; // VarChar(200)
  description: string | null;
  estimatedMinutes: number;
  completedAt: ISOTimestampString | null;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface DailyMinimumAction {
  id: string;
  userId: string;
  date: ISODateString;
  minimumActionId: string;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface PromptConfig {
  id: string;
  promptId: string; // VarChar(100)
  version: string; // VarChar(20)
  name: string; // VarChar(200)
  systemPrompt: string;
  inputSchema: string;
  outputSchema: string;
  rules: string;
  status: PromptStatus;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}

export interface AiGenerationLog {
  id: string;
  userId: string | null;
  promptId: string; // VarChar(100)
  promptVersion: string; // VarChar(20)
  inputJson: string;
  outputJson: string | null;
  status: AiLogStatus;
  errorMessage: string | null;
  createdAt: ISOTimestampString;
  updatedAt: ISOTimestampString;
}
