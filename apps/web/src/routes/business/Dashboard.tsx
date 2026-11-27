import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CalendarCheck,
  CircleDollarSign,
  Percent,
  Plus,
  TrendingDown,
  TrendingUp,
  UserX,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatInZone } from "@shared/time.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/misc";
import { useBookings, useBookingsRealtime, statusVariant } from "@/features/bookings/api";
import { BookingDetailsDialog, NewBookingDialog } from "@/features/bookings/BookingDialogs";
import { StaffAvatar } from "@/features/catalog/StaffEditor";
import { Stat } from "@/routes/admin/AdminPage";
import { useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/utils";
import type { Booking } from "@/types/models";

interface Metrics {
  today_bookings: number;
  today_revenue: number;
  today_no_shows: number;
  bot_share_30d: number;
  // Added in migration 7 (optional so the page still works before it is applied).
  today_confirmed_by_customer?: number;
  revenue_week?: number;
  revenue_prev_week?: number;
  revenue_month?: number;
  revenue_prev_month?: number;
  no_show_rate_30d?: number;
  top_services?: { name: string; bookings: number; revenue: number }[];
  series: { day: string; bookings: number; revenue: number }[];
}

function Trend({ current, previous }: { current: number; previous: number }) {
  const { t } = useTranslation();
  if (!previous) return <span>{t("dashboard.noPrevious")}</span>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const up = pct >= 0;
  return (
    <span className={up ? "text-success" : "text-destructive"}>
      {up ? (
        <TrendingUp className="mr-0.5 inline h-3 w-3" />
      ) : (
        <TrendingDown className="mr-0.5 inline h-3 w-3" />
      )}
      {up ? "+" : ""}
      {pct}% {t("dashboard.vsPrevious")}
    </span>
  );
}

export default function Dashboard() {
  const { t, i18n } = useTranslation();
  const { business } = useBusiness();
  const [selected, setSelected] = useState<Booking | null>(null);
  const [creating, setCreating] = useState(false);
  useBookingsRealtime(business.id);

  const metricsQ = useQuery({
    queryKey: ["metrics", business.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("business_metrics", {
        p_business_id: business.id,
      });
      if (error) throw error;
      return data as Metrics;
    },
  });
  // Fixed when the page mounts: a new Date() per render would change the query key forever.
  const [range] = useState(() => {
    const start = new Date();
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + 7 * 86_400_000).toISOString(),
    };
  });
  const upcomingQ = useBookings({ businessId: business.id, ...range });
  const upcoming = (upcomingQ.data ?? []).filter((b) => b.status === "confirmed").slice(0, 8);
  const m = metricsQ.data;

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.subtitle", { name: business.name })}
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> {t("bookings.newBooking")}
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metricsQ.isLoading || !m ? (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Stat
              icon={<CalendarCheck />}
              label={t("dashboard.todayBookings")}
              value={m.today_bookings}
            />
            <Stat
              icon={<CircleDollarSign />}
              label={t("dashboard.todayRevenue")}
              value={formatMoney(m.today_revenue, business.currency, i18n.language)}
            />
            <Stat icon={<UserX />} label={t("dashboard.todayNoShows")} value={m.today_no_shows} />
            <Stat icon={<Bot />} label={t("dashboard.botShare")} value={`${m.bot_share_30d}%`} />
          </>
        )}
      </div>

      {m?.revenue_week !== undefined && (
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            icon={<Wallet />}
            label={t("dashboard.revenueWeek")}
            value={formatMoney(m.revenue_week, business.currency, i18n.language)}
            hint={<Trend current={m.revenue_week} previous={m.revenue_prev_week ?? 0} />}
          />
          <Stat
            icon={<Wallet />}
            label={t("dashboard.revenueMonth")}
            value={formatMoney(m.revenue_month ?? 0, business.currency, i18n.language)}
            hint={<Trend current={m.revenue_month ?? 0} previous={m.revenue_prev_month ?? 0} />}
          />
          <Stat
            icon={<Percent />}
            label={t("dashboard.noShowRate")}
            value={`${m.no_show_rate_30d ?? 0}%`}
            hint={t("dashboard.last30Short")}
          />
          <Stat
            icon={<CalendarCheck />}
            label={t("dashboard.confirmedToday")}
            value={`${m.today_confirmed_by_customer ?? 0} / ${m.today_bookings}`}
            hint={t("dashboard.confirmedTodayHint")}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("dashboard.last30")}</CardTitle>
            </CardHeader>
            <CardContent className="h-72">
              {m && (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={m.series}>
                    <defs>
                      <linearGradient id="fillBookings" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      className="stroke-border"
                    />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(d: string) => d.slice(5)}
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} fontSize={11} width={28} tickLine={false} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="bookings"
                      name={t("admin.bookings")}
                      stroke="hsl(var(--primary))"
                      fill="url(#fillBookings)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {m?.top_services && m.top_services.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("dashboard.topServices")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {m.top_services.map((s) => {
                  const max = m.top_services![0].bookings || 1;
                  return (
                    <div key={s.name} className="space-y-1">
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{s.name}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {t("dashboard.bookingsCount", { count: s.bookings })} ·{" "}
                          {formatMoney(s.revenue, business.currency, i18n.language)}
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div
                          className="h-1.5 rounded-full bg-primary"
                          style={{ width: `${Math.max(6, (s.bookings / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">{t("dashboard.upcoming")}</CardTitle>
            <Button variant="link" size="sm" asChild>
              <Link to="/app/calendar">{t("dashboard.viewCalendar")}</Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcomingQ.isLoading ? (
              <Skeleton className="h-40" />
            ) : upcoming.length === 0 ? (
              <EmptyState
                icon={<CalendarCheck />}
                title={t("dashboard.noUpcoming")}
                description={t("dashboard.noUpcomingHint")}
                action={
                  <Button size="sm" variant="outline" asChild>
                    <Link to="/app/simulator">{t("onboarding.trySimulator")}</Link>
                  </Button>
                }
              />
            ) : (
              upcoming.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="flex w-full items-center gap-3 rounded-lg border p-3 text-left text-sm transition hover:bg-accent"
                >
                  {b.staff && <StaffAvatar staff={b.staff} className="h-8 w-8" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {b.customers?.name ?? b.customers?.phone}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.services?.name} · {b.staff?.display_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium tabular-nums">
                      {formatInZone(b.starts_at, business.timezone, i18n.language, {
                        weekday: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <Badge variant={statusVariant[b.status]} className="mt-0.5">
                      {b.customer_confirmed_at
                        ? t("bookings.customerConfirmedShort")
                        : t(`sources.${b.source}`)}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {selected && (
        <BookingDetailsDialog
          booking={selected}
          business={business}
          canManage
          onClose={() => setSelected(null)}
        />
      )}
      {creating && <NewBookingDialog business={business} onClose={() => setCreating(false)} />}
    </>
  );
}
