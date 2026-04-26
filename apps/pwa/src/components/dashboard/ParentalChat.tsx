import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { MessageCircle, Send, ShieldCheck, AlertTriangle } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import { friendlyErrorMessage } from "@/lib/friendly-error";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  ts: string;
  isError?: boolean;
  meta?: unknown;
};

function nowTs() {
  try {
    return new Date().toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "Ahora";
  }
}

function defaultWelcomeMessage(activeSection: string | undefined): ChatMessage {
  const section = typeof activeSection === "string" && activeSection ? activeSection : "dashboard";
  return {
    id: "welcome",
    role: "assistant",
    content:
      "Hola, soy tu Asistente Parental. Puedo ayudarte a entender alertas, niveles 1/2/3, acuerdos por edad y misiones educativas. " +
      "Cuéntame qué quieres lograr y en qué parte del dashboard estás.",
    ts: nowTs(),
    meta: { ui_context: { active_section: section } },
  };
}

export function ParentalChat({
  parentId,
  accessToken: _accessToken,
  enabled,
  activeSection,
}: {
  parentId: string | undefined | null;
  accessToken: string | undefined | null;
  enabled: boolean;
  activeSection: string;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [defaultWelcomeMessage(activeSection)]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  const canSend = useMemo(() => {
    if (!enabled || !parentId) return false;
    const trimmed = String(draft || "").trim();
    return trimmed.length >= 3 && !loading;
  }, [enabled, parentId, draft, loading]);

  useEffect(() => {
    setMessages((prev) => {
      if (!Array.isArray(prev) || prev.length === 0) return [defaultWelcomeMessage(activeSection)];
      if (prev[0]?.id !== "welcome") return prev;
      return [defaultWelcomeMessage(activeSection), ...prev.slice(1)];
    });
  }, [activeSection]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    window.setTimeout(() => {
      try {
        el.scrollIntoView({ block: "end", behavior: "smooth" });
      } catch {
        /* ignore */
      }
    }, 0);
  }, [messages.length, loading]);

  const send = useCallback(async () => {
    if (!canSend) return;
    const content = String(draft || "").trim();
    setDraft("");
    setError(null);

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      content,
      ts: nowTs(),
    };
    setMessages((prev) => [...prev, userMsg]);

    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/assistant/chat"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent_id: parentId,
          message: content,
          ui_context: { active_section: activeSection || "dashboard" },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new Error(body.message || body.error || `HTTP ${res.status}`);
      const reply = typeof body.reply === "string" ? body.reply : null;
      if (!reply) throw new Error("Respuesta del asistente inesperada.");
      const botMsg: ChatMessage = {
        id: `a_${Date.now()}`,
        role: "assistant",
        content: reply,
        ts: nowTs(),
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      setError(friendlyErrorMessage(e));
      const botMsg: ChatMessage = {
        id: `a_err_${Date.now()}`,
        role: "assistant",
        content:
          "No pude responder en este momento. Intenta de nuevo en unos segundos. " +
          "Si estás en modo desarrollo, revisa si el backend está levantado y si tu sesión está conectada.",
        ts: nowTs(),
        isError: true,
      };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  }, [canSend, draft, parentId, activeSection]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    send();
  };

  if (!enabled) {
    return (
      <section className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
        Sin datos en vivo para esta vista.
      </section>
    );
  }

  return (
    <Card className="shadow-card overflow-hidden border-border/80">
      <CardHeader className="pb-4 bg-gradient-to-br from-primary-subtle/70 via-card to-card border-b border-border/70">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/70 border border-primary/15 shadow-sm flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary" aria-hidden />
            </div>
            <div>
              <CardTitle className="font-display text-sm tracking-tight">Asistente Parental</CardTitle>
              <CardDescription className="text-xs">
                Respuestas prácticas sin invadir privacidad (Firewall Ciego).
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-safe-subtle border border-safe-border shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-safe" aria-hidden />
            <span className="text-[11px] font-semibold text-safe">Privacidad</span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-2xl border border-border/80 bg-muted/20 ring-1 ring-border/40">
          <ScrollArea className="h-72">
            <div className="p-4 sm:p-5 space-y-3">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <div
                    key={m.id}
                    className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}
                  >
                    {!isUser && (
                      <div className="mt-1 w-8 h-8 rounded-full bg-primary-subtle border border-primary/15 flex items-center justify-center shrink-0">
                        <MessageCircle className="w-4 h-4 text-primary" aria-hidden />
                      </div>
                    )}
                    <div
                      className={cn(
                        "max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 border text-sm leading-relaxed shadow-sm",
                        isUser
                          ? "bg-primary text-primary-foreground border-primary/20"
                          : "bg-card/90 backdrop-blur text-foreground border-border/70",
                        m.isError && "border-destructive/40 bg-destructive/10",
                      )}
                    >
                      <div className="markdown-body space-y-2 [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>p]:mb-2 [&_strong]:font-semibold [&>h3]:font-semibold [&>h3]:text-sm">
                        <ReactMarkdown>{m.content}</ReactMarkdown>
                      </div>
                      <p
                        className={cn(
                          "mt-2 text-[10px] opacity-80",
                          isUser ? "text-primary-foreground/80" : "text-muted-foreground",
                        )}
                      >
                        {m.ts}
                      </p>
                    </div>
                    {isUser && <div className="w-8 shrink-0" aria-hidden />}
                  </div>
                );
              })}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" aria-hidden />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        <div className="space-y-2">
          <div className="relative">
            <Textarea
              value={draft}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Escribe tu pregunta… (Enter para enviar · Shift+Enter para nueva línea)"
              disabled={loading}
              aria-label="Mensaje al asistente"
              className="min-h-[84px] rounded-2xl pr-12 bg-card/80 border-border/80 focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <Button
              type="button"
              onClick={send}
              disabled={!canSend}
              size="icon"
              className="absolute bottom-2.5 right-2.5 rounded-xl shadow-sm"
              aria-label={loading ? "Enviando" : "Enviar"}
            >
              <Send className="w-4 h-4" aria-hidden />
            </Button>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">No compartas datos sensibles (dirección, teléfono, etc.).</p>
            <p className="text-xs text-muted-foreground">{loading ? "Enviando…" : canSend ? "Listo para enviar" : ""}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default ParentalChat;

