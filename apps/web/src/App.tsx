import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Preferences } from "@/components/brand";
import {
  FullPageLoader,
  RedirectIfAuthed,
  RequireAuth,
  RequireBusiness,
  RequireSuperAdmin,
} from "@/components/guards";
import { useAuth } from "@/lib/auth";

const Login = lazy(() => import("@/routes/auth/Login"));
const Signup = lazy(() => import("@/routes/auth/Signup"));
const Apply = lazy(() => import("@/routes/auth/Apply"));
const ApplyStatus = lazy(() => import("@/routes/auth/ApplyStatus"));
const AdminPage = lazy(() => import("@/routes/admin/AdminPage"));
const Onboarding = lazy(() => import("@/routes/business/Onboarding"));

function Placeholder({ title }: { title: string }) {
  const { signOut, profile } = useAuth();
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <Preferences />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{profile?.email}</p>
      <button className="text-primary underline" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}

const guard = (el: React.ReactNode, kind: "auth" | "admin" | "owner" | "member" | "guest") => {
  switch (kind) {
    case "auth":
      return <RequireAuth>{el}</RequireAuth>;
    case "admin":
      return <RequireSuperAdmin>{el}</RequireSuperAdmin>;
    case "owner":
      return <RequireBusiness roles={["owner"]}>{el}</RequireBusiness>;
    case "member":
      return <RequireBusiness>{el}</RequireBusiness>;
    case "guest":
      return <RedirectIfAuthed>{el}</RedirectIfAuthed>;
  }
};

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={guard(<Login />, "guest")} />
        <Route path="/signup" element={guard(<Signup />, "guest")} />
        <Route path="/apply" element={guard(<Apply />, "auth")} />
        <Route path="/apply/status" element={guard(<ApplyStatus />, "auth")} />
        <Route path="/admin" element={guard(<AdminPage />, "admin")} />
        <Route path="/app/onboarding" element={guard(<Onboarding />, "owner")} />
        <Route path="/app/*" element={guard(<Placeholder title="Panel" />, "member")} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
