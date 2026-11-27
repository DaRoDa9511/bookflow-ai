import { Bot, UserRound } from "lucide-react";
import { useEffect, useRef } from "react";
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

/**
 * Conversation thread. Internal agent steps (tool calls) are never shown:
 * only what the customer and the business actually see.
 * - "customer": the simulator phone (WhatsApp look, customer on the right).
 * - "business": the inbox (neutral look, business replies on the right).
 */
export function ChatThread({
  messages,
  typing,
  perspective = "customer",
  onQuickReply,
}: {
  messages: Message[];
  typing?: boolean;
  perspective?: "customer" | "business";
  /** Simulator: tapping a template button sends its text as the customer. */
  onQuickReply?: (text: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const end = useRef<HTMLDivElement>(null);
  const visible = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && m.content,
  );

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible.length, typing]);

  const phone = perspective === "customer";

  return (
    <div className="space-y-2 p-3" aria-live="polite">
      {visible.map((m, idx) => {
        const fromCustomer = m.role === "user";
        const buttons = (m.tool_payload as { buttons?: string[] } | null)?.buttons ?? [];
        const isLast = idx === visible.length - 1;
        const right = phone ? fromCustomer : !fromCustomer;
        const human = m.tool_name === "human";
        return (
          <div key={m.id} className={cn("flex", right ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm",
                phone
                  ? right
                    ? "rounded-tr-none bg-[#d9fdd3] text-[#111b21] shadow-sm"
                    : "rounded-tl-none bg-white text-[#111b21] shadow-sm"
                  : right
                    ? "rounded-tr-none border border-primary/20 bg-primary/10 text-foreground"
                    : "rounded-tl-none border bg-card text-card-foreground",
              )}
            >
              {!phone && !fromCustomer && (
                <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  {human ? <UserRound className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                  {human ? t("inbox.team") : t("inbox.bot")}
                </p>
              )}
              <WaText text={m.content} />
              <span
                className={cn(
                  "float-right ml-2 mt-1 text-[10px]",
                  phone ? "text-[#667781]" : "text-muted-foreground",
                )}
              >
                {time(m.created_at, i18n.language)}
              </span>
              {buttons.length > 0 && (
                <div
                  className={cn(
                    "clear-both -mx-3 -mb-1.5 mt-2 flex border-t",
                    phone ? "border-black/10" : "border-border",
                  )}
                >
                  {buttons.map((b) => (
                    <button
                      key={b}
                      type="button"
                      disabled={!phone || !onQuickReply || !isLast}
                      onClick={() => onQuickReply?.(b)}
                      className={cn(
                        "flex-1 px-2 py-1.5 text-xs font-medium [&:not(:first-child)]:border-l",
                        phone
                          ? "border-black/10 text-[#008069] enabled:hover:bg-black/5 disabled:opacity-60"
                          : "text-muted-foreground",
                      )}
                    >
                      {b}
                    </button>
                  ))}
                </div>
              )}
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
