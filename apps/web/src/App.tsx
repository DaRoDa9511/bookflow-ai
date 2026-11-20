import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import {
  FullPageLoader,
  RedirectIfAuthed,
  RequireAuth,
  RequireBusiness,
  RequireSuperAdmin,
} from "@/components/guards";
import { useBusiness } from "@/lib/auth";

const Login = lazy(() => import("@/routes/auth/Login"));
const Signup = lazy(() => import("@/routes/auth/Signup"));
const Apply = lazy(() => import("@/routes/auth/Apply"));
const ApplyStatus = lazy(() => import("@/routes/auth/ApplyStatus"));
const AdminPage = lazy(() => import("@/routes/admin/AdminPage"));
const Onboarding = lazy(() => import("@/routes/business/Onboarding"));
const AppLayout = lazy(() => import("@/routes/business/AppLayout"));
const Dashboard = lazy(() => import("@/routes/business/Dashboard"));
const CalendarPage = lazy(() => import("@/routes/business/CalendarPage"));
const BookingsPage = lazy(() => import("@/routes/business/BookingsPage"));
const CustomersPage = lazy(() => import("@/routes/business/CustomersPage"));
const AssistantPage = lazy(() => import("@/routes/business/AssistantPage"));
const SettingsPage = lazy(() => import("@/routes/business/SettingsPage"));
const ServicesPage = lazy(() =>
  import("@/routes/business/CatalogPages").then((m) => ({ default: m.ServicesPage })),
);
const StaffPage = lazy(() =>
  import("@/routes/business/CatalogPages").then((m) => ({ default: m.StaffPage })),
);
const BusinessPage = lazy(() => import("@/routes/public/BusinessPage"));
const MePage = lazy(() => import("@/routes/me/MePage"));
const SimulatorPage = lazy(() => import("@/routes/business/SimulatorPage"));
const InboxPage = lazy(() => import("@/routes/business/InboxPage"));
const HoursPage = lazy(() =>
  import("@/routes/business/CatalogPages").then((m) => ({ default: m.HoursPage })),
);

function OwnerOnly({ children }: { children: React.ReactNode }) {
  const { isOwner } = useBusiness();
  return isOwner ? <>{children}</> : <Navigate to="/app/calendar" replace />;
}

function AppIndex() {
  const { isOwner, business } = useBusiness();
  if (!isOwner) return <Navigate to="/app/calendar" replace />;
  if (!business.onboarding_completed) return <Navigate to="/app/onboarding" replace />;
  return <Dashboard />;
}

const owner = (el: React.ReactNode) => <OwnerOnly>{el}</OwnerOnly>;

export default function App() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/b/:slug" element={<BusinessPage />} />
        <Route path="/me" element={<MePage />} />
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
          path="/apply"
          element={
            <RequireAuth>
              <Apply />
            </RequireAuth>
          }
        />
        <Route
          path="/apply/status"
          element={
            <RequireAuth>
              <ApplyStatus />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireSuperAdmin>
              <AdminPage />
            </RequireSuperAdmin>
          }
        />
        <Route
          path="/app/onboarding"
          element={
            <RequireBusiness roles={["owner"]}>
              <Onboarding />
            </RequireBusiness>
          }
        />
        <Route
          path="/app"
          element={
            <RequireBusiness>
              <AppLayout />
            </RequireBusiness>
          }
        >
          <Route index element={<AppIndex />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="hours" element={<HoursPage />} />
          <Route path="customers" element={owner(<CustomersPage />)} />
          <Route path="services" element={owner(<ServicesPage />)} />
          <Route path="staff" element={owner(<StaffPage />)} />
          <Route path="assistant" element={owner(<AssistantPage />)} />
          <Route path="settings" element={owner(<SettingsPage />)} />
          <Route path="simulator" element={owner(<SimulatorPage />)} />
          <Route path="inbox" element={owner(<InboxPage />)} />
          <Route path="*" element={<Navigate to="/app" replace />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
