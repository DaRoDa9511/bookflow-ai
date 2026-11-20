import { useQuery } from "@tanstack/react-query";
import {
  computeSlotsForDate,
  type BusyRow,
  type Slot,
  type TimeOffRow,
  type WorkingHoursRow,
} from "@shared/availability.ts";
import { supabase } from "@/lib/supabase";

interface AvailabilityContext {
  timezone: string;
  duration_min: number;
  buffer_min: number;
  staff_ids: string[];
  working_hours: WorkingHoursRow[];
  time_off: TimeOffRow[];
  busy: BusyRow[];
}

/**
 * Free slots for one local date. The RPC returns only the inputs (no customer
 * data); the slots are computed with the same module the AI agent uses.
 */
export function useSlots(params: {
  slug: string;
  serviceId: string | null;
  staffId: string | null;
  date: string | null;
  minLeadMinutes?: number;
}) {
  const { slug, serviceId, staffId, date, minLeadMinutes = 60 } = params;
  return useQuery({
    queryKey: ["slots", slug, serviceId, staffId, date, minLeadMinutes],
    enabled: Boolean(serviceId && date),
    staleTime: 15_000,
    queryFn: async (): Promise<Slot[]> => {
      const { data, error } = await supabase.rpc("get_availability_context", {
        p_slug: slug,
        p_service_id: serviceId,
        p_staff_id: staffId,
        p_from: date,
        p_to: date,
      });
      if (error) throw error;
      const ctx = data as AvailabilityContext;
      return computeSlotsForDate(
        {
          timezone: ctx.timezone,
          durationMin: ctx.duration_min,
          bufferMin: ctx.buffer_min,
          staffIds: ctx.staff_ids,
          workingHours: ctx.working_hours,
          timeOff: ctx.time_off,
          busy: ctx.busy,
          now: new Date(),
          minLeadMinutes,
          stepMin: 15,
        },
        date!,
      );
    },
  });
}
