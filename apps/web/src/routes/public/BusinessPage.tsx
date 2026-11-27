import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarCheck,
  CalendarPlus,
  Check,
  ChevronLeft,
  Clock,
  MapPin,
  MessageCircle,
  Phone,
  Store,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { formatInZone, localDate } from "@shared/time.ts";
import { Logo, Preferences } from "@/components/brand";
import { FullPageLoader } from "@/components/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/misc";
import { DateStrip, SlotPicker } from "@/features/availability/SlotPicker";
import { waLink } from "@/features/catalog/ShareCard";
import { StaffAvatar } from "@/features/catalog/StaffEditor";
import { dialCodeFor, phonePlaceholder, timezoneLabel } from "@/lib/regional";
import { supabase } from "@/lib/supabase";
import { cn, E164, errorCode, formatMoney, normalizePhone } from "@/lib/utils";
import type { PublicBusiness } from "@/types/models";

type Step = 0 | 1 | 2 | 3 | 4;

function icsFile(p: { title: string; start: string; end: string; location?: string | null }) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BookFlow AI//EN",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@bookflow`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(p.start)}`,
    `DTEND:${fmt(p.end)}`,
    `SUMMARY:${p.title}`,
    p.location ? `LOCATION:${p.location}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

export default function BusinessPage() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const [step, setStep] = useState<Step>(0);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ start: string; staff_id: string } | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const bizQ = useQuery({
    queryKey: ["public-business", slug],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_business", { p_slug: slug });
      if (error) throw error;
      return data as PublicBusiness | null;
    },
  });

  const book = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("create_public_booking", {
        p_slug: slug,
        p_service_id: serviceId,
        p_staff_id: slot!.staff_id,
        p_starts_at: slot!.start,
        p_customer_name: name.trim(),
        p_customer_phone: normalizePhone(phone, dialCodeFor(bizQ.data?.business.timezone)),
      });
      if (error) throw error;
      return data as { booking_id: string; starts_at: string; ends_at: string };
    },
    onSuccess: () => setStep(4),
  });

  if (bizQ.isLoading) return <FullPageLoader />;
  const data = bizQ.data;
  if (!data) {
    return (
      <div className="container flex min-h-screen items-center justify-center">
        <EmptyState
          icon={<Store />}
          title={t("public.notFound")}
          description={t("public.notFoundHint")}
          action={
            <Button asChild variant="outline">
              <Link to="/">{t("public.backHome")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const { business, services, staff } = data;
  const tz = business.timezone;
  const service = services.find((s) => s.id === serviceId);
  const eligible = staff.filter((s) => !serviceId || s.service_ids.includes(serviceId));
  const staffNames = Object.fromEntries(staff.map((s) => [s.id, s.display_name]));
  const normalized = normalizePhone(phone, dialCodeFor(tz));
  const phoneOk = E164.test(normalized);
  const money = (n: number) => formatMoney(n, business.currency, i18n.language);
  const stepsLabels = [
    t("public.stepService"),
    t("public.stepStaff"),
    t("public.stepTime"),
    t("public.stepDetails"),
  ];
  const wa = waLink(business.booking_code);

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <Logo />
          <Preferences />
        </div>
      </header>

      <section className="border-b bg-gradient-to-b from-accent/70 to-background">
        <div className="container flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            {business.logo_url ? (
              <img
                src={business.logo_url}
                alt=""
                className="h-16 w-16 rounded-xl border bg-background object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary text-2xl font-bold text-primary-foreground">
                {business.name.slice(0, 1)}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{business.name}</h1>
              <p className="text-sm text-muted-foreground">
                {t(`categories.${business.category}`)}
                {business.city && ` · ${business.city}`}
              </p>
              {business.address && (
                <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" /> {business.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden rounded-lg bg-white p-2 sm:block" aria-hidden>
              <QRCodeSVG value={wa} size={84} />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="whatsapp" asChild>
                <a href={wa} target="_blank" rel="noreferrer">
                  <MessageCircle /> {t("public.bookOnWhatsApp")}
                </a>
              </Button>
              {business.phone && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`tel:${business.phone}`}>
                    <Phone /> {business.phone}
                  </a>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      <main className="container grid grid-cols-1 gap-6 py-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>
              {step === 4 ? t("public.confirmedTitle") : t("public.bookOnline")}
            </CardTitle>
            {step < 4 && (
              <ol
                className="flex flex-wrap gap-2 pt-2 text-xs"
                aria-label={t("onboarding.progress")}
              >
                {stepsLabels.map((l, i) => (
                  <li
                    key={l}
                    aria-current={i === step ? "step" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                      i === step && "border-primary bg-primary text-primary-foreground",
                      i < step && "border-success/40 text-success",
                    )}
                  >
                    {i < step ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>} {l}
                  </li>
                ))}
              </ol>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setServiceId(s.id);
                      setStaffId(null);
                      setSlot(null);
                      setDate((d) => d ?? localDate(new Date(), tz));
                      setStep(1);
                    }}
                    className="rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                  >
                    <p className="font-medium">{s.name}</p>
                    <p className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />{" "}
                        {t("common.minutes", { count: s.duration_min })}
                      </span>
                      <span className="font-medium text-foreground">{money(s.price)}</span>
                    </p>
                    {s.description && (
                      <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                    )}
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setStaffId(null);
                    setStep(2);
                  }}
                  className="flex items-center gap-3 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarCheck className="h-4 w-4" />
                  </span>
                  <span className="font-medium">{t("booking.anyStaff")}</span>
                </button>
                {eligible.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setStaffId(s.id);
                      setStep(2);
                    }}
                    className="flex items-center gap-3 rounded-lg border p-4 text-left transition hover:border-primary hover:bg-accent"
                  >
                    <StaffAvatar staff={s} />
                    <span>
                      <span className="block font-medium">{s.display_name}</span>
                      {s.bio && (
                        <span className="block text-xs text-muted-foreground">{s.bio}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <DateStrip
                  timezone={tz}
                  value={date}
                  onChange={(d) => {
                    setDate(d);
                    setSlot(null);
                  }}
                />
                {date ? (
                  <SlotPicker
                    slug={slug}
                    timezone={tz}
                    serviceId={serviceId}
                    staffId={staffId}
                    date={date}
                    value={slot}
                    onChange={(s) => {
                      setSlot(s);
                      setStep(3);
                    }}
                    staffNames={staffNames}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t("public.pickDate")}</p>
                )}
              </div>
            )}

            {step === 3 && slot && (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (phoneOk && name.trim().length >= 2) book.mutate();
                }}
                noValidate
              >
                <Field label={t("common.name")} htmlFor="p-name">
                  <Input
                    id="p-name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field
                  label={t("public.whatsappNumber")}
                  htmlFor="p-phone"
                  hint={t("public.phoneHint")}
                  error={phone && !phoneOk ? t("errors.invalid_phone") : undefined}
                >
                  <Input
                    id="p-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder={phonePlaceholder(tz)}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
                {book.error && (
                  <p
                    className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                    role="alert"
                  >
                    {t(`errors.${errorCode(book.error)}` as "errors.forbidden", {
                      defaultValue: t("common.error"),
                    })}
                  </p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  loading={book.isPending}
                  disabled={!phoneOk || name.trim().length < 2}
                >
                  {t("public.confirmBooking")}
                </Button>
              </form>
            )}

            {step === 4 && slot && service && (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
                  <Check className="h-7 w-7" />
                </div>
                <p className="text-lg font-semibold">
                  {service.name} · {staffNames[slot.staff_id]}
                </p>
                <p className="text-muted-foreground">
                  {formatInZone(slot.start, tz, i18n.language, {
                    dateStyle: "full",
                    timeStyle: "short",
                  })}
                </p>
                <p className="text-sm text-muted-foreground">{t("public.confirmedHint")}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      const end = new Date(
                        new Date(slot.start).getTime() + service.duration_min * 60_000,
                      ).toISOString();
                      const blob = new Blob(
                        [
                          icsFile({
                            title: `${service.name} · ${business.name}`,
                            start: slot.start,
                            end,
                            location: business.address,
                          }),
                        ],
                        { type: "text/calendar" },
                      );
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "cita.ics";
                      a.click();
                    }}
                  >
                    <CalendarPlus /> {t("public.addToCalendar")}
                  </Button>
                  <Button variant="outline" asChild>
                    <Link to="/me">{t("public.myBookings")}</Link>
                  </Button>
                  <Button
                    onClick={() => {
                      setStep(0);
                      setSlot(null);
                      setServiceId(null);
                      book.reset();
                    }}
                  >
                    {t("public.bookAnother")}
                  </Button>
                </div>
              </div>
            )}

            {step > 0 && step < 4 && (
              <Button variant="ghost" size="sm" onClick={() => setStep((s) => (s - 1) as Step)}>
                <ChevronLeft /> {t("common.back")}
              </Button>
            )}
          </CardContent>
        </Card>

        <aside className="space-y-4">
          {(service || slot) && step < 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("public.summary")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {service && (
                  <p className="flex justify-between">
                    <span>{service.name}</span>
                    <span className="font-medium">{money(service.price)}</span>
                  </p>
                )}
                {step >= 2 && (
                  <p className="text-muted-foreground">
                    {staffId ? staffNames[staffId] : t("booking.anyStaff")}
                  </p>
                )}
                {slot && (
                  <p className="font-medium">
                    {formatInZone(slot.start, tz, i18n.language, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                    {!staffId && ` · ${staffNames[slot.staff_id]}`}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("public.team")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {staff.map((s) => (
                <div key={s.id} className="flex items-center gap-3 text-sm">
                  <StaffAvatar staff={s} className="h-8 w-8" />
                  <div>
                    <p className="font-medium">{s.display_name}</p>
                    {s.bio && <p className="text-xs text-muted-foreground">{s.bio}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <p className="px-1 text-xs text-muted-foreground">
            {t("public.policy", { hours: business.cancellation_hours })} ·{" "}
            {t("public.timesIn", {
              tz: timezoneLabel(tz, i18n.language),
              today: localDate(new Date(), tz),
            })}
          </p>
        </aside>
      </main>
    </div>
  );
}
