"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, type AiGoalParseResult } from "@/lib/api";

export function GoalCreator({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [suggestion, setSuggestion] = useState<AiGoalParseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setSuggestion(null);
    try {
      const result = await api.post<AiGoalParseResult>("/api/ai/goal/parse", {
        rawText: text,
      });
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
      await api.post("/api/goals", {
        title: suggestion.goal.title,
        description: suggestion.goal.description,
        expectedOutcome: suggestion.goal.expectedOutcome,
      });
      setSuggestion(null);
      setText("");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="rounded-xl border border-border p-4 bg-muted/30">
      <h2 className="text-sm font-medium mb-2">创建目标</h2>
      <p className="text-xs text-muted-foreground mb-3">
        用一句话写下你想做的事，AI 帮你整理成结构化的目标。
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        placeholder="例如：我想在三个月内学会平面设计，能够接一些简单的海报设计单"
        rows={3}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
      />

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={parse}
          disabled={loading || !text.trim() || disabled}
          className="rounded-full bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "AI 整理中..." : "AI 整理"}
        </button>
        {disabled && (
          <span className="text-xs text-muted-foreground py-1.5">
            已有 3 个 active 目标，先完成或暂停一个
          </span>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 mt-2">失败：{error}</p>
      )}

      {suggestion && (
        <div className="mt-4 p-3 rounded-lg border border-accent/40 bg-accent/5">
          <p className="text-xs text-muted-foreground mb-2">AI 建议（请确认）：</p>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">标题</dt>
              <dd className="font-medium">{suggestion.goal.title}</dd>
            </div>
            {suggestion.goal.description && (
              <div>
                <dt className="text-xs text-muted-foreground">描述</dt>
                <dd>{suggestion.goal.description}</dd>
              </div>
            )}
            {suggestion.goal.expectedOutcome && (
              <div>
                <dt className="text-xs text-muted-foreground">预期成果</dt>
                <dd>{suggestion.goal.expectedOutcome}</dd>
              </div>
            )}
          </dl>
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
              onClick={() => setSuggestion(null)}
              className="rounded-full border border-border px-4 py-1.5 text-xs font-medium hover:bg-muted"
            >
              不要这个
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
