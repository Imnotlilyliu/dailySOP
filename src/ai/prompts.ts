// src/ai/prompts.ts
// Prompt 配置（CLAUDE.md 第 12 节）
//
// MVP 阶段：PromptConfig 内嵌在代码中（不依赖数据库 prompt_configs 表的种子数据）。
// 真实接入时可以改为从数据库读取（schema 已有 prompt_configs 表 + @@unique([promptId, version])）。
//
// 每个 Prompt 必须包含（CLAUDE.md 第 12 节）：
//   - prompt_id
//   - version
//   - system_prompt
//   - input_schema（描述，供 AI 参考）
//   - output_schema（描述，供 AI 参考）
//   - rules

export interface PromptConfig {
  promptId: string;
  version: string;
  name: string;
  systemPrompt: string;
  inputSchema: string;
  outputSchema: string;
  rules: string;
  status: 'active' | 'inactive';
}

// ============================================================
// 6 个 Prompt 配置
// ============================================================

export const PROMPTS: Record<string, PromptConfig> = {
  // 1. Goal Parser
  'goal-parser': {
    promptId: 'goal-parser',
    version: '1.0.0',
    name: 'Goal Parser',
    systemPrompt:
      'You are a goal parsing assistant. ' +
      'Given a raw user text describing their goal, extract structured fields. ' +
      'Output MUST be a JSON object with fields: title, description, expectedOutcome. ' +
      'title: concise goal title (<=100 chars). ' +
      'description: detailed description of the goal. ' +
      'expectedOutcome: measurable/describable expected outcome. ' +
      'If a field cannot be inferred, use null. Do not invent facts.',
    inputSchema: '{ rawText: string, existingGoalId?: string }',
    outputSchema: '{ title: string, description: string|null, expectedOutcome: string|null }',
    rules: 'No CRUD. No status. Only return suggestions for user confirmation.',
    status: 'active',
  },

  // 2. Stage Generator
  'stage-generator': {
    promptId: 'stage-generator',
    version: '1.0.0',
    name: 'Stage Generator',
    systemPrompt:
      'You are a stage planning assistant. ' +
      'Given a goal (title + description + expectedOutcome), propose 3-5 sequential stages. ' +
      'Output MUST be a JSON object: { stages: [{ name, description, orderIndex, durationDays? }] }. ' +
      'orderIndex starts at 0. durationDays in integer days. ' +
      'Each stage name <= 100 chars.',
    inputSchema: '{ goal: { id, title, description?, expectedOutcome? } }',
    outputSchema: '{ stages: [{ name: string, description?: string, orderIndex: number, durationDays?: number }] }',
    rules: 'Only suggestions. Current stage mechanism: first stage becomes in_progress, others not_started.',
    status: 'active',
  },

  // 3. Learning Path Organizer
  'learning-path-organizer': {
    promptId: 'learning-path-organizer',
    version: '1.0.0',
    name: 'Learning Path Organizer',
    systemPrompt:
      'You are a learning path organizer. ' +
      'Given a stage (name + description + goal context), propose 2-4 learning paths. ' +
      'Output MUST be: { learningPaths: [{ title, type, description?, orderIndex }] }. ' +
      'type examples: course, exercise, reading, practice. ' +
      'title <= 200 chars. orderIndex starts at 0.',
    inputSchema: '{ stage: { id, name, description?, goal: { id, title } } }',
    outputSchema: '{ learningPaths: [{ title: string, type: string, description?: string, orderIndex: number }] }',
    rules: 'Only suggestions. source_type will be set to "ai" by service layer on save.',
    status: 'active',
  },

  // 4. Task Decomposer
  'task-decomposer': {
    promptId: 'task-decomposer',
    version: '1.0.0',
    name: 'Task Decomposer',
    systemPrompt:
      'You are a task decomposer. ' +
      'Given a stage and optional learning path, decompose into 3-6 concrete tasks. ' +
      'Output MUST be: { tasks: [{ title, description?, estimatedMinutes, orderIndex, learningPathId? }] }. ' +
      'title <= 200 chars. estimatedMinutes integer > 0. orderIndex starts at 0. ' +
      'If learningPathId provided in input, attach to relevant tasks.',
    inputSchema: '{ stage: { id, name }, learningPath?: { id, title, type } }',
    outputSchema: '{ tasks: [{ title: string, description?: string, estimatedMinutes: number, orderIndex: number, learningPathId?: string }] }',
    rules: 'Only suggestions. Tasks belong to the stage; learningPathId must be one of input.',
    status: 'active',
  },

  // 5. Daily SOP Generator
  'daily-sop-generator': {
    promptId: 'daily-sop-generator',
    version: '1.0.0',
    name: 'Daily SOP Generator',
    systemPrompt:
      'You are a daily SOP planner. ' +
      'Given a goal, current stage, available tasks, and date, propose today\'s task selection and order. ' +
      'Output MUST be: { tasks: [{ taskId, orderIndex }] }. ' +
      'taskId MUST come from input tasks only (no new tasks). ' +
      'Pick 1-5 tasks reasonable for one day.',
    inputSchema: '{ goal, stage, tasks: [{ id, title, estimatedMinutes }], date }',
    outputSchema: '{ tasks: [{ taskId: string, orderIndex: number }] }',
    rules: 'Only suggestions. Does not write daily_sops table; user/service confirms then writes.',
    status: 'active',
  },

  // 6. Minimum Action Generator
  'minimum-action-generator': {
    promptId: 'minimum-action-generator',
    version: '1.0.0',
    name: 'Minimum Action Generator',
    systemPrompt:
      'You are a minimum action selector. ' +
      'Given candidate tasks for today, pick ONE as the global minimum action. ' +
      'Output MUST be: { taskId, title, description?, estimatedMinutes }. ' +
      'taskId MUST come from input candidates only (CLAUDE.md: must not create new tasks). ' +
      'Choose the most impactful, low-friction task.',
    inputSchema: '{ date, candidateTasks: [{ id, title, estimatedMinutes }] }',
    outputSchema: '{ taskId: string, title: string, description?: string, estimatedMinutes: number }',
    rules: 'taskId must be from input. No new tasks. Only one minimum action per day.',
    status: 'active',
  },
};

/** 按 promptId 获取 active 的 Prompt 配置 */
export function getPrompt(promptId: string): PromptConfig {
  const p = PROMPTS[promptId];
  if (!p) {
    throw new Error(`Unknown promptId: ${promptId}`);
  }
  if (p.status !== 'active') {
    throw new Error(`Prompt ${promptId} is not active`);
  }
  return p;
}
