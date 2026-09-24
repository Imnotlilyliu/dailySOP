"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type AiStageGenerateResult } from "@/lib/api";

export function StageGenerator({ goalId }: { goalId: string }) {
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<AiStageGenerateResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const result = await api.post<AiStageGenerateResult>(
        "/api/ai/stages/generate",
        { goalId },
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
    setCreating(true);
    setError(null);
    try {
      for (const stage of suggestion.stages) {
        await api.post(`/api/goals/${goalId}/stages`, {
          name: stage.name,
          description: stage.description,
          orderIndex: stage.orderIndex,
          durationDays: stage.durationDays,
        });
      }
      setSuggestion(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="pt-2">
      {suggestion ? (
        <div className="p-3 rounded-lg border border-accent/40 bg-accent/5">
          <p className="text-xs text-muted-foreground mb-2">
            AI 建议的 Stages（请确认）：
          </p>
          <ol className="space-y-1 text-sm">
            {suggestion.stages.map((s) => (
              <li key={s.orderIndex}>
                {s.orderIndex + 1}. {s.name}
                {s.durationDays && `（${s.durationDays}天）`}
                {s.description && (
                  <span className="text-muted-foreground text-xs ml-1">
                    — {s.description}
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={creating}
              className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
            >
              {creating ? "保存中..." : "确认保存"}
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted"
            >
              重新生成
            </button>
            <button
              type="button"
              onClick={() => setSuggestion(null)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted"
            >
              取消
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "AI 思考中..." : "AI 拆解 Stages"}
        </button>
      )}

      {error && (
        <p className="text-xs text-red-500 mt-2">失败：{error}</p>
      )}
    </div>
  );
}
