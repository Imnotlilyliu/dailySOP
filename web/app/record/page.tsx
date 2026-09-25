'use client';

import { useEffect, useState } from 'react';
import { api, type Goal, type Stage, type Task } from '@/lib/api';

interface FlatTask extends Task {
  goalTitle: string;
  stageName: string;
}

async function loadAll(): Promise<FlatTask[]> {
  const goals = await api.get<Goal[]>('/api/goals');
  const activeGoals = goals.filter((g) => g.status !== 'deleted');
  const flat: FlatTask[] = [];

  for (const goal of activeGoals) {
    const { stages } = await api.get<{ stages: Stage[] }>(`/api/goals/${goal.id}/stages`);
    for (const stage of stages) {
      const { tasks } = await api.get<{ tasks: Task[] }>(`/api/stages/${stage.id}/tasks`);
      for (const t of tasks) {
        flat.push({ ...t, goalTitle: goal.title, stageName: stage.name });
      }
    }
  }
  return flat;
}

function weekRange(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(now);
  start.setDate(now.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function dateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string) {
  const d1 = new Date(a + 'T00:00:00');
  const d2 = new Date(b + 'T00:00:00');
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

export default function RecordPage() {
  const [tasks, setTasks] = useState<FlatTask[] | null>(null);

  useEffect(() => {
    loadAll().then(setTasks);
  }, []);

  if (tasks === null) {
    return <div className="text-center py-12 text-muted-foreground">加载中...</div>;
  }

  const { start, end } = weekRange();
  const startStr = dateStr(start);
  const endStr = dateStr(end);

  const completed = tasks.filter((t) => t.status === 'completed' && t.completedAt);

  const weekCompleted = completed.filter((t) => {
    const d = new Date(t.completedAt!);
    return d >= start && d <= end;
  });

  const weekMinutes = weekCompleted.reduce((s, t) => s + t.estimatedMinutes, 0);

  const completionDates = new Set(
    completed.map((t) => new Date(t.completedAt!).toISOString().slice(0, 10))
  );
  const today = new Date().toISOString().slice(0, 10);

  let streak = 0;
  let cursor = new Date(today);
  while (completionDates.has(dateStr(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  const last7Days: { date: string; label: string; count: number }[] = [];
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = dateStr(d);
    const count = completed.filter(
      (t) => new Date(t.completedAt!).toISOString().slice(0, 10) === ds
    ).length;
    last7Days.push({
      date: ds,
      label: weekDays[d.getDay()],
      count,
    });
  }

  const recent = [...completed]
    .sort((a, b) => (b.completedAt! < a.completedAt! ? -1 : 1))
    .slice(0, 10);

  const hasAnyData = tasks.length > 0 || completed.length > 0;

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-3xl font-semibold">记录</h1>
      </header>

      {!hasAnyData ? (
        <div className="text-center py-16 text-muted-foreground">
          <p>还没有任何记录。先去完成一个任务吧。</p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-3 gap-4">
            <StatCard label="本周完成" value={weekCompleted.length.toString()} suffix="件" />
            <StatCard label="本周投入" value={weekMinutes.toString()} suffix="分钟" />
            <StatCard label="连续天数" value={streak.toString()} suffix="天" />
          </section>

          <section>
            <p className="text-sm font-medium text-muted-foreground mb-4">最近 7 天</p>
            <div className="flex items-end gap-2 h-24">
              {last7Days.map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-foreground/80 rounded-t"
                    style={{
                      height: `${Math.min(100, d.count * 20)}%`,
                      minHeight: d.count > 0 ? '4px' : '0px',
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{d.label}</span>
                </div>
              ))}
            </div>
          </section>

          {recent.length > 0 && (
            <section>
              <p className="text-sm font-medium text-muted-foreground mb-3">最近完成</p>
              <ul className="space-y-2">
                {recent.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-4 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{t.title}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {t.goalTitle} · {t.stageName}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(t.completedAt!).toLocaleDateString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-2">
        {value}
        <span className="text-sm font-normal text-muted-foreground ml-1">{suffix}</span>
      </p>
    </div>
  );
}
