"use client";

import { useState, useCallback } from "react";
import { api, type AiGoalParseResult, type AiStageGenerateResult, type AiLearningPathGenerateResult, type AiTaskGenerateResult } from "@/lib/api";

type Step = 0 | 1 | 2 | 3 | 4 | 5;

interface ParsedGoal {
  title: string;
  description: string | null;
  expectedOutcome: string | null;
}

interface ParsedStage {
  name: string;
  description: string | null;
  orderIndex: number;
  durationDays: number | null;
}

interface ParsedLearningPath {
  title: string;
  type: string;
  description?: string;
  orderIndex: number;
  sourceType: "user";
}

interface ParsedTask {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  orderIndex: number;
  learningPathId?: string | null;
}

interface PersistedGoal {
  id: string;
  title: string;
}

interface PersistedStage {
  id: string;
  name: string;
  orderIndex: number;
}

const STEP_LABELS = [
  "写一个目标",
  "确认目标",
  "拆解阶段",
  "学习路径",
  "任务拆解",
  "完成",
];

export function GoalWizard({ onComplete, onCancel }: { onComplete: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rawInput, setRawInput] = useState("");
  const [parsedGoal, setParsedGoal] = useState<ParsedGoal | null>(null);
  const [persistedGoal, setPersistedGoal] = useState<PersistedGoal | null>(null);

  const [parsedStages, setParsedStages] = useState<ParsedStage[] | null>(null);
  const [persistedStages, setPersistedStages] = useState<PersistedStage[]>([]);

  const [learningPathInput, setLearningPathInput] = useState("");
  const [learningPaths, setLearningPaths] = useState<ParsedLearningPath[]>([]);
  const [persistedLearningPathIds, setPersistedLearningPathIds] = useState<string[]>([]);

  const [parsedTasks, setParsedTasks] = useState<ParsedTask[] | null>(null);

  const firstStageId = persistedStages[0]?.id;

  async function parseGoal() {
    if (!rawInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AiGoalParseResult>("/api/ai/goal/parse", { rawText: rawInput });
      setParsedGoal({
        title: result.goal.title,
        description: result.goal.description,
        expectedOutcome: result.goal.expectedOutcome,
      });
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmGoal() {
    if (!parsedGoal) return;
    setLoading(true);
    setError(null);
    try {
      const created = await api.post<{ goal: { id: string } }>("/api/goals", {
        title: parsedGoal.title,
        description: parsedGoal.description,
        expectedOutcome: parsedGoal.expectedOutcome,
      });
      setPersistedGoal({ id: created.goal.id, title: parsedGoal.title });
      setStep(2);
      await generateStages(created.goal.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function generateStages(goalId: string) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AiStageGenerateResult>("/api/ai/stages/generate", { goalId });
      setParsedStages(result.stages.map((s) => ({
        name: s.name,
        description: s.description,
        orderIndex: s.orderIndex,
        durationDays: s.durationDays,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmStages() {
    if (!persistedGoal || !parsedStages) return;
    setLoading(true);
    setError(null);
    try {
      const created: PersistedStage[] = [];
      for (const s of parsedStages) {
        const r = await api.post<{ stage: { id: string } }>(`/api/goals/${persistedGoal.id}/stages`, {
          name: s.name,
          description: s.description,
          orderIndex: s.orderIndex,
          durationDays: s.durationDays,
        });
        created.push({ id: r.stage.id, name: s.name, orderIndex: s.orderIndex });
      }
      setPersistedStages(created);
      setStep(3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function parseUserLearningPath() {
    if (!learningPathInput.trim()) {
      setLearningPaths([]);
      return;
    }
    const lines = learningPathInput
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l, i) => ({
        title: l,
        type: "custom",
        orderIndex: i,
        sourceType: "user" as const,
      }));
    setLearningPaths(lines);
  }

  async function confirmLearningPaths() {
    if (!firstStageId) return;
    setLoading(true);
    setError(null);
    try {
      const ids: string[] = [];
      for (const lp of learningPaths) {
        const r = await api.post<{ learningPath: { id: string } }>(`/api/stages/${firstStageId}/learning-paths`, {
          title: lp.title,
          type: lp.type,
          description: lp.description,
          orderIndex: lp.orderIndex,
        });
        ids.push(r.learningPath.id);
      }
      setPersistedLearningPathIds(ids);
      setStep(4);
      await generateTasks(firstStageId, ids[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function generateTasks(stageId: string, learningPathId: string | null) {
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<AiTaskGenerateResult>("/api/ai/tasks/generate", {
        stageId,
        learningPathId,
      });
      setParsedTasks(result.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
        orderIndex: t.orderIndex,
        learningPathId: t.learningPathId ?? null,
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirmTasks() {
    if (!firstStageId || !parsedTasks) return;
    setLoading(true);
    setError(null);
    try {
      for (const t of parsedTasks) {
        await api.post(`/api/stages/${firstStageId}/tasks`, {
          title: t.title,
          description: t.description,
          estimatedMinutes: t.estimatedMinutes,
          orderIndex: t.orderIndex,
          learningPathId: t.learningPathId ?? null,
        });
      }
      setStep(5);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function goBack() {
    setError(null);
    if (step === 0) return;
    setStep((s) => (s - 1) as Step);
  }

  return (
    <section className="rounded-xl border border-border p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium">创建目标（{step + 1}/6）</h2>
        {onCancel && step > 0 && step < 5 && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            取消整个流程
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-4">
        {STEP_LABELS.map((label, i) => (
          <div
            key={i}
            className={`flex-1 h-1 rounded-full transition-colors ${
              i <= step ? "bg-accent" : "bg-muted"
            }`}
            title={label}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 mb-3">失败：{error}</p>
      )}

      {/* Step 0: 用户输入 */}
      {step === 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            用一两句话写下你想完成的事。不用整理，直接写就行。
          </p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="例如：我最近想学平面设计，以后可能想找设计相关工作，但是我完全是零基础，目前只会一点 Photoshop，也不知道应该先学什么。"
            rows={4}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex justify-end gap-2">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted"
              >
                取消
              </button>
            )}
            <button
              type="button"
              onClick={parseGoal}
              disabled={loading || !rawInput.trim()}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "AI 整理中..." : "AI 整理 →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 1: 确认目标 */}
      {step === 1 && parsedGoal && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">AI 整理出的目标，确认或修改后保存：</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">目标名称</label>
              <input
                type="text"
                value={parsedGoal.title}
                onChange={(e) => setParsedGoal({ ...parsedGoal, title: e.target.value })}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
                maxLength={100}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">描述（可选）</label>
              <textarea
                value={parsedGoal.description ?? ""}
                onChange={(e) => setParsedGoal({ ...parsedGoal, description: e.target.value || null })}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm resize-none"
                rows={2}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">预期结果（可选）</label>
              <input
                type="text"
                value={parsedGoal.expectedOutcome ?? ""}
                onChange={(e) => setParsedGoal({ ...parsedGoal, expectedOutcome: e.target.value || null })}
                className="w-full rounded border border-border bg-background px-2 py-1 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              ← 上一步
            </button>
            <button
              type="button"
              onClick={confirmGoal}
              disabled={loading || !parsedGoal.title.trim()}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "保存中..." : "确认并拆解阶段 →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 阶段 */}
      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            目标「{persistedGoal?.title}」已创建。AI 为你拆解了以下阶段，确认后继续：
          </p>
          {parsedStages ? (
            <ol className="space-y-2">
              {parsedStages.map((s, i) => (
                <li key={i} className="p-3 rounded-lg border border-border bg-background space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{i + 1}. {s.name}</span>
                    {s.durationDays && (
                      <span className="text-xs text-muted-foreground">{s.durationDays}天</span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
          )}
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              ← 上一步
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => persistedGoal && generateStages(persistedGoal.id)}
                disabled={loading}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                重新生成
              </button>
              <button
                type="button"
                onClick={confirmStages}
                disabled={loading || !parsedStages}
                className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
              >
                {loading ? "保存中..." : "确认并设定学习路径 →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: 学习路径 */}
      {step === 3 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            第一个阶段「{persistedStages[0]?.name}」。告诉产品你准备怎么学——一行一个，或写自然语言都行。
          </p>
          <textarea
            value={learningPathInput}
            onChange={(e) => { setLearningPathInput(e.target.value); parseUserLearningPath(); }}
            placeholder={"例如：\n4thecreatives 视频课程\nSharpen.design 练习\n临摹优秀作品"}
            rows={5}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent font-mono"
          />
          {learningPaths.length > 0 && (
            <div className="p-3 rounded-lg border border-accent/40 bg-accent/5">
              <p className="text-xs text-muted-foreground mb-2">产品将按以下学习路径记录（你自己决定的）：</p>
              <ul className="space-y-1 text-sm">
                {learningPaths.map((lp) => (
                  <li key={lp.orderIndex} className="flex items-center gap-2">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {lp.orderIndex + 1}
                    </span>
                    <span>{lp.title}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              ← 上一步
            </button>
            <button
              type="button"
              onClick={confirmLearningPaths}
              disabled={loading}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "保存中..." : "保存并拆解任务 →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: 任务 */}
      {step === 4 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            AI 根据你的学习路径拆出以下任务（阶段 {persistedStages[0]?.name}），确认后每天自动生成 SOP：
          </p>
          {parsedTasks ? (
            <ol className="space-y-2">
              {parsedTasks.map((t) => (
                <li key={t.orderIndex} className="p-3 rounded-lg border border-border bg-background space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{t.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{t.estimatedMinutes}分钟</span>
                  </div>
                  {t.description && (
                    <p className="text-xs text-muted-foreground">{t.description}</p>
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">加载中...</p>
          )}
          <div className="flex justify-between gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
            >
              ← 上一步
            </button>
            <button
              type="button"
              onClick={confirmTasks}
              disabled={loading || !parsedTasks}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "保存中..." : "确认并完成 →"}
            </button>
          </div>
        </div>
      )}

      {/* Step 5: 完成 */}
      {step === 5 && (
        <div className="space-y-4 text-center py-4">
          <div className="text-4xl">🎉</div>
          <h3 className="text-lg font-semibold">搞定了！</h3>
          <p className="text-sm text-muted-foreground">
            目标「{persistedGoal?.title}」已创建。回到「今日」就能看到今天先做什么。
          </p>
          <button
            type="button"
            onClick={onComplete}
            className="rounded-full bg-primary text-primary-foreground px-5 py-2 text-sm font-medium hover:opacity-90"
          >
            完成
          </button>
        </div>
      )}
    </section>
  );
}
