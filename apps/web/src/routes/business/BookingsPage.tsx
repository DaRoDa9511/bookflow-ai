import { Download, ListChecks, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, formatInZone, localDate, zonedToUtc } from "@shared/time.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import {
  EmptyState,
  PageHeader,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/misc";
import { statusVariant, useBookings, useBookingsRealtime } from "@/features/bookings/api";
import { BookingDetailsDialog, NewBookingDialog } from "@/features/bookings/BookingDialogs";
import { useStaff } from "@/features/catalog/api";
import { useBusiness } from "@/lib/auth";
import { downloadFile, formatMoney, toCsv } from "@/lib/utils";
import type { Booking, BookingSource, BookingStatus } from "@/types/models";

const STATUSES: BookingStatus[] = [
  "confirmed",
  "completed",
  "no_show",
  "cancelled",
  "pending_payment",
];
const SOURCES: BookingSource[] = ["whatsapp", "web", "admin"];

export default function BookingsPage() {
  const { t, i18n } = useTranslation();
  const { business, isOwner, staffId: myStaffId } = useBusiness();
  const today = localDate(new Date(), business.timezone);
  const [from, setFrom] = useState(addDays(today, -14));
  const [to, setTo] = useState(addDays(today, 14));
  const [status, setStatus] = useState<string>("");
  const [source, setSource] = useState<string>("");
  const [staffFilter, setStaffFilter] = useState<string>("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [creating, setCreating] = useState(false);
  const staffQ = useStaff(business.id);
  useBookingsRealtime(business.id);

  const bookingsQ = useBookings({
    businessId: business.id,
    from: zonedToUtc(from, 0, business.timezone).toISOString(),
    to: zonedToUtc(addDays(to, 1), 0, business.timezone).toISOString(),
    staffId: staffFilter || null,
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (bookingsQ.data ?? [])
      .filter((b) => !status || b.status === status)
      .filter((b) => !source || b.source === source)
      .filter(
        (b) =>
          !q ||
          b.customers?.name?.toLowerCase().includes(q) ||
          b.customers?.phone?.includes(q) ||
          b.services?.name.toLowerCase().includes(q),
      )
      .sort((a, b) => (a.starts_at < b.starts_at ? 1 : -1));
  }, [bookingsQ.data, status, source, query]);

  function exportCsv() {
    downloadFile(
      `bookings-${business.slug}-${from}_${to}.csv`,
      toCsv(
        rows.map((b) => ({
          date: formatInZone(b.starts_at, business.timezone, "sv-SE", {
            dateStyle: "short",
            timeStyle: "short",
          }),
          customer: b.customers?.name ?? "",
          phone: b.customers?.phone ?? "",
          service: b.services?.name ?? "",
          staff: b.staff?.display_name ?? "",
          status: b.status,
          source: b.source,
          price: b.price,
          notes: b.notes ?? "",
        })),
      ),
    );
  }

  return (
    <>
      <PageHeader
        title={t("nav.bookings")}
        description={isOwner ? t("bookings.subtitle") : t("bookings.subtitleStaff")}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              <Download /> CSV
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> {t("bookings.newBooking")}
            </Button>
          </>
        }
      />
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          aria-label={t("common.search")}
          placeholder={t("bookings.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="lg:col-span-2"
        />
        <Input
          type="date"
          aria-label={t("catalog.from")}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input
          type="date"
          aria-label={t("catalog.to")}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <Select
          aria-label={t("common.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">
            {t("common.status")}: {t("common.all")}
          </option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Select>
        <Select
          aria-label={t("common.source")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <option value="">
            {t("common.source")}: {t("common.all")}
          </option>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {t(`sources.${s}`)}
            </option>
          ))}
        </Select>
        {isOwner && (
          <Select
            aria-label={t("common.staff")}
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
          >
            <option value="">
              {t("common.staff")}: {t("common.all")}
            </option>
            {staffQ.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name}
              </option>
            ))}
          </Select>
        )}
      </Card>
      <Card>
        {bookingsQ.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<ListChecks />}
            title={t("bookings.empty")}
            description={t("bookings.emptyHint")}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("common.date")}</TH>
                <TH>{t("common.customer")}</TH>
                <TH>{t("common.service")}</TH>
                <TH>{t("common.staff")}</TH>
                <TH>{t("common.source")}</TH>
                <TH>{t("common.status")}</TH>
                <TH className="text-right">{t("common.price")}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((b) => (
                <TR key={b.id} className="cursor-pointer" onClick={() => setSelected(b)}>
                  <TD className="whitespace-nowrap tabular-nums">
                    {formatInZone(b.starts_at, business.timezone, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TD>
                  <TD>
                    <p className="font-medium">{b.customers?.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{b.customers?.phone}</p>
                  </TD>
                  <TD>{b.services?.name}</TD>
                  <TD>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: b.staff?.color }}
                      />
                      {b.staff?.display_name}
                    </span>
                  </TD>
                  <TD>{t(`sources.${b.source}`)}</TD>
                  <TD>
                    <Badge variant={statusVariant[b.status]}>{t(`status.${b.status}`)}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatMoney(b.price, business.currency, i18n.language)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {selected && (
        <BookingDetailsDialog
          booking={selected}
          business={business}
          canManage={isOwner || selected.staff_id === myStaffId}
          onClose={() => setSelected(null)}
        />
      )}
      {creating && (
        <NewBookingDialog
          business={business}
          initialStaffId={isOwner ? null : myStaffId}
          onClose={() => setCreating(false)}
        />
      )}
    </>
  );
}
