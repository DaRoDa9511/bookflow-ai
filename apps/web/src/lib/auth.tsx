import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Business, Membership, MemberRole, Profile } from "@/types/models";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  loading: boolean;
  profile: Profile | null;
  memberships: Membership[];
  active: Membership | null;
  business: Business | null;
  role: MemberRole | null;
  isSuperAdmin: boolean;
  setActiveBusiness: (id: string) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const ACTIVE_KEY = "bf-active-business";

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setSessionLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const profileQ = useQuery({
    queryKey: ["profile", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
  });

  const membershipsQ = useQuery({
    queryKey: ["memberships", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("memberships")
        .select("business_id, user_id, role, staff_id, businesses(*)")
        .eq("user_id", userId!);
      if (error) throw error;
      return (data ?? []) as unknown as Membership[];
    },
  });

  const value = useMemo<AuthState>(() => {
    const memberships = membershipsQ.data ?? [];
    const active = memberships.find((m) => m.business_id === activeId) ?? memberships[0] ?? null;
    return {
      session,
      loading:
        sessionLoading || (Boolean(userId) && (profileQ.isLoading || membershipsQ.isLoading)),
      profile: profileQ.data ?? null,
      memberships,
      active,
      business: active?.businesses ?? null,
      role: active?.role ?? null,
      isSuperAdmin: Boolean(profileQ.data?.is_super_admin),
      setActiveBusiness: (id: string) => {
        setActiveId(id);
        try {
          localStorage.setItem(ACTIVE_KEY, id);
        } catch {
          /* ignore */
        }
      },
      refresh: async () => {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ["profile", userId] }),
          qc.invalidateQueries({ queryKey: ["memberships", userId] }),
        ]);
      },
      signOut: async () => {
        await supabase.auth.signOut();
        qc.clear();
      },
    };
  }, [
    session,
    sessionLoading,
    userId,
    profileQ.data,
    profileQ.isLoading,
    membershipsQ.data,
    membershipsQ.isLoading,
    activeId,
    qc,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Business context for pages under /app (guaranteed by the route guard). */
export function useBusiness() {
  const { business, role, active } = useAuth();
  if (!business || !role) throw new Error("No active business");
  return { business, role, staffId: active?.staff_id ?? null, isOwner: role === "owner" };
}

/** Where to send a signed-in user. */
export function homePath(
  state: Pick<AuthState, "isSuperAdmin" | "memberships" | "business" | "role">,
) {
  if (state.isSuperAdmin) return "/admin";
  if (state.memberships.length > 0) {
    if (state.role === "owner" && state.business && !state.business.onboarding_completed) {
      return "/app/onboarding";
    }
    return state.role === "staff" ? "/app/calendar" : "/app";
  }
  return "/apply/status";
}
