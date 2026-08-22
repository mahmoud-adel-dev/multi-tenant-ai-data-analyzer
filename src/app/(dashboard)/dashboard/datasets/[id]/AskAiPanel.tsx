"use client";

/**
 * AI Q&A panel. Answers are grounded ONLY in verified analytical results;
 * the model is instructed to refuse when an answer isn't derivable.
 */
import { useState } from "react";
import { askDatasetQuestion } from "@/actions/analysis";
import { useI18n } from "@/i18n/LocaleProvider";

interface Exchange {
  question: string;
  answer: string | null;
  confidence: string | null;
  caveat: string | null;
  error: string | null;
}

export default function AskAiPanel({ datasetId, enabled }: { datasetId: string; enabled: boolean }) {
  const { d } = useI18n();
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);

  const ask = async () => {
    if (question.trim().length < 3) return;
    setBusy(true);
    const currentQuestion = question.trim();
    setHistory((h) => [...h, { question: currentQuestion, answer: null, confidence: null, caveat: null, error: null }]);
    setQuestion("");

    const res = await askDatasetQuestion(datasetId, currentQuestion);
    setHistory((h) => {
      const copy = [...h];
      const last = { ...copy[copy.length - 1] };
      if (res.success) {
        last.answer = res.data.answer;
        last.confidence = res.data.confidence;
        last.caveat = res.data.caveat;
      } else {
        last.error = res.error;
      }
      copy[copy.length - 1] = last;
      return copy;
    });
    setBusy(false);
  };

  if (!enabled) {
    return (
      <div style={emptyNote}>
        {d.workspace.askDisabled}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", maxWidth: "820px" }}>
      <p style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>
        {d.askAi.intro}.
      </p>

      {history.map((ex, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ alignSelf: "flex-end", background: "var(--accent-light)", color: "var(--accent-primary)", padding: "10px 14px", borderRadius: "14px 14px 4px 14px", fontSize: "13.5px", maxWidth: "80%" }}>
            {ex.question}
          </div>
          <div
            style={{
              alignSelf: "flex-start",
              background: ex.error ? "rgba(229,72,77,0.08)" : "var(--bg-card)",
              border: `1px solid ${ex.error ? "rgba(229,72,77,0.4)" : "var(--border-subtle)"}`,
              padding: "12px 16px",
              borderRadius: "14px 14px 14px 4px",
              fontSize: "13.5px",
              color: ex.error ? "#e5484d" : "var(--text-secondary)",
              lineHeight: 1.65,
              maxWidth: "90%",
              whiteSpace: "pre-line",
            }}
          >
            {ex.error ?? ex.answer}
            {!ex.error && ex.confidence && (
              <div style={{ marginTop: "8px", fontSize: "11px", display: "flex", gap: "8px", alignItems: "center" }}>
                <span style={{ padding: "2px 8px", borderRadius: "999px", background: "var(--bg-secondary)", fontWeight: 600 }}>
                  {d.askAi.confidence}: {ex.confidence}
                </span>
                {ex.caveat && <span style={{ color: "var(--text-muted)" }}>⚠ {ex.caveat}</span>}
              </div>
            )}
            {ex.answer === null && !ex.error && <span className="animate-pulse">…</span>}
          </div>
        </div>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
        style={{ display: "flex", gap: "10px", alignItems: "center" }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder={d.askAi.placeholder}
          maxLength={1000}
          disabled={busy}
          aria-label={d.askAi.askLabel}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: "10px",
            border: "1px solid var(--border-color)",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            fontSize: "14px",
          }}
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < 3}
          style={{
            padding: "12px 20px",
            borderRadius: "10px",
            background: "var(--brand-gradient)",
            color: "#fff",
            fontWeight: 600,
            fontSize: "14px",
            border: "none",
            cursor: busy ? "wait" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}

const emptyNote: React.CSSProperties = {
  textAlign: "center",
  padding: "48px 20px",
  border: "1px dashed var(--border-color)",
  borderRadius: "14px",
  color: "var(--text-muted)",
};
