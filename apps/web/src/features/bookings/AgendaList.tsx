import { CalendarX, CheckCircle2, ChevronLeft, ChevronRight, Phone, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { addDays, formatInZone, localDate, zonedToUtc } from "@shared/time.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import type { Booking, Business } from "@/types/models";
import { statusVariant, useBookingActions, useBookings } from "./api";
import { BookingDetailsDialog, useErrorToast } from "./BookingDialogs";

/**
 * Day list of appointments: the comfortable view on a phone and for staff.
 * Quick actions (completed / no-show / call) without opening the calendar.
 */
export function AgendaList({
  business,
  staffId,
  canManage,
}: {
  business: Business;
  staffId: string | null;
  canManage: (b: Booking) => boolean;
}) {
  const { t, i18n } = useTranslation();
  const tz = business.timezone;
  const today = localDate(new Date(), tz);
  const [day, setDay] = useState(today);
  const [selected, setSelected] = useState<Booking | null>(null);
  const actions = useBookingActions(business.id);
  const onError = useErrorToast();

  const range = useMemo(
    () => ({
      from: zonedToUtc(day, 0, tz).toISOString(),
      to: zonedToUtc(addDays(day, 1), 0, tz).toISOString(),
    }),
    [day, tz],
  );
  const q = useBookings({ businessId: business.id, ...range, staffId });
  const rows = (q.data ?? []).filter((b) => b.status !== "cancelled");
  const now = Date.now();

  async function mark(b: Booking, status: "completed" | "no_show") {
    try {
      await actions.setStatus.mutateAsync({ id: b.id, status });
      toast.success(t("common.saved"));
    } catch (e) {
      onError(e);
    }
  }

  const dayLabel =
    day === today
      ? t("common.today")
      : formatInZone(zonedToUtc(day, 12 * 60, tz), tz, i18n.language, {
          weekday: "long",
          day: "numeric",
          month: "long",
        });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t("agenda.prevDay")}
          onClick={() => setDay(addDays(day, -1))}
        >
          <ChevronLeft />
        </Button>
        <div className="text-center">
          <p className="font-medium first-letter:uppercase">{dayLabel}</p>
          <p className="text-xs text-muted-foreground">
            {t("agenda.count", { count: rows.length })}
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("agenda.nextDay")}
          onClick={() => setDay(addDays(day, 1))}
        >
          <ChevronRight />
        </Button>
      </div>
      {day !== today && (
        <div className="text-center">
          <Button variant="link" size="sm" onClick={() => setDay(today)}>
            {t("agenda.backToToday")}
          </Button>
        </div>
      )}

      {q.isLoading ? (
        <Skeleton className="h-40" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<CalendarX />} title={t("agenda.empty")} />
      ) : (
        <div className="space-y-2">
          {rows.map((b) => {
            const started = Date.parse(b.starts_at) <= now;
            const manageable = canManage(b) && b.status === "confirmed";
            return (
              <Card key={b.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setSelected(b)}
                  className="flex w-full items-stretch gap-3 p-3 text-left hover:bg-accent/50"
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="font-semibold tabular-nums">
                      {formatInZone(b.starts_at, tz, i18n.language, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {t("common.minutes", { count: b.services?.duration_min ?? 0 })}
                    </p>
                  </div>
                  <div
                    className="w-1 shrink-0 rounded-full"
                    style={{ backgroundColor: b.staff?.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {b.customers?.name ?? b.customers?.phone}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.services?.name} · {b.staff?.display_name}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge variant={statusVariant[b.status]}>{t(`status.${b.status}`)}</Badge>
                      {b.customer_confirmed_at && b.status === "confirmed" && (
                        <Badge variant="success">{t("bookings.customerConfirmedShort")}</Badge>
                      )}
                    </div>
                  </div>
                </button>
                {manageable && (
                  <div className="flex border-t text-xs">
                    {b.customers?.phone && (
                      <a
                        href={`tel:${b.customers.phone}`}
                        className="flex flex-1 items-center justify-center gap-1 py-2 text-muted-foreground hover:bg-accent"
                      >
                        <Phone className="h-3.5 w-3.5" /> {t("agenda.call")}
                      </a>
                    )}
                    {started && (
                      <button
                        type="button"
                        onClick={() => mark(b, "no_show")}
                        className="flex flex-1 items-center justify-center gap-1 border-l py-2 text-muted-foreground hover:bg-accent"
                      >
                        <UserX className="h-3.5 w-3.5" /> {t("bookings.markNoShow")}
                      </button>
                    )}
                    {started && (
                      <button
                        type="button"
                        onClick={() => mark(b, "completed")}
                        className="flex flex-1 items-center justify-center gap-1 border-l py-2 font-medium text-success hover:bg-accent"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> {t("bookings.markCompleted")}
                      </button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {selected && (
        <BookingDetailsDialog
          booking={selected}
          business={business}
          canManage={canManage(selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
