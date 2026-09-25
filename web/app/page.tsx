'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  api,
  getStoredToken,
  type Goal,
  type Stage,
  type Task,
  type DailySop,
  type AiMinimumActionResult,
} from '@/lib/api';

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

function formatDate(d: string) {
  const date = new Date(d + 'T00:00:00');
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${weekDays[date.getDay()]}`;
}

export default function HomePage() {
  const router = useRouter();
  const [state, setState] = useState<LoadResult>({ kind: 'loading' });
  const [started, setStarted] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [minimumAction, setMinimumAction] = useState<AiMinimumActionResult | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    setMinimumAction(null);
    setStarted(false);
    setState(await loadData());
  }, []);

  useEffect(() => {
    if (!getStoredToken()) {
      setState({ kind: 'unauth' });
      return;
    }
    reload();
  }, [reload]);

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
      .then((res) => setMinimumAction(res))
      .catch((e) => setAiError((e as Error).message))
      .finally(() => setAiLoading(false));
  }, [state, minimumAction]);

  if (state.kind === 'loading') {
    return <div className="text-center py-16 text-muted-foreground">加载中...</div>;
  }

  if (state.kind === 'unauth') {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">Daily SOP</h1>
        <p className="text-muted-foreground">请先登录（顶部右上角「邮箱登录」）。</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="text-center py-16 text-muted-foreground">
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
      <div className="text-center py-20">
        <h1 className="text-3xl font-semibold mb-3">今天还没有目标</h1>
        <p className="text-muted-foreground mb-8">先创建一个想做的事。</p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-6 py-3 text-sm font-medium"
        >
          创建目标
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
  const allDone = allPending.length === 0;

  const minimumActionTask = minimumAction
    ? allPending.find((x) => x.task.id === minimumAction.taskId)
    : null;

  const groupedByGoal: Record<string, { bundle: GoalBundle; pending: Task[] }> = {};
  for (const b of bundles) {
    groupedByGoal[b.goal.id] = { bundle: b, pending: b.tasks.filter((t) => t.status === 'pending') };
  }

  async function toggleTask(task: Task) {
    try {
      if (task.status === 'pending') {
        await api.post(`/api/tasks/${task.id}/complete`);
      } else {
        await api.post(`/api/tasks/${task.id}/uncomplete`);
      }
      reload();
    } catch (e) {
      // 静默
    }
  }

  return (
    <div className="space-y-10 pb-8">
      <header className="pt-2">
        <p className="text-sm text-muted-foreground">{formatDate(today)}</p>
        <h1 className="text-3xl font-semibold mt-2">
          {allDone ? '今天完成啦' : '现在做什么'}
        </h1>
      </header>

      {/* 核心行动 —— 唯一主 CTA */}
      <section>
        {allDone ? (
          <div className="rounded-2xl border border-border bg-muted/30 p-8 text-center">
            <p className="text-5xl mb-4">🎉</p>
            <p className="text-lg font-medium">今天的事都做完了</p>
            <p className="text-sm text-muted-foreground mt-2">休息一下，或者去「目标」加一个新方向。</p>
          </div>
        ) : aiLoading ? (
          <div className="rounded-2xl border border-border p-8 text-center">
            <p className="text-muted-foreground">正在为你挑一件先做的...</p>
          </div>
        ) : aiError ? (
          <div className="rounded-2xl border border-border p-8 text-center">
            <p className="text-red-500 text-sm">AI 暂不可用</p>
          </div>
        ) : minimumAction ? (
          <div className="rounded-2xl border border-foreground/10 bg-muted/20 p-6 space-y-5">
            <div>
              <p className="text-xs text-muted-foreground tracking-wide">现在只做这一件事</p>
              <p className="text-2xl font-semibold mt-3 leading-snug">
                {minimumAction.title}
              </p>
              {minimumAction.description && (
                <p className="text-sm text-muted-foreground mt-2">{minimumAction.description}</p>
              )}
            </div>

            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>⏱ 约 {minimumAction.estimatedMinutes} 分钟</span>
              {minimumActionTask && (
                <>
                  <span>·</span>
                  <span>{minimumActionTask.bundle.goal.title}</span>
                </>
              )}
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStarted(true)}
                className="flex-1 rounded-full bg-foreground text-background py-3 text-base font-medium hover:opacity-90"
              >
                开始
              </button>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="rounded-full border border-border px-4 py-3 text-sm hover:bg-muted"
              >
                不知道怎么做
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* 展开后的完整今日任务 */}
      {started && !allDone && (
        <section className="space-y-6">
          <p className="text-sm text-muted-foreground">
            今日 · 共 {allPending.length} 件事
          </p>

          {Object.values(groupedByGoal).map(({ bundle, pending }) => (
            <div key={bundle.goal.id} className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {bundle.goal.title} · {bundle.stage.name}
              </p>
              {pending.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleTask(t)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-border hover:bg-muted/30 text-left transition-colors"
                >
                  <span className="h-5 w-5 shrink-0 rounded-full border border-border" />
                  <span className="flex-1 text-sm">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.estimatedMinutes}分</span>
                </button>
              ))}
            </div>
          ))}
        </section>
      )}

      {/* 不知道怎么做 — 极简状态 UI */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/80 flex items-end"
          onClick={() => setHelpOpen(false)}
        >
          <div
            className="w-full max-w-2xl mx-auto bg-background border-t border-border rounded-t-2xl p-6 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium mb-2">遇到困难了？</p>
            {[
              '不知道从哪里开始',
              '任务太难',
              '没时间',
              '不知道学习什么',
              '不想继续这个目标',
            ].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  setHelpOpen(false);
                  alert('这个功能还在做，先去歇一下吧 ✨');
                }}
                className="w-full text-left px-4 py-3 rounded-xl border border-border hover:bg-muted/30 text-sm"
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="w-full text-center py-3 text-sm text-muted-foreground"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
