import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Send, Video } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/misc";
import { useChatRealtime, useMessages } from "@/features/chat/api";
import { ChatThread } from "@/features/chat/ChatThread";
import { useBookingsRealtime } from "@/features/bookings/api";
import { useBusiness } from "@/lib/auth";
import { invokeFunction, supabase } from "@/lib/supabase";
import type { Message } from "@/types/models";

function randomPhone() {
  return `+57300${Math.floor(1_000_000 + Math.random() * 8_999_999)}`;
}

function usePhone(businessId: string) {
  const key = `bf-sim-phone-${businessId}`;
  const [phone, setPhone] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? randomPhone();
    } catch {
      return randomPhone();
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, phone);
    } catch {
      /* ignore */
    }
  }, [key, phone]);
  return [phone, setPhone] as const;
}

export default function SimulatorPage() {
  const { t } = useTranslation();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [phone, setPhone] = usePhone(business.id);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [optimistic, setOptimistic] = useState<Message[]>([]);
  useChatRealtime(business.id);
  useBookingsRealtime(business.id);

  const convQ = useQuery({
    queryKey: ["sim-conversation", business.id, phone],
    queryFn: async () => {
      const { data } = await supabase
        .from("conversations")
        .select("id")
        .eq("business_id", business.id)
        .eq("channel", "simulator")
        .eq("phone", phone)
        .order("last_message_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });
  const messagesQ = useMessages(convQ.data ?? null);
  const messages = [...(messagesQ.data ?? []), ...optimistic];

  async function send(value: string) {
    const body = value.trim();
    if (!body || sending) return;
    setText("");
    setSending(true);
    setOptimistic([
      {
        id: `tmp-${Date.now()}`,
        conversation_id: "",
        business_id: business.id,
        direction: "in",
        role: "user",
        content: body,
        tool_name: null,
        tool_payload: null,
        created_at: new Date().toISOString(),
      },
    ]);
    try {
      await invokeFunction("simulator-message", { business_id: business.id, phone, text: body });
    } catch (e) {
      toast.error(t("simulator.error"), { description: (e as Error).message });
    } finally {
      setOptimistic([]);
      setSending(false);
      await qc.invalidateQueries({ queryKey: ["sim-conversation", business.id, phone] });
      await qc.invalidateQueries({ queryKey: ["messages"] });
    }
  }

  const suggestions = [
    t("simulator.s1", { code: business.booking_code }),
    t("simulator.s2"),
    t("simulator.s3"),
    t("simulator.s4"),
    "Hi! I'd like to book an appointment for tomorrow afternoon",
  ];

  return (
    <>
      <PageHeader title={t("nav.simulator")} description={t("simulator.subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[400px_1fr]">
        <div className="mx-auto w-full max-w-[400px]">
          <div className="overflow-hidden rounded-[2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
            <div className="flex items-center gap-3 bg-[#008069] px-3 py-2.5 text-white">
              <ArrowLeft className="h-5 w-5" aria-hidden />
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
                {business.name.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{business.name}</p>
                <p className="text-xs opacity-80">
                  {sending ? t("simulator.typing") : t("simulator.online")}
                </p>
              </div>
              <Video className="h-5 w-5 opacity-80" aria-hidden />
            </div>
            <div
              className="h-[480px] overflow-y-auto bg-[#efeae2]"
              style={{
                backgroundImage: "radial-gradient(rgba(0,0,0,0.04) 1px, transparent 1px)",
                backgroundSize: "16px 16px",
              }}
            >
              {messages.length === 0 && !sending ? (
                <div className="flex h-full items-center justify-center p-6 text-center text-xs text-[#54656f]">
                  <p className="rounded-lg bg-[#ffeecd] px-3 py-2 shadow-sm">
                    {t("simulator.empty")}
                  </p>
                </div>
              ) : (
                <ChatThread messages={messages} typing={sending} />
              )}
            </div>
            <form
              className="flex items-center gap-2 bg-[#f0f2f5] p-2"
              onSubmit={(e) => {
                e.preventDefault();
                void send(text);
              }}
            >
              <Input
                aria-label={t("simulator.placeholder")}
                className="rounded-full border-0 bg-white text-[#111b21]"
                placeholder={t("simulator.placeholder")}
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={sending}
              />
              <Button
                type="submit"
                size="icon"
                className="shrink-0 rounded-full bg-[#008069] hover:bg-[#006e5a]"
                disabled={!text.trim() || sending}
                aria-label={t("simulator.send")}
              >
                <Send />
              </Button>
            </form>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("simulator.tryTitle")}</CardTitle>
              <CardDescription>{t("simulator.tryHint")}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  className="h-auto whitespace-normal py-1.5 text-left"
                  disabled={sending}
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-3 pt-5 text-sm">
              <p className="text-muted-foreground">
                {t("simulator.phoneLabel")}: <span className="font-mono">{phone}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhone(randomPhone());
                    setOptimistic([]);
                  }}
                >
                  <RotateCcw /> {t("simulator.newCustomer")}
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/app/calendar">{t("dashboard.viewCalendar")}</Link>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t("simulator.howItWorks")}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
