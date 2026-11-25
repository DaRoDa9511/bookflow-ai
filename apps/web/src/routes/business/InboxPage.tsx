import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Hand, MessageSquare, Send, Smartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Skeleton, Switch } from "@/components/ui/misc";
import { useChatRealtime, useConversations, useMessages } from "@/features/chat/api";
import { ChatThread } from "@/features/chat/ChatThread";
import { useBusiness } from "@/lib/auth";
import { invokeFunction, supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/models";

export default function InboxPage() {
  const { t, i18n } = useTranslation();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyHandoff, setOnlyHandoff] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  useChatRealtime(business.id);

  const convQ = useConversations(business.id);
  const list = (convQ.data ?? []).filter((c) => !onlyHandoff || c.handoff_to_human);
  const selected = convQ.data?.find((c) => c.id === selectedId) ?? null;
  const messagesQ = useMessages(selectedId);

  async function act(conv: Conversation, payload: { text?: string; release?: boolean }) {
    setBusy(true);
    try {
      try {
        await invokeFunction("inbox-reply", { conversation_id: conv.id, ...payload });
      } catch (e) {
        // Simulator conversations can be handled without the Edge Function.
        if (conv.channel !== "simulator") throw e;
        if (payload.text) {
          const ins = await supabase.from("messages").insert({
            conversation_id: conv.id,
            business_id: business.id,
            direction: "out",
            role: "assistant",
            content: payload.text,
            tool_name: "human",
            tool_payload: { by: "human" },
          });
          if (ins.error) throw ins.error;
        }
        if (typeof payload.release === "boolean") {
          const up = await supabase
            .from("conversations")
            .update({ handoff_to_human: !payload.release })
            .eq("id", conv.id);
          if (up.error) throw up.error;
        }
      }
      if (payload.text) setReply("");
      await qc.invalidateQueries({ queryKey: ["conversations", business.id] });
      await qc.invalidateQueries({ queryKey: ["messages", conv.id] });
      await qc.invalidateQueries({ queryKey: ["handoffs", business.id] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("nav.inbox")} description={t("inbox.subtitle")} />
      <div className="grid h-[calc(100vh-13rem)] min-h-[520px] gap-4 md:grid-cols-[320px_1fr]">
        <Card className={cn("flex flex-col overflow-hidden", selected && "hidden md:flex")}>
          <div className="flex items-center justify-between border-b p-3 text-sm">
            <label className="flex items-center gap-2">
              <Switch checked={onlyHandoff} onCheckedChange={setOnlyHandoff} />
              {t("inbox.onlyHandoff")}
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {convQ.isLoading ? (
              <Skeleton className="m-3 h-40" />
            ) : list.length === 0 ? (
              <EmptyState
                className="m-3"
                icon={<MessageSquare />}
                title={t("inbox.empty")}
                description={t("inbox.emptyHint")}
              />
            ) : (
              list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-center gap-3 border-b px-3 py-3 text-left text-sm transition hover:bg-accent",
                    c.id === selectedId && "bg-accent",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
                    {c.channel === "simulator" ? (
                      <Smartphone className="h-4 w-4" />
                    ) : (
                      <MessageSquare className="h-4 w-4 text-[#128C4A]" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {c.customers?.name ?? c.phone}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {c.channel === "simulator" ? t("nav.simulator") : "WhatsApp"} ·{" "}
                      {new Date(c.last_message_at).toLocaleString(i18n.language, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </span>
                  {c.handoff_to_human && (
                    <Badge variant="destructive" className="shrink-0">
                      <Hand className="h-3 w-3" />
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        </Card>

        <Card className={cn("flex flex-col overflow-hidden", !selected && "hidden md:flex")}>
          {!selected ? (
            <EmptyState
              className="m-auto border-0"
              icon={<MessageSquare />}
              title={t("inbox.select")}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="md:hidden"
                    onClick={() => setSelectedId(null)}
                  >
                    ←
                  </Button>
                  <div>
                    <p className="font-medium">{selected.customers?.name ?? selected.phone}</p>
                    <p className="text-xs text-muted-foreground">{selected.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selected.handoff_to_human ? (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy}
                      title={t("inbox.returnToBotHint")}
                      onClick={() => act(selected, { release: true })}
                    >
                      <Bot /> {t("inbox.returnToBot")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={busy}
                      title={t("inbox.takeOverHint")}
                      onClick={() => act(selected, { release: false })}
                    >
                      <Hand /> {t("inbox.takeOver")}
                    </Button>
                  )}
                </div>
              </div>
              {selected.handoff_to_human && (
                <div className="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" />
                  {t("inbox.handoffBanner")}
                  {typeof selected.state?.handoff_reason === "string" &&
                    selected.state.handoff_reason !== "manual" &&
                    !selected.state.handoff_reason.startsWith("agent_error") && (
                      <span className="opacity-80">· {selected.state.handoff_reason}</span>
                    )}
                </div>
              )}
              <div className="flex-1 overflow-y-auto bg-muted/30">
                {messagesQ.isLoading ? (
                  <Skeleton className="m-3 h-40" />
                ) : (
                  <ChatThread messages={messagesQ.data ?? []} perspective="business" />
                )}
              </div>
              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (reply.trim()) void act(selected, { text: reply.trim() });
                }}
              >
                <Input
                  aria-label={t("inbox.replyPlaceholder")}
                  placeholder={t("inbox.replyPlaceholder")}
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                />
                <Button type="submit" loading={busy} disabled={!reply.trim()}>
                  <Send /> {t("inbox.send")}
                </Button>
              </form>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
