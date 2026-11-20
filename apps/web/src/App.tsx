import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  FullPageLoader,
  RedirectIfAuthed,
  RequireBusiness,
  RequireSuperAdmin,
} from "@/components/guards";
import { Preferences } from "@/components/brand";
import { useAuth } from "@/lib/auth";

const Login = lazy(() => import("@/routes/auth/Login"));
const Signup = lazy(() => import("@/routes/auth/Signup"));

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

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route
          path="/login"
          element={
            <RedirectIfAuthed>
              <Login />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/signup"
          element={
            <RedirectIfAuthed>
              <Signup />
            </RedirectIfAuthed>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireSuperAdmin>
              <Placeholder title="Admin" />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/app/*"
          element={
            <RequireBusiness>
              <Placeholder title="Panel" />
            </RequireBusiness>
          }
        />
        <Route path="/apply/*" element={<Placeholder title="Apply" />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
