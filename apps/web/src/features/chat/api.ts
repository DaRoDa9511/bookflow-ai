import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Conversation, Message } from "@/types/models";

export function useConversations(businessId: string, channel?: "whatsapp" | "simulator") {
  return useQuery({
    queryKey: ["conversations", businessId, channel ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select("*, customers(name)")
        .eq("business_id", businessId)
        .order("last_message_at", { ascending: false })
        .limit(200);
      if (channel) q = q.eq("channel", channel);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Conversation[];
    },
  });
}

export function useMessages(conversationId: string | null) {
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: Boolean(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });
}

/** Realtime: new messages / conversation changes for a business refresh the inbox. */
export function useChatRealtime(businessId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`chat-${businessId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `business_id=eq.${businessId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          qc.setQueryData<Message[]>(["messages", m.conversation_id], (old) =>
            old && !old.some((x) => x.id === m.id) ? [...old, m] : old,
          );
          void qc.invalidateQueries({ queryKey: ["conversations", businessId] });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["conversations", businessId] });
          void qc.invalidateQueries({ queryKey: ["handoffs", businessId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, qc]);
}

export function useHandoffCount(businessId: string, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["handoffs", businessId],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("business_id", businessId)
        .eq("handoff_to_human", true);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return data ?? 0;
}
