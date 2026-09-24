# API Contract

> 严格对齐 `CLAUDE.md` 第 8、9 节。MVP 阶段不增加新 API，不修改已有 API 名称。
> 实现类型见 `src/types/dto.ts`、`src/types/models.ts`、`src/types/api.ts`。

## 通用约定

### 认证

- 所有 `/api/*` 端点要求登录态
- **优先**：`Authorization: Bearer <jwt>`（HS256，7 天有效期，`sub=userId`）
- **Dev fallback**：`X-User-Id: <uuid>`（仅 `NODE_ENV !== 'production'`，便于 SSR / curl 调试）
- 都缺失 → `401 UNAUTHORIZED`
- Token 获取：`POST /api/auth/dev-login` 或 `POST /api/auth/register`
- 当前用户：`GET /api/auth/me`

### 响应格式

- 成功：`{ "success": true, "data": <T>, "meta"?: {...} }`
- 失败：`{ "success": false, "error": { "code": "...", "message": "..." } }`

### 错误码

| code                      | HTTP | 说明                                                          |
| ------------------------- | ---- | ------------------------------------------------------------- |
| `VALIDATION_ERROR`        | 400  | 请求参数校验失败                                              |
| `UNAUTHORIZED`            | 401  | 未登录                                                        |
| `FORBIDDEN`               | 403  | 无权限操作该资源                                              |
| `NOT_FOUND`               | 404  | 资源不存在或不属于当前用户                                    |
| `CONFLICT`                | 409  | 唯一约束冲突（如同一 Goal 同一天重复 SOP）                    |
| `BUSINESS_RULE_VIOLATION` | 422  | 违反 CLAUDE.md 第 4 节业务规则                                |
| `AI_GENERATION_FAILED`    | 422  | AI 调用或 Schema Validation 失败（已写 `ai_generation_logs`） |
| `INTERNAL_ERROR`          | 500  | 服务端异常                                                    |

### 数据类型

- `ISODateString`：`YYYY-MM-DD`（对应 Prisma `DateString`）
- `ISOTimestampString`：ISO 8601 时间戳（对应 Prisma `TimestamptzString`，避免 Temporal polyfill）
- `id`：UUID v4 字符串

### 业务规则（CLAUDE.md 第 4 节）

- 每用户最多 3 个 active goals（`MAX_ACTIVE_GOALS=3`）
- 每个 Goal 同时只能有 1 个 in_progress Stage
- 每个 Goal 每天只能有 1 个 Daily SOP
- 每个 SOP 只能关联 1 个 Minimum Action
- 每用户每天只有 1 个全局 Minimum Action

---

## 〇、Auth API（3 个端点）

> 认证系统。MVP 阶段无密码，dev-login 一键签 JWT；register 创建用户后签 JWT。

### A1. POST `/api/auth/dev-login` — 开发登录

- **Request**：`{ userId?: uuid, email?: string, name?: string }`（必须提供 `userId` 或 `email` 之一）
- **Response 200**：`ApiSuccessResponse<{ user: AuthUser; token: string }>`
- **业务规则**：
  - `NODE_ENV=production` → `403 FORBIDDEN`（dev 专用）
  - `userId` 模式：用户必须存在，否则 `404 NOT_FOUND`
  - `email` 模式：用户存在则登录；不存在则**自动创建**（dev 便捷）
- **注意**：`userId` 必须是合法 UUID v4

### A2. POST `/api/auth/register` — 注册

- **Request**：`{ email: string, name?: string }`
- **Response 201**：`ApiSuccessResponse<{ user: AuthUser; token: string }>`
- **业务规则**：`email` 唯一；已存在 → `409 CONFLICT`

### A3. GET `/api/auth/me` — 当前用户

- **Response 200**：`ApiSuccessResponse<AuthUser>`
- **Response 401**：Token 无效或过期

---

## 一、Goals API（7 个端点）

### 1. GET `/api/goals` — 列出我的目标

- **Query**：`?status=active|paused|completed|deleted`（默认 `active`，不含 `deleted`）
- **Response 200**：`ApiSuccessResponse<GoalListItem[]>`

### 2. POST `/api/goals` — 创建 Goal

- **Request**：`CreateGoalRequest { title, description?, expectedOutcome?, startDate?, targetDate? }`
- **Response 201**：`ApiSuccessResponse<{ goal: Goal }>`
- **业务规则**：
  - `MAX_ACTIVE_GOALS` 超过 → `BUSINESS_RULE_VIOLATION` (422)
  - `title` 长度 ≤ 100（VarChar(100)）

### 3. GET `/api/goals/:goalId` — Goal 详情

- **Response 200**：`ApiSuccessResponse<GoalDetailResponse>`
- **Response 404**：`NOT_FOUND`

### 4. PATCH `/api/goals/:goalId` — 更新 Goal

- **Request**：`UpdateGoalRequest`
- **Response 200**：`ApiSuccessResponse<{ goal: Goal }>`
- **业务规则**：`status` 不在此修改（通过 pause/resume 接口）

### 5. DELETE `/api/goals/:goalId` — 软删除 Goal

- **Response 204**：`No Content`
- **业务规则**：CLAUDE.md 软删除（写 `deletedAt` + `status=deleted`）；级联清理关联数据由 `onDelete: Cascade` 处理

### 6. POST `/api/goals/:goalId/pause` — 暂停 Goal

- **Response 200**：`ApiSuccessResponse<{ goal: Goal }>`
- **业务规则**：暂停后不生成新 SOP

### 7. POST `/api/goals/:goalId/resume` — 恢复 Goal

- **Response 200**：`ApiSuccessResponse<{ goal: Goal }>`
- **业务规则**：恢复前检查 `active goals < 3`，否则 `BUSINESS_RULE_VIOLATION`

---

## 二、Stages API（5 个端点）

### 8. GET `/api/goals/:goalId/stages` — 列出某 Goal 的 Stages

- **Response 200**：`ApiSuccessResponse<{ stages: Stage[] }>`
- **Response 404**：Goal 不存在

### 9. POST `/api/goals/:goalId/stages` — 创建 Stage

- **Request**：`CreateStageRequest { name, description?, orderIndex, durationDays?, startDate?, endDate? }`
- **Response 201**：`ApiSuccessResponse<{ stage: Stage }>`
- **业务规则**：`name` ≤ 100 字符；只有当前 Stage 需详细配置

### 10. PATCH `/api/stages/:stageId` — 更新 Stage

- **Request**：`UpdateStageRequest`
- **Response 200**：`ApiSuccessResponse<{ stage: Stage }>`

### 11. DELETE `/api/stages/:stageId` — 删除 Stage

- **Response 204**：`No Content`
- **业务规则**：`in_progress` Stage 不可删除

### 12. POST `/api/stages/:stageId/complete` — 完成 Stage

- **Response 200**：`ApiSuccessResponse<{ stage: Stage; nextStage?: Stage | null; goalCompleted: boolean }>`
- **业务规则**：`in_progress → completed`；最终 Stage 完成 → `Goal.status=completed`

---

## 三、Tasks API（2 个端点）

### 13. POST `/api/tasks/:taskId/complete` — 标记 Task 完成

- **Response 200**：`ApiSuccessResponse<Task>`
- **业务规则**：`pending → completed`，写 `completedAt`

### 14. POST `/api/tasks/:taskId/uncomplete` — 取消完成

- **Response 200**：`ApiSuccessResponse<Task>`
- **业务规则**：`completed → pending`，清空 `completedAt`
- **注意**：CLAUDE.md 第 4 节：最小动作完成后不自动生成第二个（不在此接口处理）

---

## 三-bis、LearningPaths API（扩展，4 个端点）

> 扩展自 CLAUDE.md 第 8 节 LearningPath 模型。原 CONTRACT 未定义 LearningPath CRUD，仅 AI 生成。
> 为支持"代码控制状态机、不依赖 AI"流程，扩展 4 个 CRUD 端点。
> 手动创建固定 `source_type=user`；AI 生成由 `/api/ai/learning-path/generate` 处理。

### 13-LP.1 GET `/api/stages/:stageId/learning-paths` — 列出某 Stage 的 LearningPaths

- **Response 200**：`ApiSuccessResponse<{ learningPaths: LearningPath[] }>`
- **Response 404**：Stage 不存在

### 13-LP.2 POST `/api/stages/:stageId/learning-paths` — 创建 LearningPath

- **Request**：`CreateLearningPathRequest { title, type, description?, orderIndex }`
- **Response 201**：`ApiSuccessResponse<{ learningPath: LearningPath }>`
- **业务规则**：`source_type` 固定 `user`；`title` ≤ 200 字符

### 13-LP.3 PATCH `/api/learning-paths/:pathId` — 更新 LearningPath

- **Request**：`UpdateLearningPathRequest`
- **Response 200**：`ApiSuccessResponse<{ learningPath: LearningPath }>`
- **业务规则**：不能改 `stageId` / `sourceType`

### 13-LP.4 DELETE `/api/learning-paths/:pathId` — 删除 LearningPath

- **Response 204**：`No Content`
- **业务规则**：关联 Task 的 `learningPathId` 自动设为 null（onDelete: SetNull）

---

## 三-ter、Tasks CRUD API（扩展，4 个端点）

> 扩展自 CLAUDE.md 第 8 节 Task 模型。原 CONTRACT 仅 #13/#14 两个动作端点。
> 为支持手动创建 Task 流程，扩展 4 个 CRUD 端点。

### 13-T.1 GET `/api/stages/:stageId/tasks` — 列出某 Stage 的 Tasks

- **Response 200**：`ApiSuccessResponse<{ tasks: Task[] }>`
- **Response 404**：Stage 不存在

### 13-T.2 POST `/api/stages/:stageId/tasks` — 创建 Task

- **Request**：`CreateTaskRequest { learningPathId?, title, description?, estimatedMinutes, orderIndex }`
- **Response 201**：`ApiSuccessResponse<{ task: Task }>`
- **业务规则**：
  - `learningPathId` 若指定，必须属于同一 Stage（否则 `TASK_PATH_STAGE_MISMATCH`）
  - 新建默认 `status=pending`
  - `title` ≤ 200 字符

### 13-T.3 GET `/api/learning-paths/:pathId/tasks` — 列出某 LearningPath 的 Tasks

- **Response 200**：`ApiSuccessResponse<{ tasks: Task[] }>`
- **Response 404**：LearningPath 不存在

### 13-T.4 PATCH `/api/tasks/:taskId` — 更新 Task

- **Request**：`UpdateTaskRequest`
- **Response 200**：`ApiSuccessResponse<{ task: Task }>`
- **业务规则**：不能改 `stageId` / `status`，状态由状态机控制

### 13-T.5 DELETE `/api/tasks/:taskId` — 删除 Task

- **Response 204**：`No Content`

---

## 四、DailySop API（6 个端点）

> 对齐 CLAUDE.md 第 4 节"每用户每天每 goal 唯一 sop"。MVP 不调 AI 生成 SOP，sop 在今日页加载时按需 get-or-create。

### 15. GET `/api/today` — 今日聚合

- **Query**：`?date=YYYY-MM-DD`（默认今天）
- **Response 200**：`ApiSuccessResponse<TodayResponse>`
- **聚合**：所有 active Goal 的今日 SOP（含关联 tasks / minimumActions）+ 今日全局 minimumAction

### 16. GET `/api/goals/:goalId/daily-sops/:date` — 获取某日 sop

- **Path**：`date` 格式 `YYYY-MM-DD`
- **Response 200**：`ApiSuccessResponse<DailySop>`
- **Response 404**：sop 不存在或不属于当前用户
- **业务规则**：校验 goal 归属当前用户

### 17. POST `/api/goals/:goalId/daily-sops` — 创建某日 sop

- **Request**：`{ date: YYYY-MM-DD, stageId: uuid }`
- **Response 201**：`ApiSuccessResponse<DailySop>`
- **业务规则**：
  - goal 必须属于当前用户（否则 `404`）
  - stage 必须属于该 goal（否则 `BUSINESS_RULE_VIOLATION` `STAGE_NOT_OF_GOAL`）
  - 同一 (userId, goalId, date) 已存在 → `422 BUSINESS_RULE_VIOLATION` `DAILY_SOP_ALREADY_EXISTS`
  - 默认 `status=pending`，`completedAt=null`

### 18. POST `/api/daily-sops/:sopId/complete` — 完成 sop

- **Response 200**：`ApiSuccessResponse<DailySop>`
- **业务规则**：`pending → completed`，写 `completedAt`；已 completed 返回当前状态（幂等）

### 19. POST `/api/daily-sops/:sopId/uncomplete` — 取消完成

- **Response 200**：`ApiSuccessResponse<DailySop>`
- **业务规则**：`completed → pending`，清空 `completedAt`

---

## 四-bis、MinimumAction API（5 个端点）

> 对齐 CLAUDE.md 第 4 节：每 sop 限 1 个 MA；MA 必须引用当天已有 Task（不得新建 Task）；MA.completed ≠ sop.completed（独立状态机）；MA 完成时同步完成关联 Task。

### 20. GET `/api/daily-sops/:sopId/minimum-action` — 获取 sop 的 MA

- **Response 200**：`ApiSuccessResponse<MinimumAction | null>`
- **业务规则**：sop 必须属于当前用户

### 21. POST `/api/daily-sops/:sopId/minimum-action` — 保存 MA

- **Request**：`{ taskId: uuid, title: string, description?: string, estimatedMinutes: int }`
- **Response 201**：`ApiSuccessResponse<MinimumAction>`
- **业务规则**：
  - sop 必须属于当前用户
  - sop 已有 MA → `422 BUSINESS_RULE_VIOLATION` `MINIMUM_ACTION_ALREADY_EXISTS`（每 sop 限 1）
  - taskId 必须存在且 `stageId === sop.stageId`（否则 `TASK_NOT_OF_SOP_STAGE`）
  - `title` ≤ 200 字符

### 22. DELETE `/api/daily-sops/:sopId/minimum-action` — 删除 MA

- **Response 204**：`No Content`
- **业务规则**：MA 必须未完成（已完成 → `422 BUSINESS_RULE_VIOLATION` `MINIMUM_ACTION_COMPLETED`）

### 23. POST `/api/minimum-actions/:actionId/complete` — 完成 MA

- **Response 200**：`ApiSuccessResponse<MinimumAction>`
- **业务规则**：
  - `completedAt` 为空 → 写 `now()`；已 completed 返回当前状态（幂等）
  - 同步完成关联 Task（`task.status=completed, task.completedAt=now()`）—— 业务上"做完了最小动作"= 该 task 完成

### 24. POST `/api/minimum-actions/:actionId/uncomplete` — 取消完成 MA

- **Response 200**：`ApiSuccessResponse<MinimumAction>`
- **业务规则**：清空 `completedAt`；**不**回滚关联 Task（避免误清理独立勾选的状态）

---

## 四-ter、DailyMinimumAction API（3 个端点）

> 全局每日最小动作（每用户每天唯一）。UI 上从多个 sop 的 MA 中选一个"全局聚焦"。

### 25. GET `/api/daily-minimum-actions/:date` — 获取某日全局 MA

- **Response 200**：`ApiSuccessResponse<DailyMinimumAction | null>`
- **Response 形态**：返回 `{ id, date, userId, minimumActionId, minimumAction?: MinimumAction }`

### 26. POST `/api/daily-minimum-actions` — 设置今日全局 MA

- **Request**：`{ date: YYYY-MM-DD, minimumActionId: uuid }`
- **Response 201**：`ApiSuccessResponse<DailyMinimumAction>`
- **业务规则**：
  - 同一 (userId, date) 已存在 → `422 BUSINESS_RULE_VIOLATION` `DAILY_MINIMUM_ACTION_ALREADY_EXISTS`
  - minimumAction 必须属于当前用户

### 27. DELETE `/api/daily-minimum-actions/:date` — 清除今日全局 MA

- **Response 204**：`No Content`
- **业务规则**：不存在则幂等返回 204

---

## 五、Route / Progress API（2 个端点）

### 28. GET `/api/goals/:goalId/route` — Goal 路线图

- **Response 200**：`ApiSuccessResponse<RouteResponse>`
- **职责**（CLAUDE.md 第 6 节）：只读数据库，**不调用 AI**

### 29. GET `/api/goals/:goalId/progress` — Goal 进度

- **Response 200**：`ApiSuccessResponse<ProgressResponse>`
- **职责**（CLAUDE.md 第 6 节）：只读 + 计算，**不调用 AI**

---

## 六、AI API（6 个端点）

> CLAUDE.md 第 9、11 节。MVP 阶段仅定义契约，**不接入 OpenAI**。
> 调用流程：读取 `prompt_configs` → 构造 Input → 调用 → JSON Parse → Schema Validation → 保存/返回
> 失败：Retry 1 次 → 写 `ai_generation_logs` → 返回 `AI_GENERATION_FAILED`

### 30. POST `/api/ai/goal/parse` — Goal Parser

- **调用时机**：用户创建/整理 Goal 时
- **Request**：`AiGoalParseRequest { rawText, existingGoalId? }`
- **Response 200**：`ApiSuccessResponse<AiGoalParseResponse>`
- **Response 422**：`AI_GENERATION_FAILED`
- **注意**：返回值仅建议，**不直接写库**；用户确认后由 POST /api/goals 落库

### 31. POST `/api/ai/stages/generate` — Stage Generator

- **Request**：`AiStagesGenerateRequest { goalId }`
- **Response 200**：`ApiSuccessResponse<AiStagesGenerateResponse>`

### 32. POST `/api/ai/learning-path/generate` — Learning Path Organizer

- **Request**：`AiLearningPathGenerateRequest { stageId }`
- **Response 200**：`ApiSuccessResponse<AiLearningPathGenerateResponse>`

### 33. POST `/api/ai/tasks/generate` — Task Decomposer

- **Request**：`AiTasksGenerateRequest { stageId, learningPathId? }`
- **Response 200**：`ApiSuccessResponse<AiTasksGenerateResponse>`

### 34. POST `/api/ai/daily-sop/generate` — Daily SOP Generator

- **Request**：`AiDailySopGenerateRequest { goalId, date }`
- **Response 200**：`ApiSuccessResponse<AiDailySopGenerateResponse>`

### 35. POST `/api/ai/minimum-action/generate` — Minimum Action Generator

- **Request**：`AiMinimumActionGenerateRequest { date, candidateTaskIds? }`
- **Response 200**：`ApiSuccessResponse<AiMinimumActionGenerateResponse>`
- **业务规则**：`taskId` 必须来自当天已有 Task，**不得创建新 Task**

---

## 全部 API Contract 总览

| #   | Method | Path                                        | 用途                      | 类型 |
| --- | ------ | ------------------------------------------- | ------------------------- | ---- |
| A1  | POST   | `/api/auth/dev-login`                       | 开发登录（签 JWT）        | Auth |
| A2  | POST   | `/api/auth/register`                        | 注册（创建用户 + 签 JWT） | Auth |
| A3  | GET    | `/api/auth/me`                              | 当前用户                  | Auth |
| 1   | GET    | `/api/goals`                                | 列出目标                  | CRUD |
| 2   | POST   | `/api/goals`                                | 创建目标                  | CRUD |
| 3   | GET    | `/api/goals/:goalId`                        | 目标详情                  | CRUD |
| 4   | PATCH  | `/api/goals/:goalId`                        | 更新目标                  | CRUD |
| 5   | DELETE | `/api/goals/:goalId`                        | 软删除目标                | CRUD |
| 6   | POST   | `/api/goals/:goalId/pause`                  | 暂停目标                  | 动作 |
| 7   | POST   | `/api/goals/:goalId/resume`                 | 恢复目标                  | 动作 |
| 8   | GET    | `/api/goals/:goalId/stages`                 | 列出阶段                  | CRUD |
| 9   | POST   | `/api/goals/:goalId/stages`                 | 创建阶段                  | CRUD |
| 10  | PATCH  | `/api/stages/:stageId`                      | 更新阶段                  | CRUD |
| 11  | DELETE | `/api/stages/:stageId`                      | 删除阶段                  | CRUD |
| 12  | POST   | `/api/stages/:stageId/complete`             | 完成阶段                  | 动作 |
| 13  | POST   | `/api/tasks/:taskId/complete`               | 完成任务                  | 动作 |
| 14  | POST   | `/api/tasks/:taskId/uncomplete`             | 取消完成                  | 动作 |
| 15  | GET    | `/api/today`                                | 今日聚合                  | 查询 |
| 16  | GET    | `/api/goals/:goalId/daily-sops/:date`       | 获取某日 sop              | 查询 |
| 17  | POST   | `/api/goals/:goalId/daily-sops`             | 创建某日 sop              | CRUD |
| 18  | POST   | `/api/daily-sops/:sopId/complete`           | 完成 sop                  | 动作 |
| 19  | POST   | `/api/daily-sops/:sopId/uncomplete`         | 取消完成 sop              | 动作 |
| 20  | GET    | `/api/daily-sops/:sopId/minimum-action`     | 获取 sop 的 MA            | 查询 |
| 21  | POST   | `/api/daily-sops/:sopId/minimum-action`     | 保存 MA                   | CRUD |
| 22  | DELETE | `/api/daily-sops/:sopId/minimum-action`     | 删除 MA                   | CRUD |
| 23  | POST   | `/api/minimum-actions/:actionId/complete`   | 完成 MA                   | 动作 |
| 24  | POST   | `/api/minimum-actions/:actionId/uncomplete` | 取消完成 MA               | 动作 |
| 25  | GET    | `/api/daily-minimum-actions/:date`          | 获取某日全局 MA           | 查询 |
| 26  | POST   | `/api/daily-minimum-actions`                | 设置今日全局 MA           | CRUD |
| 27  | DELETE | `/api/daily-minimum-actions/:date`          | 清除今日全局 MA           | CRUD |
| 28  | GET    | `/api/goals/:goalId/route`                  | 路线图                    | 只读 |
| 29  | GET    | `/api/goals/:goalId/progress`               | 进度                      | 只读 |
| 30  | POST   | `/api/ai/goal/parse`                        | AI 解析 Goal              | AI   |
| 31  | POST   | `/api/ai/stages/generate`                   | AI 生成 Stage             | AI   |
| 32  | POST   | `/api/ai/learning-path/generate`            | AI 生成 Learning Path     | AI   |
| 33  | POST   | `/api/ai/tasks/generate`                    | AI 生成 Tasks             | AI   |
| 34  | POST   | `/api/ai/daily-sop/generate`                | AI 生成 Daily SOP         | AI   |
| 35  | POST   | `/api/ai/minimum-action/generate`           | AI 生成最小动作           | AI   |

**合计 35 个 API 端点**（含 Auth 3 + 新增 DailySop/MinimumAction/DailyMinimumAction CRUD 11）：

- Auth 3 + CRUD 12 + 动作 9 + 查询 5 + AI 6
