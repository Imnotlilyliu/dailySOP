"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AiMinimumActionResult,
  type MinimumAction,
  type Task,
} from "@/lib/api";

interface MinimumActionProps {
  /** DailySop ID（前端今日页加载时创建好的 sop） */
  sopId: string;
  stageId: string;
  pendingTasks: Task[];
  today: string;
}

export function MinimumAction({
  sopId,
  stageId,
  pendingTasks,
  today,
}: MinimumActionProps) {
  const [suggestion, setSuggestion] = useState<AiMinimumActionResult | null>(
    null,
  );
  const [confirmed, setConfirmed] = useState<MinimumAction | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载已保存的最小动作（后端 API）
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ma = await api.get<MinimumAction | null>(
          `/api/daily-sops/${sopId}/minimum-action`,
        );
        if (!cancelled && ma) setConfirmed(ma);
      } catch {
        // 还没创建过，忽略
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sopId]);

  async function generateSuggestion() {
    if (pendingTasks.length === 0) {
      setError("当前没有待办任务，无法生成最小动作");
      return;
    }
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const candidateTaskIds = pendingTasks.map((t) => t.id);
      const result = await api.post<AiMinimumActionResult>(
        "/api/ai/minimum-action/generate",
        { date: today, stageId, candidateTaskIds },
      );
      setSuggestion(result);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function confirm() {
    if (!suggestion) return;
    setLoading(true);
    setError(null);
    try {
      // 1. 保存到 DB（POST /api/daily-sops/:sopId/minimum-action）
      const ma = await api.post<MinimumAction>(
        `/api/daily-sops/${sopId}/minimum-action`,
        {
          taskId: suggestion.taskId,
          title: suggestion.title,
          description: suggestion.description,
          estimatedMinutes: suggestion.estimatedMinutes,
        },
      );
      // 2. 设为今日全局最小动作（POST /api/daily-minimum-actions）
      try {
        await api.post("/api/daily-minimum-actions", {
          date: today,
          minimumActionId: ma.id,
        });
      } catch {
        // 全局最小动作已存在，忽略（每个 sop 一份，全局可选）
      }
      setConfirmed(ma);
      setSuggestion(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/api/daily-sops/${sopId}/minimum-action`);
      setConfirmed(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function completeAction() {
    if (!confirmed) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await api.post<MinimumAction>(
        `/api/minimum-actions/${confirmed.id}/complete`,
      );
      setConfirmed(updated);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (confirmed) {
    return (
      <section className="rounded-xl border border-accent/40 bg-accent/5 p-4">
        <p className="text-xs text-muted-foreground mb-1">
          今日最小动作
          {confirmed.completedAt && (
            <span className="ml-2 text-accent">已完成</span>
          )}
        </p>
        <p className="text-lg font-medium">{confirmed.title}</p>
        <p className="text-sm text-muted-foreground mt-1">
          预计 {confirmed.estimatedMinutes} 分钟
        </p>
        <div className="mt-3 flex gap-2">
          {!confirmed.completedAt && (
            <button
              type="button"
              onClick={completeAction}
              disabled={loading}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              标记完成
            </button>
          )}
          <button
            type="button"
            onClick={reset}
            disabled={loading || !!confirmed.completedAt}
            className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            重新选择
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-500 mt-2">失败：{error}</p>
        )}
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border p-4 bg-muted/30">
      <p className="text-xs text-muted-foreground mb-1">今日最小动作</p>
      {suggestion ? (
        <div>
          <p className="text-lg font-medium">{suggestion.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            预计 {suggestion.estimatedMinutes} 分钟
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={loading}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "保存中..." : "确认这个"}
            </button>
            <button
              type="button"
              onClick={generateSuggestion}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted"
            >
              再换一个
            </button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm text-muted-foreground">
            还没决定今天先做哪个？让 AI 帮你从当前待办中挑一个最小的。
          </p>
          <button
            type="button"
            onClick={generateSuggestion}
            disabled={loading || pendingTasks.length === 0}
            className="mt-3 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "AI 思考中..." : "生成最小动作建议"}
          </button>
          {error && (
            <p className="text-xs text-red-500 mt-2">失败：{error}</p>
          )}
        </div>
      )}
    </section>
  );
}
