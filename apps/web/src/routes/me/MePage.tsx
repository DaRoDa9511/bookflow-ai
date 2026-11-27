import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { formatInZone } from "@shared/time.ts";
import { AuthLayout } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { statusVariant } from "@/features/bookings/api";
import { useErrorToast } from "@/features/bookings/BookingDialogs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dialCodeFor, phonePlaceholder } from "@/lib/regional";
import { E164, formatMoney, normalizePhone } from "@/lib/utils";
import type { BookingStatus } from "@/types/models";

interface MyBooking {
  id: string;
  starts_at: string;
  status: BookingStatus;
  price: number;
  business_name: string;
  business_slug: string;
  timezone: string;
  currency: string;
  cancellation_hours: number;
  service_name: string;
  staff_name: string;
}

function OtpLogin() {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const normalized = normalizePhone(phone, dialCodeFor(browserTz));

  async function send() {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: normalized });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      setSent(true);
      toast.success(t("me.codeSent"));
    }
  }
  async function verify() {
    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      phone: normalized,
      token: code,
      type: "sms",
    });
    setLoading(false);
    if (error) toast.error(t("me.invalidCode"));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{t("me.title")}</CardTitle>
        <CardDescription>{t("me.subtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Field
          label={t("public.whatsappNumber")}
          htmlFor="me-phone"
          error={phone && !E164.test(normalized) ? t("errors.invalid_phone") : undefined}
        >
          <Input
            id="me-phone"
            type="tel"
            placeholder={phonePlaceholder(browserTz)}
            value={phone}
            disabled={sent}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        {sent && (
          <Field label={t("me.code")} htmlFor="me-code">
            <Input
              id="me-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          </Field>
        )}
        {sent ? (
          <Button className="w-full" loading={loading} disabled={code.length < 6} onClick={verify}>
            {t("me.verify")}
          </Button>
        ) : (
          <Button
            className="w-full"
            loading={loading}
            disabled={!E164.test(normalized)}
            onClick={send}
          >
            {t("me.sendCode")}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export default function MePage() {
  const { t, i18n } = useTranslation();
  const { session, signOut } = useAuth();
  const qc = useQueryClient();
  const onError = useErrorToast();
  const [cancelling, setCancelling] = useState<MyBooking | null>(null);
  const isPhoneUser = Boolean(session?.user.phone);

  const bookingsQ = useQuery({
    queryKey: ["my-bookings", session?.user.id],
    enabled: isPhoneUser,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_bookings");
      if (error) throw error;
      return (data ?? []) as MyBooking[];
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_booking", {
        p_booking_id: id,
        p_reason: "customer_portal",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(t("bookings.cancelled"));
      setCancelling(null);
      void qc.invalidateQueries({ queryKey: ["my-bookings"] });
    },
    onError,
  });

  if (!isPhoneUser) {
    return (
      <AuthLayout>
        {session ? (
          <Card className="p-6 text-center text-sm">
            <p>{t("me.staffSession")}</p>
            <Button className="mt-4" variant="outline" onClick={signOut}>
              {t("common.signOut")}
            </Button>
          </Card>
        ) : (
          <OtpLogin />
        )}
      </AuthLayout>
    );
  }

  const now = new Date();
  const all = bookingsQ.data ?? [];
  const upcoming = all
    .filter((b) => new Date(b.starts_at) >= now && b.status === "confirmed")
    .reverse();
  const past = all.filter((b) => !(new Date(b.starts_at) >= now && b.status === "confirmed"));
  const canCancel = (b: MyBooking) =>
    new Date(b.starts_at).getTime() - now.getTime() >= b.cancellation_hours * 3_600_000;

  const row = (b: MyBooking, actions: boolean) => (
    <div
      key={b.id}
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm"
    >
      <div>
        <p className="font-medium">
          {b.service_name} · {b.business_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatInZone(b.starts_at, b.timezone, i18n.language, {
            dateStyle: "full",
            timeStyle: "short",
          })}{" "}
          · {b.staff_name} · {formatMoney(b.price, b.currency, i18n.language)}
        </p>
      </div>
      {actions ? (
        canCancel(b) ? (
          <Button size="sm" variant="outline" onClick={() => setCancelling(b)}>
            {t("bookings.cancelBooking")}
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t("me.tooLate", { hours: b.cancellation_hours })}
          </span>
        )
      ) : (
        <Badge variant={statusVariant[b.status]}>{t(`status.${b.status}`)}</Badge>
      )}
    </div>
  );

  return (
    <AuthLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">{t("me.myBookings")}</h1>
            <p className="text-sm text-muted-foreground">
              {session?.user.phone && `+${session.user.phone.replace(/^\+/, "")}`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut /> {t("common.signOut")}
          </Button>
        </div>
        {bookingsQ.isLoading ? (
          <Skeleton className="h-40" />
        ) : all.length === 0 ? (
          <EmptyState
            icon={<CalendarDays />}
            title={t("me.empty")}
            description={t("me.emptyHint")}
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("me.upcoming")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcoming.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("me.noUpcoming")}</p>
                ) : (
                  upcoming.map((b) => row(b, true))
                )}
              </CardContent>
            </Card>
            {past.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{t("me.past")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">{past.map((b) => row(b, false))}</CardContent>
              </Card>
            )}
          </>
        )}
        <p className="text-center text-sm">
          <Link className="text-primary hover:underline" to="/">
            BookFlow AI
          </Link>
        </p>
      </div>
      <ConfirmDialog
        open={Boolean(cancelling)}
        onOpenChange={(o) => !o && setCancelling(null)}
        title={t("bookings.cancelTitle")}
        description={
          cancelling ? `${cancelling.service_name} · ${cancelling.business_name}` : undefined
        }
        confirmLabel={t("bookings.cancelBooking")}
        cancelLabel={t("common.close")}
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
      />
    </AuthLayout>
  );
}
