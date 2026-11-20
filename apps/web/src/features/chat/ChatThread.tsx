import { Bot, ChevronDown, UserRound, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/models";

function time(iso: string, locale: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/** Renders *bold* like WhatsApp does. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function ToolChip({ m }: { m: Message }) {
  const [open, setOpen] = useState(false);
  const payload = m.tool_payload as {
    input?: unknown;
    result?: unknown;
    is_error?: boolean;
  } | null;
  return (
    <div className="flex justify-center">
      <div className="max-w-[90%] text-xs">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border bg-background/80 px-2 py-0.5 font-mono text-muted-foreground",
            payload?.is_error && "border-destructive/40 text-destructive",
          )}
        >
          <Wrench className="h-3 w-3" /> {m.tool_name}
          <ChevronDown className={cn("h-3 w-3 transition", open && "rotate-180")} />
        </button>
        {open && (
          <pre className="mt-1 max-h-60 overflow-auto rounded-md border bg-background p-2 text-[10px] leading-snug">
            {JSON.stringify(payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

export function ChatThread({
  messages,
  showTools,
  typing,
  perspective = "customer",
}: {
  messages: Message[];
  showTools: boolean;
  typing?: boolean;
  /** "customer": the simulator phone (user on the right). "business": inbox (bot on the right). */
  perspective?: "customer" | "business";
}) {
  const { t, i18n } = useTranslation();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, typing]);

  return (
    <div className="space-y-2 p-3" aria-live="polite">
      {messages.map((m) => {
        if (m.role === "tool")
          return showTools && m.tool_name !== "human" ? <ToolChip key={m.id} m={m} /> : null;
        if (m.role === "system") return null;
        const fromCustomer = m.role === "user";
        const right = perspective === "customer" ? fromCustomer : !fromCustomer;
        const human = m.tool_name === "human";
        return (
          <div key={m.id} className={cn("flex", right ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm shadow-sm",
                right
                  ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21]"
                  : "rounded-tl-none bg-white text-[#111b21]",
              )}
            >
              {perspective === "business" && !fromCustomer && (
                <p className="mb-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#128C4A]">
                  {human ? <UserRound className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                  {human ? t("inbox.team") : t("inbox.bot")}
                </p>
              )}
              <WaText text={m.content} />
              <span className="ml-2 float-right mt-1 text-[10px] text-[#667781]">
                {time(m.created_at, i18n.language)}
              </span>
            </div>
          </div>
        );
      })}
      {typing && (
        <div className="flex justify-start">
          <div className="rounded-lg rounded-tl-none bg-white px-3 py-2 shadow-sm">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#667781]"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </span>
          </div>
        </div>
      )}
      <div ref={end} />
    </div>
  );
}
