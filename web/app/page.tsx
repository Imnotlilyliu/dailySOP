// web/app/page.tsx
// 今日页面（客户端渲染）：今天做什么？
// 业务链：直接读 DB → 当前 Stage 的 pending tasks → 用户勾选完成
//        + 今日最小动作：AI 生成建议 → 用户确认 → API 持久化到 MinimumAction + DailyMinimumAction
// 不调 AI 生成 SOP（直接读 DB），最小动作单独走 AI 建议。
//
// 渲染策略：client component — 未登录时显示 AuthBar（邮箱登录），登录后加载数据。

'use client';

import { useEffect, useState, useCallback } from 'react';
import { MinimumAction } from '@/components/MinimumAction';
import { TaskItem } from '@/components/TaskItem';
import { api, getStoredToken, type DailySop, type Goal, type Stage, type Task } from '@/lib/api';

type LoadResult =
  | { kind: 'loading' }
  | { kind: 'unauth' }
  | { kind: 'error'; message: string }
  | { kind: 'no-goal' }
  | { kind: 'no-stage'; goal: Goal }
  | { kind: 'ok'; goal: Goal; stage: Stage; tasks: Task[]; sop: DailySop | null; today: string };

async function loadData(): Promise<LoadResult> {
  try {
    const goals = await api.get<Goal[]>('/api/goals');
    const activeGoals = goals.filter((g) => g.status === 'active');
    if (activeGoals.length === 0) return { kind: 'no-goal' };

    const goal = activeGoals[0];
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

    if (!current) return { kind: 'no-stage', goal };

    const { tasks } = await api.get<{ tasks: Task[] }>(
      `/api/stages/${current.id}/tasks`,
    );

    // 确保 DailySop 存在（已存在则复用）
    const today = new Date().toISOString().slice(0, 10);
    let sop: DailySop | null = null;
    try {
      sop = await api.get<DailySop>(
        `/api/goals/${goal.id}/daily-sops/${today}`,
      );
    } catch {
      try {
        sop = await api.post<DailySop>(`/api/goals/${goal.id}/daily-sops`, {
          date: today,
          stageId: current.id,
        });
      } catch {
        try {
          sop = await api.get<DailySop>(
            `/api/goals/${goal.id}/daily-sops/${today}`,
          );
        } catch {
          // 仍失败 → 继续，最小动作功能不可用
        }
      }
    }

    return { kind: 'ok', goal, stage: current, tasks, sop, today };
  } catch (e) {
    const err = e as { status?: number };
    if (err?.status === 401) {
      return { kind: 'unauth' };
    }
    return { kind: 'error', message: (e as Error).message };
  }
}

export default function HomePage() {
  const [state, setState] = useState<LoadResult>({ kind: 'loading' });

  const reload = useCallback(async () => {
    setState({ kind: 'loading' });
    setState(await loadData());
  }, []);

  useEffect(() => {
    // 没有登录 token 时直接显示未登录状态
    if (!getStoredToken()) {
      setState({ kind: 'unauth' });
      return;
    }
    reload();
  }, [reload]);

  if (state.kind === 'loading') {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>加载中...</p>
      </div>
    );
  }

  if (state.kind === 'unauth') {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">欢迎使用 Daily SOP</h1>
        <p className="text-muted-foreground mb-2">
          请先登录（顶部右上角「邮箱登录」）。
        </p>
        <p className="text-xs text-muted-foreground/70">
          登录后会自动创建账户，无需密码。
        </p>
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
        <p className="text-muted-foreground mb-8">
          先去「目标」创建一个想做的事，再回到这里看今天做什么。
        </p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
        >
          去创建目标
        </a>
      </div>
    );
  }

  if (state.kind === 'no-stage') {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-semibold mb-3">{state.goal.title}</h1>
        <p className="text-muted-foreground mb-8">
          这个目标还没有 Stage。去「目标」页让 AI 帮你拆解阶段。
        </p>
        <a
          href="/goals"
          className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium"
        >
          拆解阶段
        </a>
      </div>
    );
  }

  const { goal, stage, tasks, sop, today } = state;
  const pendingTasks = tasks.filter((t) => t.status === 'pending');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs text-muted-foreground">{today}</p>
        <h1 className="text-2xl font-semibold mt-1">今天做什么？</h1>
        <p className="text-sm text-muted-foreground mt-1">
          目标：{goal.title} · 阶段：{stage.name}
        </p>
      </header>

      {sop && (
        <MinimumAction
          sopId={sop.id}
          stageId={stage.id}
          pendingTasks={pendingTasks}
          today={today}
        />
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          待办（{pendingTasks.length}）
        </h2>
        {pendingTasks.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            当前阶段没有待办任务。所有任务都完成啦。
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingTasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        )}
      </section>

      {completedTasks.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            已完成（{completedTasks.length}）
          </h2>
          <ul className="space-y-2">
            {completedTasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
