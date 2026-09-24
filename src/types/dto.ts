// src/types/dto.ts
// 各 API 端点的请求体（Request）与响应体（Response）数据传输对象
//
// 严格对齐 CLAUDE.md 第 8、9 节定义的 API：
// - Goals：GET/POST /api/goals, GET/PATCH/DELETE /api/goals/:goalId, POST pause/resume
// - Stages：GET/POST /api/goals/:goalId/stages, PATCH/DELETE /api/stages/:stageId, POST complete
// - Tasks：POST /api/tasks/:taskId/complete, /uncomplete
// - Daily SOP：GET /api/today, GET /api/daily-sops/:date, POST /api/daily-sops/:sopId/complete
// - Route/Progress：GET /api/goals/:goalId/route, GET /api/goals/:goalId/progress
// - AI：POST /api/ai/goal/parse, /stages/generate, /learning-path/generate,
//        /tasks/generate, /daily-sop/generate, /minimum-action/generate

import type {
  Goal,
  Stage,
  Task,
  DailySop,
  MinimumAction,
  DailyMinimumAction,
  LearningPath,
  GoalStatus,
  ISODateString,
  ISOTimestampString,
} from './models';

// ============================================================
// Goals
// ============================================================

export interface CreateGoalRequest {
  title: string; // ≤ 100 字符
  description?: string;
  expectedOutcome?: string;
  startDate?: ISOTimestampString;
  targetDate?: ISOTimestampString;
}

export interface UpdateGoalRequest {
  title?: string;
  description?: string;
  expectedOutcome?: string;
  startDate?: ISOTimestampString;
  targetDate?: ISOTimestampString;
  /** 可选切换 current_stage_id；目标状态由 pause/resume/complete 等动作接口控制 */
  currentStageId?: string | null;
}

export interface GoalListItem {
  goal: Goal;
  currentStage?: Stage | null;
  /** 该 Goal 今天的 SOP 是否完成 */
  todaySopCompleted: boolean;
}

export interface GoalDetailResponse {
  goal: Goal;
  currentStage: Stage | null;
  stagesCount: number;
}

// ============================================================
// Stages
// ============================================================

export interface CreateStageRequest {
  name: string; // ≤ 100 字符
  description?: string;
  orderIndex: number;
  durationDays?: number;
  startDate?: ISOTimestampString;
  endDate?: ISOTimestampString;
}

export interface UpdateStageRequest {
  name?: string;
  description?: string;
  orderIndex?: number;
  durationDays?: number;
  startDate?: ISOTimestampString;
  endDate?: ISOTimestampString;
}

// ============================================================
// Tasks
// ============================================================

/** 创建 Task 不在 CLAUDE.md 第 8 节 MVP API 列表中，故不定义。AI 生成 Task 后通过内部服务写入。 */
export type TaskCompleteResponse = Task;

// ============================================================
// Daily SOP
// ============================================================

export interface TodaySopItem {
  goalId: string;
  goalTitle: string;
  goalStatus: GoalStatus;
  sop: DailySop;
  /** 当天该 SOP 关联的 Tasks（含完成状态） */
  tasks: Array<Task & { orderIndexInSop: number }>;
}

export interface TodayResponse {
  date: ISODateString;
  /** 按 Goal 聚合的今日任务列表 */
  sops: TodaySopItem[];
  /** 全局今日最小动作（CLAUDE.md 第 4 节：每天每用户仅 1 个） */
  minimumAction: (MinimumAction & { goalId: string; goalTitle: string }) | null;
  /** 用户当天是否已绑定最小动作 */
  dailyMinimumAction: DailyMinimumAction | null;
}

export interface DailySopDetailResponse {
  sop: DailySop;
  tasks: Array<Task & { orderIndexInSop: number }>;
  minimumAction: MinimumAction | null;
}

// ============================================================
// Route / Progress
// ============================================================

/** CLAUDE.md 第 6 节：路线 - 展示 completed/in_progress/not_started；只读，不调用 AI */
export interface RouteResponse {
  goalId: string;
  goal: Goal;
  stages: Array<{
    stage: Stage;
    learningPaths: LearningPath[];
    tasks: Task[];
  }>;
}

/** CLAUDE.md 第 6 节：进度 - 计算 completed tasks / total tasks；只读，不调用 AI */
export interface ProgressResponse {
  goalId: string;
  goal: Pick<Goal, 'id' | 'title' | 'status' | 'targetDate' | 'completedAt'>;
  totalTasks: number;
  completedTasks: number;
  /** 完成率 0-1 */
  completionRatio: number;
  stages: Array<{
    stageId: string;
    stageName: string;
    stageStatus: Stage['status'];
    totalTasks: number;
    completedTasks: number;
  }>;
}

// ============================================================
// AI API（CLAUDE.md 第 9 节）
// 仅定义契约：请求体、响应体；不包含实现，不调用 OpenAI。
// CLAUDE.md 第 11 节：AI 输出必须经 Schema Validation 后才返回；失败时返回 AI_GENERATION_FAILED。
// ============================================================

/** 1. /api/ai/goal/parse — Goal Parser：用户创建/整理 Goal 时调用 */
export interface AiGoalParseRequest {
  rawText: string;
  /** 可选：已有 Goal id，表示整理现有 Goal 而非新建 */
  existingGoalId?: string;
}

export interface AiGoalParseResponse {
  /** AI 解析后的 Goal 字段建议（未经用户确认不写入数据库） */
  goal: {
    title: string;
    description?: string;
    expectedOutcome?: string;
  };
  /** 解析 log id（CLAUDE.md 第 11 节：成功或失败均写 ai_generation_logs） */
  aiLogId: string;
}

/** 2. /api/ai/stages/generate — Stage Generator：创建 Goal 后生成 Stage 候选 */
export interface AiStagesGenerateRequest {
  goalId: string;
}

export interface AiStagesGenerateResponse {
  stages: Array<{
    name: string;
    description?: string;
    orderIndex: number;
    durationDays?: number;
  }>;
  aiLogId: string;
}

/** 3. /api/ai/learning-path/generate — Learning Path Organizer：用户提交当前 Stage 学习路径时调用 */
export interface AiLearningPathGenerateRequest {
  stageId: string;
}

export interface AiLearningPathGenerateResponse {
  learningPaths: Array<{
    title: string;
    type: string;
    description?: string;
    orderIndex: number;
    sourceType: 'ai'; // 固定为 ai
  }>;
  aiLogId: string;
}

/** 4. /api/ai/tasks/generate — Task Decomposer：当前 Stage 的 Learning Path 确认后调用 */
export interface AiTasksGenerateRequest {
  stageId: string;
  learningPathId?: string;
}

export interface AiTasksGenerateResponse {
  tasks: Array<{
    title: string;
    description?: string;
    estimatedMinutes: number;
    orderIndex: number;
    learningPathId?: string;
  }>;
  aiLogId: string;
}

/** 5. /api/ai/daily-sop/generate — Daily SOP Generator：当前 Stage 需要生成 Daily SOP 时调用 */
export interface AiDailySopGenerateRequest {
  goalId: string;
  date: ISODateString;
}

export interface AiDailySopGenerateResponse {
  /** 候选 task 列表与排序（不直接写库，需经用户确认或服务层确认后写入） */
  tasks: Array<{ taskId: string; orderIndex: number }>;
  aiLogId: string;
}

/** 6. /api/ai/minimum-action/generate — Minimum Action Generator：当天不存在 Global Minimum Action 时调用 */
export interface AiMinimumActionGenerateRequest {
  date: ISODateString;
  /** 从当天所有 SOP 的 tasks 中挑选，不入库；客户端确认后由其他接口写入 */
  candidateTaskIds?: string[];
}

export interface AiMinimumActionGenerateResponse {
  /** 选中的 taskId（必须来自当天已有 Task，CLAUDE.md 第 4 节：不得创建新 Task） */
  taskId: string;
  title: string;
  description?: string;
  estimatedMinutes: number;
  aiLogId: string;
}
