import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import type { Booking, BookingStatus } from "@/types/models";

export const BOOKING_SELECT =
  "*, customers(id, name, phone), services(id, name, duration_min), staff(id, display_name, color)";

export function useBookings(params: {
  businessId: string;
  from?: string;
  to?: string;
  staffId?: string | null;
}) {
  const { businessId, from, to, staffId } = params;
  return useQuery({
    queryKey: ["bookings", businessId, from, to, staffId ?? null],
    queryFn: async () => {
      let q = supabase
        .from("bookings")
        .select(BOOKING_SELECT)
        .eq("business_id", businessId)
        .order("starts_at", { ascending: true })
        .limit(2000);
      if (from) q = q.gte("starts_at", from);
      if (to) q = q.lt("starts_at", to);
      if (staffId) q = q.eq("staff_id", staffId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Booking[];
    },
  });
}

/** Live updates: any change to this business's bookings refreshes the queries. */
export function useBookingsRealtime(businessId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(`bookings-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `business_id=eq.${businessId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ["bookings", businessId] });
          void qc.invalidateQueries({ queryKey: ["metrics", businessId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [businessId, qc]);
}

export function useBookingActions(businessId: string) {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["bookings", businessId] });
    void qc.invalidateQueries({ queryKey: ["metrics", businessId] });
    void qc.invalidateQueries({ queryKey: ["slots"] });
  };
  const cancel = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc("cancel_booking", {
        p_booking_id: id,
        p_reason: reason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: BookingStatus }) => {
      const { error } = await supabase.from("bookings").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const reschedule = useMutation({
    mutationFn: async ({ id, start, staffId }: { id: string; start: string; staffId?: string }) => {
      const { error } = await supabase.rpc("reschedule_booking", {
        p_booking_id: id,
        p_starts_at: start,
        p_staff_id: staffId ?? null,
      });
      if (error) throw error;
    },
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: async (v: {
      slug: string;
      serviceId: string;
      staffId: string;
      start: string;
      name: string;
      phone: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("create_public_booking", {
        p_slug: v.slug,
        p_service_id: v.serviceId,
        p_staff_id: v.staffId,
        p_starts_at: v.start,
        p_customer_name: v.name,
        p_customer_phone: v.phone,
        p_source: "admin",
        p_notes: v.notes ?? null,
      });
      if (error) throw error;
      return data as { booking_id: string };
    },
    onSuccess: refresh,
  });
  return { cancel, setStatus, reschedule, create };
}

export const statusVariant: Record<
  BookingStatus,
  "default" | "success" | "warning" | "destructive" | "secondary"
> = {
  confirmed: "default",
  completed: "success",
  pending_payment: "warning",
  cancelled: "secondary",
  no_show: "destructive",
};
