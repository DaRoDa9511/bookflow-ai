import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, CalendarCheck, Check, Inbox, MessageSquare, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Logo, Preferences } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { invokeFunction, supabase } from "@/lib/supabase";
import { errorCode } from "@/lib/utils";
import type { Application, Business } from "@/types/models";

interface AdminMetrics {
  active_businesses: number;
  suspended_businesses: number;
  pending_applications: number;
  bookings_30d: number;
  bot_messages_30d: number;
  bookings_by_day: { day: string; count: number }[];
}

export function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-accent-foreground [&_svg]:h-5 [&_svg]:w-5">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
        </div>
      </div>
    </Card>
  );
}

/** Approve/reject through the Edge Function (sends email); falls back to the RPC if it isn't deployed. */
async function review(applicationId: string, action: "approve" | "reject", note: string) {
  try {
    return await invokeFunction("approve-business", {
      application_id: applicationId,
      action,
      note,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (!/Failed to send|not found|404|fetch/i.test(msg)) throw e;
    const fn = action === "approve" ? "approve_application" : "reject_application";
    const { data, error } = await supabase.rpc(fn, {
      p_application_id: applicationId,
      p_note: note || null,
    });
    if (error) throw error;
    return data;
  }
}

export default function AdminPage() {
  const { t, i18n } = useTranslation();
  const { signOut, profile } = useAuth();
  const qc = useQueryClient();
  const [reviewing, setReviewing] = useState<{
    app: Application;
    action: "approve" | "reject";
  } | null>(null);
  const [note, setNote] = useState("");

  const metricsQ = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_metrics");
      if (error) throw error;
      return data as AdminMetrics;
    },
  });
  const appsQ = useQuery({
    queryKey: ["admin-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_applications")
        .select("*, profiles!business_applications_user_id_fkey(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Application[];
    },
  });
  const bizQ = useQuery({
    queryKey: ["admin-businesses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("businesses").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as Business[];
    },
  });

  const reviewM = useMutation({
    mutationFn: () => review(reviewing!.app.id, reviewing!.action, note),
    onSuccess: async () => {
      toast.success(reviewing?.action === "approve" ? t("admin.approved") : t("admin.rejected"));
      setReviewing(null);
      setNote("");
      await Promise.all(
        ["admin-applications", "admin-businesses", "admin-metrics"].map((k) =>
          qc.invalidateQueries({ queryKey: [k] }),
        ),
      );
    },
    onError: (e) =>
      toast.error(
        t(`errors.${errorCode(e)}` as "errors.forbidden", { defaultValue: (e as Error).message }),
      ),
  });

  const statusM = useMutation({
    mutationFn: async (b: Business) => {
      const { error } = await supabase
        .from("businesses")
        .update({ status: b.status === "active" ? "suspended" : "active" })
        .eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("common.saved"));
      void qc.invalidateQueries({ queryKey: ["admin-businesses"] });
      void qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    },
  });

  const pending = appsQ.data?.filter((a) => a.status === "pending") ?? [];
  const history = appsQ.data?.filter((a) => a.status !== "pending") ?? [];
  const m = metricsQ.data;
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language, { dateStyle: "medium" });

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo to="/admin" />
            <Badge>Super admin</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.email}</span>
            <Preferences />
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </header>
      <main className="container py-8">
        <PageHeader title={t("admin.title")} description={t("admin.subtitle")} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {metricsQ.isLoading ? (
            Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-20" />)
          ) : (
            <>
              <Stat
                icon={<Building2 />}
                label={t("admin.activeBusinesses")}
                value={m?.active_businesses ?? 0}
              />
              <Stat
                icon={<Inbox />}
                label={t("admin.pendingApplications")}
                value={m?.pending_applications ?? 0}
              />
              <Stat
                icon={<CalendarCheck />}
                label={t("admin.bookings30d")}
                value={m?.bookings_30d ?? 0}
              />
              <Stat
                icon={<MessageSquare />}
                label={t("admin.botMessages30d")}
                value={m?.bot_messages_30d ?? 0}
              />
            </>
          )}
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.bookingsPerDay")}</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {m && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={m.bookings_by_day}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(d: string) => d.slice(5)}
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis allowDecimals={false} fontSize={11} width={28} tickLine={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted))" }} />
                  <Bar
                    dataKey="count"
                    name={t("admin.bookings")}
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="applications" className="mt-8">
          <TabsList>
            <TabsTrigger value="applications">
              {t("admin.applications")}{" "}
              {pending.length > 0 && <Badge className="ml-1">{pending.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="businesses">{t("admin.businesses")}</TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-6">
            {appsQ.isLoading ? (
              <Skeleton className="h-32" />
            ) : pending.length === 0 ? (
              <EmptyState
                icon={<Inbox />}
                title={t("admin.noPending")}
                description={t("admin.noPendingHint")}
              />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {pending.map((a) => (
                  <Card key={a.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">{a.business_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {t(`categories.${a.category}`)} · {a.city} · {a.timezone}
                        </p>
                      </div>
                      <Badge variant="warning">{t("status.pending")}</Badge>
                    </div>
                    <p className="text-sm">
                      {a.profiles?.full_name} ·{" "}
                      <span className="text-muted-foreground">{a.profiles?.email}</span>
                      <br />
                      <span className="text-muted-foreground">
                        {a.phone} · {fmtDate(a.created_at)}
                      </span>
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setReviewing({ app: a, action: "approve" })}>
                        <Check /> {t("admin.approve")}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewing({ app: a, action: "reject" })}
                      >
                        <X /> {t("admin.reject")}
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("admin.history")}</CardTitle>
                </CardHeader>
                <Table>
                  <THead>
                    <TR>
                      <TH>{t("apply.businessName")}</TH>
                      <TH>{t("common.status")}</TH>
                      <TH>{t("apply.reviewerNote")}</TH>
                      <TH>{t("common.date")}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {history.map((a) => (
                      <TR key={a.id}>
                        <TD className="font-medium">{a.business_name}</TD>
                        <TD>
                          <Badge variant={a.status === "approved" ? "success" : "destructive"}>
                            {t(`status.${a.status}`)}
                          </Badge>
                        </TD>
                        <TD className="max-w-xs truncate text-muted-foreground">
                          {a.reviewer_note ?? "—"}
                        </TD>
                        <TD className="text-muted-foreground">
                          {a.reviewed_at ? fmtDate(a.reviewed_at) : "—"}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="businesses">
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>{t("common.name")}</TH>
                    <TH>{t("apply.category")}</TH>
                    <TH>{t("admin.code")}</TH>
                    <TH>{t("common.status")}</TH>
                    <TH className="text-right">{t("common.actions")}</TH>
                  </TR>
                </THead>
                <TBody>
                  {bizQ.data?.map((b) => (
                    <TR key={b.id}>
                      <TD>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">
                          /b/{b.slug} · {b.city}
                        </p>
                      </TD>
                      <TD>{t(`categories.${b.category}`)}</TD>
                      <TD className="font-mono text-xs">{b.booking_code}</TD>
                      <TD>
                        <Badge variant={b.status === "active" ? "success" : "destructive"}>
                          {b.status === "active" ? t("common.active") : t("status.suspended")}
                        </Badge>
                      </TD>
                      <TD className="text-right">
                        <Button
                          size="sm"
                          variant={b.status === "active" ? "outline" : "default"}
                          loading={statusM.isPending && statusM.variables?.id === b.id}
                          onClick={() => statusM.mutate(b)}
                        >
                          {b.status === "active" ? t("admin.suspend") : t("admin.reactivate")}
                        </Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      <ConfirmDialog
        open={Boolean(reviewing)}
        onOpenChange={(o) => !o && setReviewing(null)}
        destructive={reviewing?.action === "reject"}
        title={
          reviewing?.action === "approve"
            ? t("admin.approveTitle", { name: reviewing.app.business_name })
            : t("admin.rejectTitle", { name: reviewing?.app.business_name ?? "" })
        }
        description={
          reviewing?.action === "approve" ? t("admin.approveHint") : t("admin.rejectHint")
        }
        confirmLabel={reviewing?.action === "approve" ? t("admin.approve") : t("admin.reject")}
        cancelLabel={t("common.cancel")}
        loading={reviewM.isPending}
        onConfirm={() => reviewM.mutate()}
      >
        <Textarea
          aria-label={t("apply.reviewerNote")}
          placeholder={t("admin.notePlaceholder")}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
}
