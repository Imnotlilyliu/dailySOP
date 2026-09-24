'use client';

import { useEffect, useState } from 'react';
import { api, type Goal, type Stage, type Task } from "@/lib/api";

type ProgressResult =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no-goal" }
  | { kind: "no-stages"; goal: Goal }
  | {
      kind: "ok";
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
    };

async function loadProgress(): Promise<Exclude<ProgressResult, { kind: "loading" }>> {
  try {
    const goals = await api.get<Goal[]>("/api/goals");
    const activeGoals = goals.filter((g) => g.status === "active");
    if (activeGoals.length === 0) return { kind: "no-goal" };

    const goal = activeGoals[0];
    const { stages } = await api.get<{ stages: Stage[] }>(
      `/api/goals/${goal.id}/stages`,
    );
    if (stages.length === 0) return { kind: "no-stages", goal };

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
        const totalMinutes = tasks.reduce(
          (sum, t) => sum + t.estimatedMinutes,
          0,
        );
        const completedMinutes = tasks
          .filter((t) => t.status === "completed")
          .reduce((sum, t) => sum + t.estimatedMinutes, 0);
        return {
          stage,
          total,
          completed,
          totalMinutes,
          completedMinutes,
        };
      }),
    );

    const totalTasks = stageStats.reduce((s, x) => s + x.total, 0);
    const completedTasks = stageStats.reduce((s, x) => s + x.completed, 0);
    const totalMinutes = stageStats.reduce((s, x) => s + x.totalMinutes, 0);
    const completedMinutes = stageStats.reduce(
      (s, x) => s + x.completedMinutes,
      0,
    );

    return {
      kind: "ok",
      goal,
      stageStats,
      totals: {
        totalTasks,
        completedTasks,
        totalMinutes,
        completedMinutes,
        stageCount: stages.length,
        completedStages: stages.filter((s) => s.status === "completed").length,
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

  if (state.kind === "no-stages") {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">{state.goal.title}</h1>
        <p className="text-muted-foreground mb-8">这个目标还没有 Stages。</p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
        >
          生成 Stages
        </a>
      </div>
    );
  }

  const { goal, stageStats, totals } = state;
  const taskPct = pct(totals.completedTasks, totals.totalTasks);
  const stagePct = pct(totals.completedStages, totals.stageCount);
  const minutePct = pct(totals.completedMinutes, totals.totalMinutes);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">进度</h1>
        <p className="text-sm text-muted-foreground mt-1">{goal.title}</p>
      </header>

      <section className="space-y-3">
        <ProgressBar
          label="任务完成"
          value={totals.completedTasks}
          total={totals.totalTasks}
          percent={taskPct}
          format={(v, t) => `${v} / ${t} 个`}
        />
        <ProgressBar
          label="阶段完成"
          value={totals.completedStages}
          total={totals.stageCount}
          percent={stagePct}
          format={(v, t) => `${v} / ${t} 个`}
        />
        <ProgressBar
          label="投入时间"
          value={totals.completedMinutes}
          total={totals.totalMinutes}
          percent={minutePct}
          format={(v, t) => `${formatMinutes(v)} / ${formatMinutes(t)}`}
        />
      </section>

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          各阶段明细
        </h2>
        <ul className="space-y-3">
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
      </section>
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
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{format(value, total)}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground text-right">{percent}%</p>
    </div>
  );
}
