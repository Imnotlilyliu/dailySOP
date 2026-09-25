"use client";

import { useState } from "react";
import { api, type AiGoalParseResult, type AiStageGenerateResult, type AiTaskGenerateResult } from "@/lib/api";

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

interface ParsedTask {
  title: string;
  description: string | null;
  estimatedMinutes: number;
  orderIndex: number;
}

type FlowStep = "input" | "generating" | "confirming" | "done";

export function GoalWizard({ onComplete, onCancel }: { onComplete: () => void; onCancel?: () => void }) {
  const [step, setStep] = useState<FlowStep>("input");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState("");

  const [rawInput, setRawInput] = useState("");
  const [parsedGoal, setParsedGoal] = useState<ParsedGoal | null>(null);
  const [parsedStages, setParsedStages] = useState<ParsedStage[]>([]);
  const [parsedTasks, setParsedTasks] = useState<ParsedTask[]>([]);
  const [persistedGoalTitle, setPersistedGoalTitle] = useState<string>("");

  async function startPlanning() {
    if (!rawInput.trim()) return;
    setStep("generating");
    setError(null);

    try {
      setPhase("AI 整理目标...");
      const goalRes = await api.post<AiGoalParseResult>("/api/ai/goal/parse", { rawText: rawInput });
      const goal: ParsedGoal = {
        title: goalRes.goal.title,
        description: goalRes.goal.description,
        expectedOutcome: goalRes.goal.expectedOutcome,
      };
      setParsedGoal(goal);

      setPhase("保存目标...");
      const created = await api.post<{ goal: { id: string } }>("/api/goals", {
        title: goal.title,
        description: goal.description,
        expectedOutcome: goal.expectedOutcome,
      });
      const goalId = created.goal.id;
      setPersistedGoalTitle(goal.title);

      setPhase("拆解阶段...");
      const stagesRes = await api.post<AiStageGenerateResult>("/api/ai/stages/generate", { goalId });
      const stages: ParsedStage[] = stagesRes.stages.map((s) => ({
        name: s.name,
        description: s.description,
        orderIndex: s.orderIndex,
        durationDays: s.durationDays,
      }));
      setParsedStages(stages);

      setPhase("保存阶段...");
      let firstStageId: string | null = null;
      for (const s of stagesRes.stages) {
        const r = await api.post<{ stage: { id: string } }>(
          `/api/goals/${goalId}/stages`,
          {
            name: s.name,
            description: s.description,
            orderIndex: s.orderIndex,
            durationDays: s.durationDays,
          }
        );
        if (!firstStageId) firstStageId = r.stage.id;
      }

      if (!firstStageId) throw new Error("阶段创建失败");

      setPhase("拆解任务...");
      const tasksRes = await api.post<AiTaskGenerateResult>("/api/ai/tasks/generate", {
        stageId: firstStageId,
      });
      const tasks: ParsedTask[] = tasksRes.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        estimatedMinutes: t.estimatedMinutes,
        orderIndex: t.orderIndex,
      }));
      setParsedTasks(tasks);

      setPhase("保存任务...");
      for (const t of tasksRes.tasks) {
        await api.post(`/api/stages/${firstStageId}/tasks`, {
          title: t.title,
          description: t.description,
          estimatedMinutes: t.estimatedMinutes,
          orderIndex: t.orderIndex,
          learningPathId: t.learningPathId ?? null,
        });
      }

      setStep("confirming");
    } catch (e) {
      setError((e as Error).message);
      setStep("input");
    }
  }

  return (
    <section className="rounded-xl border border-border p-6 bg-muted/20">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-sm font-medium text-muted-foreground">创建目标</h2>
        {onCancel && step !== "done" && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            取消
          </button>
        )}
      </div>

      {error && step === "input" && (
        <p className="text-xs text-red-500 mb-3">失败：{error}</p>
      )}

      {step === "input" && (
        <div className="space-y-5">
          <p className="text-sm text-muted-foreground">
            写一句话，你想在多久内做到什么。
          </p>
          <textarea
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="例如：我想在3个月内学会基础平面设计"
            rows={3}
            className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base resize-none focus:outline-none focus:ring-2 focus:ring-foreground/25"
          />
          <button
            type="button"
            onClick={startPlanning}
            disabled={!rawInput.trim()}
            className="w-full rounded-full bg-foreground text-background py-3 text-base font-medium hover:opacity-90 disabled:opacity-50"
          >
            开始规划
          </button>
        </div>
      )}

      {step === "generating" && (
        <div className="space-y-4 py-6 text-center">
          <div className="animate-pulse text-2xl">✨</div>
          <p className="text-sm text-muted-foreground">{phase}</p>
        </div>
      )}

      {step === "confirming" && parsedGoal && (
        <div className="space-y-6">
          <div>
            <p className="text-xs text-muted-foreground">目标</p>
            <p className="text-xl font-semibold mt-1">{parsedGoal.title}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">共 {parsedStages.length} 个阶段</p>
            <ol className="space-y-1">
              {parsedStages.map((s, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  {i + 1}. {s.name}
                  {s.durationDays ? <span className="ml-1 text-xs">· {s.durationDays}天</span> : null}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2">第一个阶段（{parsedStages[0]?.name}）有 {parsedTasks.length} 件可做的事</p>
            <ul className="space-y-1">
              {parsedTasks.slice(0, 5).map((t, i) => (
                <li key={i} className="text-sm text-muted-foreground">
                  · {t.title} <span className="text-xs">· {t.estimatedMinutes}分</span>
                </li>
              ))}
              {parsedTasks.length > 5 && (
                <li className="text-xs text-muted-foreground">+{parsedTasks.length - 5} 更多</li>
              )}
            </ul>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setStep("input")}
              className="rounded-full border border-border px-5 py-2 text-sm hover:bg-muted"
            >
              改一下
            </button>
            <button
              type="button"
              onClick={() => { setStep("done"); setTimeout(onComplete, 300); }}
              className="flex-1 rounded-full bg-foreground text-background py-2 text-sm font-medium hover:opacity-90"
            >
              确认，进入今天 →
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-6">
          <div className="text-4xl mb-3">🎉</div>
          <p className="text-sm text-muted-foreground">「{persistedGoalTitle}」已就绪</p>
        </div>
      )}
    </section>
  );
}
