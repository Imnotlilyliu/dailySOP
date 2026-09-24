// src/ai/client.ts
// OpenAI 调用器（CLAUDE.md 第 11 节）
//
// MVP 阶段：MOCK 实现，结构完整。
// 真实接入 OpenAI 时，只需替换 `callOpenAI` 函数体（保留同一签名）。
//
// 调用契约：
//   输入：PromptConfig + inputJson (string)
//   输出：raw JSON string（OpenAI completion content）
//
// 调用方负责：JSON.parse + Zod schema validation。

import type { PromptConfig } from './prompts.js';

/** OpenAI 调用参数 */
export interface OpenAICallParams {
  prompt: PromptConfig;
  /** 序列化后的 input JSON 字符串 */
  inputJson: string;
}

/** OpenAI 调用结果：raw text（应为 JSON 字符串，由调用方负责 parse + validate） */
export type OpenAICallResult = string;

/**
 * 调用 OpenAI（MVP 阶段为 MOCK 实现）。
 *
 * 真实接入时实现示例：
 *   const res = await openai.chat.completions.create({
 *     model: 'gpt-4o',
 *     messages: [
 *       { role: 'system', content: prompt.systemPrompt },
 *       { role: 'user', content: inputJson },
 *     ],
 *     response_format: { type: 'json_object' },
 *     temperature: 0.2,
 *   });
 *   return res.choices[0].message.content ?? '';
 */
export async function callOpenAI(params: OpenAICallParams): Promise<OpenAICallResult> {
  const { prompt, inputJson } = params;

  // MVP: 按 promptId 路由到 mock generator
  // 真实接入时此处替换为 OpenAI SDK 调用
  const input = JSON.parse(inputJson) as Record<string, unknown>;

  switch (prompt.promptId) {
    case 'goal-parser':
      return mockGoalParser(input);
    case 'stage-generator':
      return mockStageGenerator(input);
    case 'learning-path-organizer':
      return mockLearningPathOrganizer(input);
    case 'task-decomposer':
      return mockTaskDecomposer(input);
    case 'daily-sop-generator':
      return mockDailySopGenerator(input);
    case 'minimum-action-generator':
      return mockMinimumActionGenerator(input);
    default:
      throw new Error(`No mock for promptId: ${prompt.promptId}`);
  }
}

// ============================================================
// Mock generators（按输入内容生成合理的结构化 JSON）
// ============================================================

function mockGoalParser(input: Record<string, unknown>): string {
  const rawText = String(input.rawText ?? '');

  // 简单的启发式：从 rawText 提取关键词
  let title = 'Untitled Goal';
  if (rawText.length > 0) {
    // 取前 80 字符作为 title 候选
    title = rawText.slice(0, 80).trim();
    if (rawText.length > 80) title = title + '...';
  }

  const description = rawText.length > 0 ? rawText : null;
  const expectedOutcome = rawText.includes('接') || rawText.includes('兼职') || rawText.includes('work')
    ? 'Able to take on simple commissioned work'
    : null;

  return JSON.stringify({ goal: { title, description, expectedOutcome } });
}

function mockStageGenerator(input: Record<string, unknown>): string {
  const goal = input.goal as { title?: string; description?: string } | undefined;
  const goalTitle = goal?.title ?? '';

  // 简单按关键词路由
  let stages: Array<{ name: string; description: string; orderIndex: number; durationDays: number }>;

  if (goalTitle.includes('design') || goalTitle.includes('设计') || goalTitle.includes('平面')) {
    stages = [
      { name: 'Fundamentals', description: 'Design principles, color, typography', orderIndex: 0, durationDays: 21 },
      { name: 'Tools', description: 'Photoshop/Illustrator basics', orderIndex: 1, durationDays: 21 },
      { name: 'Practice', description: 'Poster design exercises', orderIndex: 2, durationDays: 30 },
    ];
  } else if (goalTitle.includes('code') || goalTitle.includes('programming') || goalTitle.includes('编程')) {
    stages = [
      { name: 'Syntax & Basics', description: 'Language fundamentals', orderIndex: 0, durationDays: 14 },
      { name: 'Data Structures', description: 'Arrays, objects, iteration', orderIndex: 1, durationDays: 21 },
      { name: 'Mini Project', description: 'Build a small project', orderIndex: 2, durationDays: 30 },
    ];
  } else {
    stages = [
      { name: 'Stage 1: Foundation', description: 'Build foundational knowledge', orderIndex: 0, durationDays: 14 },
      { name: 'Stage 2: Practice', description: 'Apply through exercises', orderIndex: 1, durationDays: 21 },
      { name: 'Stage 3: Output', description: 'Produce a final work', orderIndex: 2, durationDays: 30 },
    ];
  }

  return JSON.stringify({ stages });
}

function mockLearningPathOrganizer(input: Record<string, unknown>): string {
  const stage = input.stage as { name?: string } | undefined;
  const stageName = stage?.name ?? '';

  let paths: Array<{ title: string; type: string; description: string; orderIndex: number }>;

  if (stageName.toLowerCase().includes('fundamental') || stageName.includes('基础')) {
    paths = [
      { title: 'Design Principles Course', type: 'course', description: 'CRUD/contrast/repetition/alignment', orderIndex: 0 },
      { title: 'Whitespace & Hierarchy Practice', type: 'exercise', description: 'Hands-on layout drills', orderIndex: 1 },
      { title: 'Poster Copying', type: 'practice', description: 'Replicate 3 reference posters', orderIndex: 2 },
    ];
  } else if (stageName.toLowerCase().includes('tool')) {
    paths = [
      { title: 'Photoshop Basics', type: 'course', description: 'Layers, masks, blend modes', orderIndex: 0 },
      { title: 'Illustrator Basics', type: 'course', description: 'Paths, shapes, type', orderIndex: 1 },
    ];
  } else {
    paths = [
      { title: 'Core Concepts', type: 'course', description: 'Conceptual foundation', orderIndex: 0 },
      { title: 'Exercises', type: 'exercise', description: 'Applied practice', orderIndex: 1 },
    ];
  }

  return JSON.stringify({ learningPaths: paths });
}

function mockTaskDecomposer(input: Record<string, unknown>): string {
  const lp = input.learningPath as { id?: string; title?: string } | undefined;
  const lpId = lp?.id;
  const lpTitle = (lp?.title ?? '').toLowerCase();

  let tasks: Array<{ title: string; description: string; estimatedMinutes: number; orderIndex: number; learningPathId?: string }>;

  if (lpTitle.includes('principle') || lpTitle.includes('原则')) {
    tasks = [
      { title: 'Study hierarchy', description: 'Read chapter on visual hierarchy', estimatedMinutes: 45, orderIndex: 0, learningPathId: lpId },
      { title: 'Analyze 3 reference designs', description: 'Identify hierarchy in each', estimatedMinutes: 60, orderIndex: 1, learningPathId: lpId },
      { title: 'Practice sketch', description: 'Sketch a layout using hierarchy', estimatedMinutes: 90, orderIndex: 2, learningPathId: lpId },
    ];
  } else if (lpTitle.includes('poster') || lpTitle.includes('海报')) {
    tasks = [
      { title: 'Pick a reference poster', description: 'Choose a poster to copy', estimatedMinutes: 15, orderIndex: 0, learningPathId: lpId },
      { title: 'Replicate the poster', description: 'Rebuild in your tool of choice', estimatedMinutes: 180, orderIndex: 1, learningPathId: lpId },
      { title: 'Compare with original', description: 'Note differences', estimatedMinutes: 30, orderIndex: 2, learningPathId: lpId },
    ];
  } else {
    tasks = [
      { title: 'Read lesson 1', description: 'Go through first lesson', estimatedMinutes: 30, orderIndex: 0, learningPathId: lpId },
      { title: 'Exercise 1', description: 'Complete first exercise', estimatedMinutes: 60, orderIndex: 1, learningPathId: lpId },
      { title: 'Review', description: 'Self-review notes', estimatedMinutes: 15, orderIndex: 2, learningPathId: lpId },
    ];
  }

  return JSON.stringify({ tasks });
}

function mockDailySopGenerator(input: Record<string, unknown>): string {
  const tasksInput = (input.tasks as Array<{ id: string; title?: string; estimatedMinutes?: number }> | undefined) ?? [];

  // 选取前 1-3 个任务（按总时长不超过 180 分钟）
  const selected: Array<{ taskId: string; orderIndex: number }> = [];
  let totalMin = 0;
  for (let i = 0; i < tasksInput.length && i < 3; i++) {
    const t = tasksInput[i];
    const min = t.estimatedMinutes ?? 30;
    if (totalMin + min > 240) break;
    selected.push({ taskId: t.id, orderIndex: selected.length });
    totalMin += min;
  }

  // 若无任务则空数组
  return JSON.stringify({ tasks: selected });
}

function mockMinimumActionGenerator(input: Record<string, unknown>): string {
  const candidates = (input.candidateTasks as Array<{ id: string; title?: string; estimatedMinutes?: number }> | undefined) ?? [];

  if (candidates.length === 0) {
    // 无候选：返回一个"非法"taskId（会被 schema validation 拒绝，触发 AI_GENERATION_FAILED）
    return JSON.stringify({ taskId: 'INVALID', title: 'Invalid', estimatedMinutes: 0 });
  }

  // 选第一个（最简单的 mock 策略）
  const chosen = candidates[0];
  return JSON.stringify({
    taskId: chosen.id,
    title: chosen.title ?? 'Untitled Task',
    description: null,
    estimatedMinutes: chosen.estimatedMinutes ?? 30,
  });
}
