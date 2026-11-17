"use client";
import { useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/primitives";
import { Markdown } from "@/components/markdown";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

const LEVELS = [
  { v: 1, l: "1 · Pregunta orientadora" },
  { v: 2, l: "2 · Pista conceptual" },
  { v: 3, l: "3 · Ejemplo relacionado" },
  { v: 4, l: "4 · Explicación detallada" },
  { v: 5, l: "5 · Solución parcial guiada" },
];

const SUGGESTIONS = ["¿Cuál sería el siguiente paso?", "No entiendo por qué necesito este concepto", "Necesito una explicación más matemática", "Recomiéndame otra fuente"];

export function TutorChat({
  projectId,
  moduleId,
  moduleConceptId,
  initialConversationId,
  initialMessages,
  defaultLevel,
}: {
  projectId: string;
  moduleId: string;
  moduleConceptId?: string;
  initialConversationId?: string;
  initialMessages: Msg[];
  defaultLevel: number;
}) {
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [input, setInput] = useState("");
  const [level, setLevel] = useState(defaultLevel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setError(null);
    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/tutor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, moduleId, moduleConceptId, conversationId, message: text, helpLevel: level }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "El tutor no está disponible.");
      }
      const cid = res.headers.get("X-Conversation-Id");
      if (cid) setConversationId(cid);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1]!;
          copy[copy.length - 1] = { ...last, content: last.content + chunk };
          return copy;
        });
        endRef.current?.scrollIntoView({ block: "nearest" });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setMessages((m) => (m[m.length - 1]?.content === "" ? m.slice(0, -1) : m));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <label htmlFor="help-level" className="shrink-0 text-xs text-muted-foreground">Ayuda</label>
        <Select id="help-level" value={level} onChange={(e) => setLevel(Number(e.target.value))} className="h-8 text-xs">
          {LEVELS.map((l) => <option key={l.v} value={l.v}>{l.l}</option>)}
        </Select>
      </div>
      <div className="max-h-[28rem] min-h-40 flex-1 space-y-3 overflow-y-auto rounded-md border bg-background p-3" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Tu tutor conoce tu proyecto, el módulo y tu progreso. Te guiará sin resolverlo por ti.</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border px-2 py-1 text-xs hover:bg-muted">{s}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-6 rounded-lg bg-accent px-3 py-2 text-sm" : "mr-2"}>
            {m.role === "assistant" ? (m.content ? <Markdown>{m.content}</Markdown> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />) : m.content}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
      <form
        className="mt-2 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
          placeholder="Pregunta al tutor…"
          className="min-h-10 resize-none"
          rows={2}
          maxLength={8000}
          aria-label="Mensaje para el tutor"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Enviar">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </form>
    </div>
  );
}
