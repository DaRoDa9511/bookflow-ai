import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatInZone } from "@shared/time.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
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
import { statusVariant } from "@/features/bookings/api";
import { useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { formatMoney } from "@/lib/utils";
import type { Booking, Customer } from "@/types/models";

type Row = Customer & { visits: number; spent: number; last: string | null; bookings: Booking[] };

export default function CustomersPage() {
  const { t, i18n } = useTranslation();
  const { business } = useBusiness();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [notes, setNotes] = useState("");

  const dataQ = useQuery({
    queryKey: ["customers", business.id],
    queryFn: async () => {
      const [c, b] = await Promise.all([
        supabase.from("customers").select("*").eq("business_id", business.id).order("created_at"),
        supabase
          .from("bookings")
          .select("id, customer_id, starts_at, status, price, services(name), staff(display_name)")
          .eq("business_id", business.id)
          .order("starts_at", { ascending: false }),
      ]);
      if (c.error) throw c.error;
      if (b.error) throw b.error;
      return {
        customers: (c.data ?? []) as Customer[],
        bookings: (b.data ?? []) as unknown as Booking[],
      };
    },
  });

  const rows = useMemo<Row[]>(() => {
    if (!dataQ.data) return [];
    const q = query.trim().toLowerCase();
    return dataQ.data.customers
      .map((c) => {
        const bookings = dataQ.data.bookings.filter((b) => b.customer_id === c.id);
        const done = bookings.filter((b) => b.status === "completed");
        return {
          ...c,
          bookings,
          visits: done.length,
          spent: done.reduce((s, b) => s + Number(b.price), 0),
          last: bookings[0]?.starts_at ?? null,
        };
      })
      .filter((c) => !q || c.name?.toLowerCase().includes(q) || c.phone.includes(q))
      .sort((a, b) => b.spent - a.spent);
  }, [dataQ.data, query]);

  async function saveNotes() {
    if (!selected) return;
    const { error } = await supabase.from("customers").update({ notes }).eq("id", selected.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    await qc.invalidateQueries({ queryKey: ["customers", business.id] });
  }

  return (
    <>
      <PageHeader title={t("nav.customers")} description={t("customers.subtitle")} />
      <Input
        aria-label={t("common.search")}
        placeholder={t("customers.searchPlaceholder")}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 max-w-sm"
      />
      <Card>
        {dataQ.isLoading ? (
          <Skeleton className="m-4 h-64" />
        ) : rows.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<UsersRound />}
            title={t("customers.empty")}
            description={t("customers.emptyHint")}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>{t("common.customer")}</TH>
                <TH>{t("customers.visits")}</TH>
                <TH>{t("customers.lastVisit")}</TH>
                <TH className="text-right">{t("customers.spent")}</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelected(c);
                    setNotes(c.notes ?? "");
                  }}
                >
                  <TD>
                    <p className="font-medium">{c.name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">{c.phone}</p>
                  </TD>
                  <TD className="tabular-nums">{c.visits}</TD>
                  <TD className="text-muted-foreground">
                    {c.last
                      ? formatInZone(c.last, business.timezone, i18n.language, {
                          dateStyle: "medium",
                        })
                      : "—"}
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {formatMoney(c.spent, business.currency, i18n.language)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      {selected && (
        <Dialog open onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{selected.name ?? selected.phone}</DialogTitle>
              <DialogDescription>
                {selected.phone} · {t("customers.visits")}: {selected.visits} ·{" "}
                {t("customers.spent")}:{" "}
                {formatMoney(selected.spent, business.currency, i18n.language)}
              </DialogDescription>
            </DialogHeader>
            <Field label={t("common.notes")} htmlFor="c-notes">
              <Textarea
                id="c-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <div className="flex justify-end">
              <Button size="sm" onClick={saveNotes}>
                {t("common.save")}
              </Button>
            </div>
            <div className="max-h-72 space-y-2 overflow-y-auto">
              <p className="text-sm font-medium">{t("customers.history")}</p>
              {selected.bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-md border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{b.services?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatInZone(b.starts_at, business.timezone, i18n.language)} ·{" "}
                      {b.staff?.display_name}
                    </p>
                  </div>
                  <Badge variant={statusVariant[b.status]}>{t(`status.${b.status}`)}</Badge>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
