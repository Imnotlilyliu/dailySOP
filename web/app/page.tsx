'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  api,
  getStoredToken,
  type Goal,
  type Stage,
  type Task,
  type DailySop,
  type AiMinimumActionResult,
} from '@/lib/api';
import { TaskItem } from '@/components/TaskItem';

interface GoalBundle {
  goal: Goal;
  stage: Stage;
  tasks: Task[];
  sop: DailySop | null;
}

type LoadResult =
  | { kind: 'loading' }
  | { kind: 'unauth' }
  | { kind: 'error'; message: string }
  | { kind: 'no-goal' }
  | { kind: 'ok'; bundles: GoalBundle[]; today: string };

async function loadData(): Promise<LoadResult> {
  try {
    const goals = await api.get<Goal[]>('/api/goals');
    const activeGoals = goals.filter((g) => g.status === 'active');
    if (activeGoals.length === 0) return { kind: 'no-goal' };

    const today = new Date().toISOString().slice(0, 10);
    const bundles: GoalBundle[] = [];

    for (const goal of activeGoals) {
      const { stages } = await api.get<{ stages: Stage[] }>(
        `/api/goals/${goal.id}/stages`,
      );
      let current: Stage | undefined;
      if (goal.currentStageId) {
        current = stages.find((s) => s.id === goal.currentStageId);
      }
      if (!current) {
        current = stages.find((s) => s.status === 'in_progress') ?? stages[0];
      }
      if (!current) continue;

      const { tasks } = await api.get<{ tasks: Task[] }>(
        `/api/stages/${current.id}/tasks`,
      );

      let sop: DailySop | null = null;
      try {
        sop = await api.get<DailySop>(`/api/goals/${goal.id}/daily-sops/${today}`);
      } catch {
        try {
          sop = await api.post<DailySop>(`/api/goals/${goal.id}/daily-sops`, {
            date: today,
            stageId: current.id,
          });
        } catch {
          // 忽略
        }
      }

      bundles.push({ goal, stage: current, tasks, sop });
    }

    if (bundles.length === 0) return { kind: 'no-goal' };
    return { kind: 'ok', bundles, today };
  } catch (e) {
    const err = e as { status?: number };
    if (err?.status === 401) return { kind: 'unauth' };
    return { kind: 'error', message: (e as Error).message };
  }
}

export default function HomePage() {
  const [state, setState] = useState<LoadResult>({ kind: 'loading' });
  const [expanded, setExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [minimumAction, setMinimumAction] = useState<AiMinimumActionResult | null>(null);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    setMinimumAction(null);
    setExpanded(false);
    setState(await loadData());
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      setState({ kind: 'unauth' });
      return;
    }
    reload();
  }, [reload]);

  // AI 选最小动作 — 等数据加载完 + 有 pending tasks 时触发
  useEffect(() => {
    if (state.kind !== 'ok') return;
    if (minimumAction) return;

    const allPendingIds: string[] = [];
    let firstStageId: string | null = null;
    for (const b of state.bundles) {
      for (const t of b.tasks) {
        if (t.status === 'pending') {
          allPendingIds.push(t.id);
          if (!firstStageId) firstStageId = b.stage.id;
        }
      }
    }

    if (allPendingIds.length === 0) return;

    setAiLoading(true);
    setAiError(null);

    const payload: any = {
      date: state.today,
      candidateTaskIds: allPendingIds,
    };
    if (firstStageId) payload.stageId = firstStageId;

    api
      .post<AiMinimumActionResult>('/api/ai/minimum-action/generate', payload)
      .then((res) => {
        setMinimumAction(res);
      })
      .catch((e) => {
        setAiError((e as Error).message);
      })
      .finally(() => {
        setAiLoading(false);
      });
  }, [state, minimumAction]);

  async function regenerate() {
    if (state.kind !== 'ok') return;
    const allPendingIds: string[] = [];
    let firstStageId: string | null = null;
    for (const b of state.bundles) {
      for (const t of b.tasks) {
        if (t.status === 'pending') {
          allPendingIds.push(t.id);
          if (!firstStageId) firstStageId = b.stage.id;
        }
      }
    }
    if (allPendingIds.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    const payload: any = { date: state.today, candidateTaskIds: allPendingIds };
    if (firstStageId) payload.stageId = firstStageId;
    try {
      const res = await api.post<AiMinimumActionResult>(
        '/api/ai/minimum-action/generate',
        payload,
      );
      setMinimumAction(res);
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiLoading(false);
    }
  }

  if (state.kind === 'loading') {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }

  if (state.kind === 'unauth') {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">欢迎使用 Daily SOP</h1>
        <p className="text-muted-foreground mb-2">请先登录（顶部右上角「邮箱登录」）。</p>
        <p className="text-xs text-muted-foreground/70">登录后会自动创建账户，无需密码。</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>加载失败：{state.message}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 rounded-full border border-border px-4 py-1.5 text-xs hover:bg-muted"
        >
          重试
        </button>
      </div>
    );
  }

  if (state.kind === 'no-goal') {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">今天还没有目标</h1>
        <p className="text-muted-foreground mb-8">先去「目标」创建一个想做的事，再回到这里看今天做什么。</p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
        >
          去创建目标
        </a>
      </div>
    );
  }

  const { bundles, today } = state;

  const allPending: { bundle: GoalBundle; task: Task }[] = [];
  for (const b of bundles) {
    for (const t of b.tasks) {
      if (t.status === 'pending') allPending.push({ bundle: b, task: t });
    }
  }

  const groupedByGoal: Record<string, { bundle: GoalBundle; tasks: Task[] }> = {};
  for (const b of bundles) {
    groupedByGoal[b.goal.id] = { bundle: b, tasks: b.tasks.filter((t) => t.status === 'pending') };
  }

  const minimumActionTask = minimumAction
    ? allPending.find((x) => x.task.id === minimumAction.taskId)
    : null;

  const totalPendingMinutes = allPending.reduce((s, x) => s + x.task.estimatedMinutes, 0);
  const allDone = allPending.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-semibold mt-1">今天做什么？</h1>
      </header>

      {/* 最小动作卡片 — 默认显示 */}
      <section className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <p className="text-xs text-muted-foreground">今日只做这一件事</p>

        {allDone ? (
          <>
            <p className="text-lg font-medium mt-2">今天的任务都完成啦 🎉</p>
            <p className="text-xs text-muted-foreground mt-1">休息一下，或者去「目标」页加一个新目标。</p>
          </>
        ) : aiLoading ? (
          <p className="text-sm text-muted-foreground mt-2">AI 正在帮你挑一件先做的...</p>
        ) : aiError ? (
          <>
            <p className="text-sm text-red-500 mt-2">AI 不可用：{aiError}</p>
            <button
              type="button"
              onClick={regenerate}
              className="mt-2 rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
            >
              重试
            </button>
          </>
        ) : minimumAction ? (
          <>
            <p className="text-lg font-medium mt-2">{minimumAction.title}</p>
            {minimumAction.description && (
              <p className="text-xs text-muted-foreground mt-1">{minimumAction.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              预计 {minimumAction.estimatedMinutes} 分钟
              {minimumActionTask && (
                <> · {minimumActionTask.bundle.goal.title}</>
              )}
            </p>

            <div className="mt-3 flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90"
              >
                开始 →
              </button>
              <button
                type="button"
                onClick={regenerate}
                disabled={aiLoading}
                className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
              >
                换一个
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground mt-2">准备中...</p>
        )}
      </section>

      {/* 完整 SOP — 点击开始后展开 */}
      {expanded && !allDone && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              今日 SOP · 共 {allPending.length} 件事 · 约 {totalPendingMinutes} 分钟
            </p>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              收起 ▲
            </button>
          </div>

          {Object.values(groupedByGoal).map(({ bundle, tasks }) => (
            <section key={bundle.goal.id} className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium">{bundle.goal.title}</h3>
                <span className="text-xs text-muted-foreground">
                  {tasks.length} 件待办 · {bundle.stage.name}
                </span>
              </div>
              {tasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">当前阶段没有待办任务</p>
              ) : (
                <ul className="space-y-2">
                  {tasks.map((t) => (
                    <TaskItem key={t.id} task={t} />
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
