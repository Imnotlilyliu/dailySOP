'use client';

import { useEffect, useState } from 'react';
import { api, type Goal, type Stage, type LearningPath } from "@/lib/api";

interface GoalRoute {
  goal: Goal;
  stages: Stage[];
  currentStage: Stage | null;
  learningPathsByStage: Record<string, LearningPath[]>;
}

type RouteResult =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-goal" }
  | { kind: "ok"; goalRoutes: GoalRoute[] };

async function loadData(): Promise<Exclude<RouteResult, { kind: "loading" }>> {
  try {
    const goals = await api.get<Goal[]>("/api/goals");
    const activeGoals = goals.filter((g) => g.status === "active");
    if (activeGoals.length === 0) return { kind: "no-goal" };

    const goalRoutes: GoalRoute[] = [];

    for (const goal of activeGoals) {
      const { stages } = await api.get<{ stages: Stage[] }>(
        `/api/goals/${goal.id}/stages`,
      );
      if (stages.length === 0) {
        goalRoutes.push({
          goal,
          stages: [],
          currentStage: null,
          learningPathsByStage: {},
        });
        continue;
      }

      const currentStage =
        stages.find((s) => s.id === goal.currentStageId) ??
        stages.find((s) => s.status === "in_progress") ??
        stages[0];

      const learningPathsByStage: Record<string, LearningPath[]> = {};
      for (const stage of stages) {
        try {
          const { learningPaths: lp } = await api.get<{ learningPaths: LearningPath[] }>(
            `/api/stages/${stage.id}/learning-paths`,
          );
          learningPathsByStage[stage.id] = lp;
        } catch {
          learningPathsByStage[stage.id] = [];
        }
      }

      goalRoutes.push({
        goal,
        stages,
        currentStage,
        learningPathsByStage,
      });
    }

    return { kind: "ok", goalRoutes };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

const STATUS_SYMBOL: Record<Stage["status"], string> = {
  completed: "✓",
  in_progress: "●",
  not_started: "○",
};

const STATUS_LABEL: Record<Stage["status"], string> = {
  completed: "已完成",
  in_progress: "进行中",
  not_started: "未开始",
};

export default function RoutePage() {
  const [state, setState] = useState<RouteResult>({ kind: "loading" });

  useEffect(() => {
    loadData().then(setState);
  }, []);

  if (state.kind === "loading") {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }

  if (state.kind === "error") {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>加载失败：{state.message}</p>
      </div>
    );
  }

  if (state.kind === "no-goal") {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">还没有目标</h1>
        <p className="text-muted-foreground mb-8">先去「目标」创建一个。</p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
        >
          去创建目标
        </a>
      </div>
    );
  }

  const { goalRoutes } = state;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">路线图</h1>
        <p className="text-sm text-muted-foreground mt-1">
          共 {goalRoutes.length} 个进行中的目标
        </p>
      </header>

      {goalRoutes.map(({ goal, stages, currentStage, learningPathsByStage }) => {
        const completedCount = stages.filter((s) => s.status === "completed").length;
        const overallProgress = stages.length > 0
          ? Math.round((completedCount / stages.length) * 100)
          : 0;

        return (
          <section key={goal.id} className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold">{goal.title}</h2>
                {goal.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                    {goal.description}
                  </p>
                )}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {completedCount}/{stages.length} 阶段 · {overallProgress}%
              </span>
            </div>

            {stages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                这个目标还没有拆解阶段，去「目标」页设置。
              </p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-5">
                {stages.map((stage, i) => {
                  const isCurrent = currentStage?.id === stage.id;
                  const lps = learningPathsByStage[stage.id] ?? [];
                  return (
                    <li key={stage.id} className="ml-6 relative">
                      <span
                        className={`absolute -left-[2.05rem] flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                          stage.status === "completed"
                            ? "bg-accent text-white"
                            : stage.status === "in_progress"
                              ? "bg-accent text-white"
                              : "bg-background border border-border text-muted-foreground"
                        }`}
                      >
                        {STATUS_SYMBOL[stage.status]}
                      </span>
                      <div className={`${isCurrent ? "p-3 rounded-lg border border-accent/40 bg-accent/5" : ""}`}>
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-medium">
                            {i + 1}. {stage.name}
                          </h3>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {STATUS_LABEL[stage.status]}
                            {stage.durationDays && ` · ${stage.durationDays}天`}
                          </span>
                        </div>
                        {stage.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {stage.description}
                          </p>
                        )}

                        {isCurrent && lps.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2">
                              当前阶段学习路径：
                            </p>
                            <ul className="space-y-1 text-sm">
                              {lps.map((lp) => (
                                <li key={lp.id} className="flex items-start gap-2">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground mt-0.5">
                                    {lp.type}
                                  </span>
                                  <span>{lp.title}</span>
                                  {lp.sourceType === "ai" && (
                                    <span className="text-xs text-accent">AI</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
