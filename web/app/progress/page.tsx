'use client';

import { useEffect, useState } from 'react';
import { api, type Goal, type Stage, type Task } from "@/lib/api";

interface GoalProgress {
  goal: Goal;
  stageStats: {
    stage: Stage;
    total: number;
    completed: number;
    totalMinutes: number;
    completedMinutes: number;
  }[];
  totals: {
    totalTasks: number;
    completedTasks: number;
    totalMinutes: number;
    completedMinutes: number;
    stageCount: number;
    completedStages: number;
  };
}

type ProgressResult =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-goal" }
  | { kind: "ok"; goalProgressList: GoalProgress[]; grandTotals: GoalProgress["totals"] };

async function loadProgress(): Promise<Exclude<ProgressResult, { kind: "loading" }>> {
  try {
    const goals = await api.get<Goal[]>("/api/goals");
    const activeGoals = goals.filter((g) => g.status === "active");
    if (activeGoals.length === 0) return { kind: "no-goal" };

    const goalProgressList: GoalProgress[] = [];
    let grandTotalTasks = 0;
    let grandCompletedTasks = 0;
    let grandTotalMinutes = 0;
    let grandCompletedMinutes = 0;
    let grandStageCount = 0;
    let grandCompletedStages = 0;

    for (const goal of activeGoals) {
      const { stages } = await api.get<{ stages: Stage[] }>(
        `/api/goals/${goal.id}/stages`,
      );

      const stageStats = await Promise.all(
        stages.map(async (stage) => {
          let tasks: Task[] = [];
          try {
            const { tasks: t } = await api.get<{ tasks: Task[] }>(
              `/api/stages/${stage.id}/tasks`,
            );
            tasks = t;
          } catch {
            // ignore
          }
          const total = tasks.length;
          const completed = tasks.filter((t) => t.status === "completed").length;
          const totalMinutes = tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0);
          const completedMinutes = tasks
            .filter((t) => t.status === "completed")
            .reduce((sum, t) => sum + t.estimatedMinutes, 0);
          return { stage, total, completed, totalMinutes, completedMinutes };
        }),
      );

      const totalTasks = stageStats.reduce((s, x) => s + x.total, 0);
      const completedTasks = stageStats.reduce((s, x) => s + x.completed, 0);
      const totalMinutes = stageStats.reduce((s, x) => s + x.totalMinutes, 0);
      const completedMinutes = stageStats.reduce((s, x) => s + x.completedMinutes, 0);
      const completedStages = stages.filter((s) => s.status === "completed").length;

      grandTotalTasks += totalTasks;
      grandCompletedTasks += completedTasks;
      grandTotalMinutes += totalMinutes;
      grandCompletedMinutes += completedMinutes;
      grandStageCount += stages.length;
      grandCompletedStages += completedStages;

      goalProgressList.push({
        goal,
        stageStats,
        totals: {
          totalTasks,
          completedTasks,
          totalMinutes,
          completedMinutes,
          stageCount: stages.length,
          completedStages,
        },
      });
    }

    return {
      kind: "ok",
      goalProgressList,
      grandTotals: {
        totalTasks: grandTotalTasks,
        completedTasks: grandCompletedTasks,
        totalMinutes: grandTotalMinutes,
        completedMinutes: grandCompletedMinutes,
        stageCount: grandStageCount,
        completedStages: grandCompletedStages,
      },
    };
  } catch (e) {
    return { kind: "error", message: (e as Error).message };
  }
}

function pct(n: number, d: number): number {
  if (d === 0) return 0;
  return Math.round((n / d) * 100);
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}小时` : `${h}小时${m}分`;
}

export default function ProgressPage() {
  const [state, setState] = useState<ProgressResult>({ kind: "loading" });

  useEffect(() => {
    loadProgress().then(setState);
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

  const { goalProgressList, grandTotals } = state;
  const taskPct = pct(grandTotals.completedTasks, grandTotals.totalTasks);
  const stagePct = pct(grandTotals.completedStages, grandTotals.stageCount);
  const minutePct = pct(grandTotals.completedMinutes, grandTotals.totalMinutes);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">进度</h1>
        <p className="text-sm text-muted-foreground mt-1">
          共 {goalProgressList.length} 个进行中的目标
        </p>
      </header>

      {/* 全局汇总 */}
      <section className="space-y-3 rounded-xl border border-border p-4 bg-muted/20">
        <h2 className="text-sm font-medium text-muted-foreground">总览</h2>
        <ProgressBar
          label="任务完成"
          value={grandTotals.completedTasks}
          total={grandTotals.totalTasks}
          percent={taskPct}
          format={(v, t) => `${v} / ${t} 个`}
        />
        <ProgressBar
          label="阶段完成"
          value={grandTotals.completedStages}
          total={grandTotals.stageCount}
          percent={stagePct}
          format={(v, t) => `${v} / ${t} 个`}
        />
        <ProgressBar
          label="投入时间"
          value={grandTotals.completedMinutes}
          total={grandTotals.totalMinutes}
          percent={minutePct}
          format={(v, t) => `${formatMinutes(v)} / ${formatMinutes(t)}`}
        />
      </section>

      {/* 每个 goal 的明细 */}
      {goalProgressList.map(({ goal, stageStats, totals }) => {
        const taskP = pct(totals.completedTasks, totals.totalTasks);
        return (
          <section key={goal.id} className="rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{goal.title}</h2>
              <span className="text-xs text-muted-foreground">
                {totals.completedTasks}/{totals.totalTasks} 任务 · {taskP}%
              </span>
            </div>

            {stageStats.length === 0 ? (
              <p className="text-xs text-muted-foreground">还没有阶段数据。</p>
            ) : (
              <ul className="space-y-2">
                {stageStats.map(({ stage, total, completed, totalMinutes, completedMinutes }) => (
                  <li key={stage.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-medium">{stage.name}</h3>
                      <span className="text-xs text-muted-foreground">
                        {stage.status === "completed"
                          ? "已完成"
                          : stage.status === "in_progress"
                            ? "进行中"
                            : "未开始"}
                      </span>
                    </div>
                    {total > 0 ? (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            任务 {completed}/{total} ·{" "}
                            {formatMinutes(completedMinutes)}/
                            {formatMinutes(totalMinutes)}
                          </span>
                          <span>{pct(completed, total)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all"
                            style={{ width: `${pct(completed, total)}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        还没有 Task
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  percent,
  format,
}: {
  label: string;
  value: number;
  total: number;
  percent: number;
  format: (value: number, total: number) => string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{format(value, total)}</span>
      </div>
      <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground text-right">{percent}%</p>
    </div>
  );
}
