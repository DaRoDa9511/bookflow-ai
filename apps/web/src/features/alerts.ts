import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { formatInZone } from "@shared/time.ts";
import { supabase } from "@/lib/supabase";
import type { Business } from "@/types/models";

/**
 * Live alerts while the panel is open:
 * - a new appointment arrives from the bot or the web (owner: all; staff: their own),
 * - a customer asks to talk to a person (owner).
 */
export function useLiveAlerts(business: Business, isOwner: boolean, staffId: string | null) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  // Conversations already announced (Realtime doesn't send the previous row values).
  const announced = useRef(new Set<string>());

  useEffect(() => {
    const channel = supabase
      .channel(`alerts-${business.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `business_id=eq.${business.id}`,
        },
        (payload) => {
          const b = payload.new as { starts_at: string; source: string; staff_id: string };
          if (b.source === "admin") return; // created from the panel itself
          if (!isOwner && b.staff_id !== staffId) return;
          toast.success(
            t("alerts.newBooking", {
              when: formatInZone(b.starts_at, business.timezone, i18n.language, {
                weekday: "long",
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              }),
              source: t(`sources.${b.source}` as "sources.web"),
            }),
            { action: { label: t("alerts.view"), onClick: () => navigate("/app/calendar") } },
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversations",
          filter: `business_id=eq.${business.id}`,
        },
        (payload) => {
          const next = payload.new as { id: string; handoff_to_human: boolean };
          if (!next.handoff_to_human) {
            announced.current.delete(next.id);
            return;
          }
          if (!isOwner || announced.current.has(next.id)) return;
          announced.current.add(next.id);
          toast.warning(t("alerts.handoff"), {
            duration: 10_000,
            action: { label: t("alerts.reply"), onClick: () => navigate("/app/inbox") },
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [business.id, business.timezone, isOwner, staffId, t, i18n.language, navigate]);
}
