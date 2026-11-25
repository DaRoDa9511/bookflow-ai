import i18n from "@/lib/i18n";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { homePath, useAuth } from "@/lib/auth";
import type { MemberRole } from "@/types/models";

export function FullPageLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center" role="status" aria-live="polite">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      <span className="sr-only">{i18n.t("common.loading")}</span>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageLoader />;
  if (!session) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}

export function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.loading) return <FullPageLoader />;
  if (!auth.session) return <Navigate to="/login?next=/admin" replace />;
  if (!auth.isSuperAdmin) return <Navigate to={homePath(auth)} replace />;
  return <>{children}</>;
}

/** Requires an active business membership; optionally restricts to some roles. */
export function RequireBusiness({
  roles,
  children,
}: {
  roles?: MemberRole[];
  children: ReactNode;
}) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading) return <FullPageLoader />;
  if (!auth.session) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  if (!auth.business || !auth.role) return <Navigate to={homePath(auth)} replace />;
  if (roles && !roles.includes(auth.role)) return <Navigate to="/app/calendar" replace />;
  return <>{children}</>;
}

/** For /login and /signup: signed-in users go straight to their home. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const params = new URLSearchParams(useLocation().search);
  if (auth.loading) return <FullPageLoader />;
  if (auth.session) return <Navigate to={params.get("next") ?? homePath(auth)} replace />;
  return <>{children}</>;
}
