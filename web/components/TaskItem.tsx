"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type Task } from "@/lib/api";

export function TaskItem({ task }: { task: Task }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      if (task.status === "pending") {
        await api.post(`/api/tasks/${task.id}/complete`);
      } else {
        await api.post(`/api/tasks/${task.id}/uncomplete`);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const done = task.status === "completed";
  return (
    <li className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        aria-pressed={done}
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border flex items-center justify-center transition-colors ${
          done
            ? "bg-accent border-accent text-white"
            : "border-border hover:border-accent"
        } ${loading ? "opacity-50" : ""}`}
      >
        {done && (
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M3 8l3 3 7-7" />
          </svg>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            done ? "line-through text-muted-foreground" : ""
          }`}
        >
          {task.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {task.estimatedMinutes} 分钟
        </p>
        {error && (
          <p className="text-xs text-red-500 mt-1">操作失败：{error}</p>
        )}
      </div>
    </li>
  );
}
