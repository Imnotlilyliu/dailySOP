'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, type Goal, type Stage } from "@/lib/api";
import { GoalCreator } from "@/components/GoalCreator";
import { StageGenerator } from "@/components/StageGenerator";

async function loadGoals(): Promise<Goal[]> {
  try {
    const goals = await api.get<Goal[]>("/api/goals");
    return goals.filter((g) => g.status !== "deleted");
  } catch {
    return [];
  }
}

async function loadStages(goalId: string): Promise<Stage[]> {
  try {
    const { stages } = await api.get<{ stages: Stage[] }>(
      `/api/goals/${goalId}/stages`,
    );
    return stages;
  } catch {
    return [];
  }
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);

  const reload = useCallback(async () => {
    setGoals(await loadGoals());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (goals === null) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }

  const activeGoals = goals.filter((g) => g.status === "active");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">我的目标</h1>
        <p className="text-sm text-muted-foreground mt-1">
          一个用户最多 3 个 active 目标
        </p>
      </header>

      <GoalCreator disabled={activeGoals.length >= 3} />

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          已有目标（{goals.length}）
        </h2>
        {goals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            还没有目标。用上面的输入框写一句话，AI 帮你整理。
          </p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => (
              <GoalItem key={g.id} goal={g} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GoalItem({ goal }: { goal: Goal }) {
  const [stages, setStages] = useState<Stage[] | null>(null);

  useEffect(() => {
    loadStages(goal.id).then(setStages);
  }, [goal.id]);

  const currentStage = stages?.find((s) => s.id === goal.currentStageId);
  const inProgress = stages?.find((s) => s.status === "in_progress");

  const statusLabel: Record<Goal["status"], string> = {
    active: "进行中",
    paused: "已暂停",
    completed: "已完成",
    deleted: "已删除",
  };

  return (
    <li className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-medium">{goal.title}</h3>
          {goal.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
              {goal.description}
            </p>
          )}
          {goal.expectedOutcome && (
            <p className="text-xs text-muted-foreground mt-1">
              预期：{goal.expectedOutcome}
            </p>
          )}
        </div>
        <span className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground shrink-0">
          {statusLabel[goal.status]}
        </span>
      </div>

      {stages && stages.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">
            Stages（{stages.length}）：
            {currentStage || inProgress
              ? `当前：${(currentStage ?? inProgress)?.name}`
              : "未开始"}
          </p>
          <ol className="text-xs text-muted-foreground space-y-0.5">
            {stages.map((s) => (
              <li key={s.id}>
                {s.status === "completed" ? "✓" : s.status === "in_progress" ? "●" : "○"}{" "}
                {s.name}（{s.durationDays ?? "?"}天）
              </li>
            ))}
          </ol>
        </div>
      )}

      {goal.status === "active" && stages !== null && stages.length === 0 && (
        <StageGenerator goalId={goal.id} />
      )}
    </li>
  );
}
