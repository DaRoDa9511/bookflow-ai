import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type {
  KnowledgeItem,
  Service,
  Staff,
  StaffService,
  TimeOff,
  WorkingHours,
} from "@/types/models";

async function list<T>(table: string, businessId: string, order = "created_at"): Promise<T[]> {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq("business_id", businessId)
    .order(order, { ascending: true });
  if (error) throw error;
  return (data ?? []) as T[];
}

export const catalogKeys = {
  services: (b: string) => ["services", b] as const,
  staff: (b: string) => ["staff", b] as const,
  staffServices: (b: string) => ["staff_services", b] as const,
  hours: (b: string) => ["working_hours", b] as const,
  timeOff: (b: string) => ["time_off", b] as const,
  kb: (b: string) => ["knowledge_base", b] as const,
};

export const useServices = (b: string) =>
  useQuery({ queryKey: catalogKeys.services(b), queryFn: () => list<Service>("services", b) });
export const useStaff = (b: string) =>
  useQuery({ queryKey: catalogKeys.staff(b), queryFn: () => list<Staff>("staff", b) });
export const useStaffServices = (b: string) =>
  useQuery({
    queryKey: catalogKeys.staffServices(b),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("*")
        .eq("business_id", b);
      if (error) throw error;
      return (data ?? []) as StaffService[];
    },
  });
export const useWorkingHours = (b: string) =>
  useQuery({
    queryKey: catalogKeys.hours(b),
    queryFn: () => list<WorkingHours>("working_hours", b, "weekday"),
  });
export const useTimeOff = (b: string) =>
  useQuery({
    queryKey: catalogKeys.timeOff(b),
    queryFn: () => list<TimeOff>("time_off", b, "starts_at"),
  });
export const useKnowledge = (b: string) =>
  useQuery({
    queryKey: catalogKeys.kb(b),
    queryFn: () => list<KnowledgeItem>("knowledge_base", b),
  });

/** Generic upsert/delete mutation for a business-scoped table. */
export function useTableMutation(table: string, invalidate: readonly (readonly unknown[])[]) {
  const qc = useQueryClient();
  const done = () => Promise.all(invalidate.map((k) => qc.invalidateQueries({ queryKey: k })));
  const upsert = useMutation({
    mutationFn: async (row: Record<string, unknown>) => {
      const { data, error } = await supabase.from(table).upsert(row).select().single();
      if (error) throw error;
      return data as Record<string, unknown>;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { upsert, remove };
}

/** Replace the services a staff member performs. */
export async function setStaffServices(businessId: string, staffId: string, serviceIds: string[]) {
  const del = await supabase.from("staff_services").delete().eq("staff_id", staffId);
  if (del.error) throw del.error;
  if (serviceIds.length === 0) return;
  const ins = await supabase
    .from("staff_services")
    .insert(
      serviceIds.map((service_id) => ({ business_id: businessId, staff_id: staffId, service_id })),
    );
  if (ins.error) throw ins.error;
}

/** Replace the weekly schedule of a staff member. */
export async function setWeeklyHours(
  businessId: string,
  staffId: string,
  rows: { weekday: number; start_time: string; end_time: string }[],
) {
  const del = await supabase.from("working_hours").delete().eq("staff_id", staffId);
  if (del.error) throw del.error;
  if (rows.length === 0) return;
  const ins = await supabase
    .from("working_hours")
    .insert(rows.map((r) => ({ ...r, business_id: businessId, staff_id: staffId })));
  if (ins.error) throw ins.error;
}

export const STAFF_COLORS = [
  "#6366f1",
  "#f97316",
  "#0ea5e9",
  "#22c55e",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#eab308",
];
