'use client';

import { useEffect, useState, useCallback } from 'react';
import { api, type Goal, type Stage, type Task } from "@/lib/api";
import { GoalWizard } from "@/components/GoalWizard";

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

async function loadTasks(stageId: string): Promise<Task[]> {
  try {
    const { tasks } = await api.get<{ tasks: Task[] }>(
      `/api/stages/${stageId}/tasks`,
    );
    return tasks;
  } catch {
    return [];
  }
}

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

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
  const atCapacity = activeGoals.length >= 3;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">目标</h1>
      </header>

      {wizardOpen ? (
        <GoalWizard
          onComplete={() => { setWizardOpen(false); reload(); }}
          onCancel={() => setWizardOpen(false)}
        />
      ) : (
        <section>
          {atCapacity ? (
            <p className="text-sm text-muted-foreground py-2">
              已有 3 个进行中的目标，先暂停或完成一个再来创建。
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="w-full rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
            >
              + 创建新目标
            </button>
          )}
        </section>
      )}

      {!wizardOpen && goals.length > 0 && (
        <section className="space-y-4">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} onChanged={reload} />
          ))}
        </section>
      )}
    </div>
  );
}

function GoalCard({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const [stages, setStages] = useState<Stage[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const s = await loadStages(goal.id);
      setStages(s);
      let currentId = goal.currentStageId;
      if (!currentId) {
        const prog = s.find((x) => x.status === "in_progress") ?? s[0];
        currentId = prog?.id;
      }
      if (currentId) {
        const t = await loadTasks(currentId);
        setTasks(t);
      }
    })();
  }, [goal.id, goal.currentStageId]);

  const currentStage = stages?.find((s) => s.id === goal.currentStageId)
    ?? stages?.find((s) => s.status === "in_progress")
    ?? stages?.[0];

  const completedStages = stages?.filter((s) => s.status === "completed").length ?? 0;
  const totalStages = stages?.length ?? 0;

  const completedTasks = tasks?.filter((t) => t.status === "completed").length ?? 0;
  const totalTasks = tasks?.length ?? 0;

  async function togglePause() {
    setSaving(true);
    try {
      await api.patch(`/api/goals/${goal.id}`, {
        status: goal.status === "active" ? "paused" : "active",
      });
      setMenuOpen(false);
      onChanged();
    } catch (e) {
      alert("操作失败：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setSaving(true);
    try {
      await api.delete(`/api/goals/${goal.id}`);
      setMenuOpen(false);
      onChanged();
    } catch (e) {
      alert("删除失败：" + (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const statusColor = goal.status === "paused"
    ? "text-muted-foreground"
    : goal.status === "completed"
    ? "text-green-600"
    : "text-foreground";

  return (
    <div className={`rounded-2xl border border-border p-5 space-y-4 ${goal.status !== "active" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className={`text-lg font-medium ${statusColor}`}>{goal.title}</h3>
          {currentStage && (
            <p className="text-sm text-muted-foreground mt-1">
              当前：{currentStage.name}
            </p>
          )}
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground px-2 py-1"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-7 z-10 bg-background border border-border rounded-lg shadow-lg p-1 min-w-[120px]">
              <button
                type="button"
                onClick={togglePause}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted rounded-md disabled:opacity-50"
              >
                {goal.status === "active" ? "暂停" : "恢复"}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving}
                className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-md disabled:opacity-50"
              >
                删除
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6 text-sm">
        <span className="text-muted-foreground">
          阶段 {completedStages}/{totalStages}
        </span>
        {totalTasks > 0 && (
          <span className="text-muted-foreground">
            今天 {completedTasks}/{totalTasks}
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => window.location.href = "/"}
        disabled={goal.status !== "active"}
        className="w-full rounded-full bg-foreground text-background py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-40"
      >
        {goal.status === "active" ? "继续 →" : goal.status === "paused" ? "已暂停" : "已完成"}
      </button>
    </div>
  );
}
