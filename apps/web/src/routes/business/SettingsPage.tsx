import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, MailPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PageHeader, Switch } from "@/components/ui/misc";
import { useStaff } from "@/features/catalog/api";
import { CURRENCIES, currencyLabel, timezoneLabel, timezoneOptions } from "@/lib/regional";
import { useAuth, useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { E164, errorCode, normalizePhone } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string(),
  address: z.string().optional(),
  city: z.string().optional(),
  timezone: z.string(),
  currency: z.string().length(3),
  cancellation_hours: z.coerce.number().int().min(0).max(168),
  remind24: z.boolean(),
  remind2: z.boolean(),
});
type Form = z.infer<typeof schema>;

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { business } = useBusiness();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const staff = useStaff(business.id).data ?? [];
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteStaff, setInviteStaff] = useState("");
  const [inviting, setInviting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const membersQ = useQuery({
    queryKey: ["members", business.id],
    queryFn: async () => {
      const [m, inv] = await Promise.all([
        supabase
          .from("memberships")
          .select("role, staff_id, profiles(full_name, email)")
          .eq("business_id", business.id),
        supabase
          .from("staff_invitations")
          .select("*")
          .eq("business_id", business.id)
          .is("accepted_at", null),
      ]);
      return {
        members: (m.data ?? []) as unknown as {
          role: string;
          staff_id: string | null;
          profiles: { full_name: string | null; email: string | null } | null;
        }[],
        invitations: (inv.data ?? []) as { id: string; email: string; staff_id: string | null }[],
      };
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: business.name,
      phone: business.phone ?? "",
      address: business.address ?? "",
      city: business.city ?? "",
      timezone: business.timezone,
      currency: business.currency,
      cancellation_hours: business.cancellation_hours,
      remind24: business.reminder_hours.includes(24),
      remind2: business.reminder_hours.includes(2),
    },
  });

  async function onSubmit(v: Form) {
    const phone = v.phone ? normalizePhone(v.phone) : null;
    if (phone && !E164.test(phone)) {
      toast.error(t("errors.invalid_phone"));
      return;
    }
    const { error } = await supabase
      .from("businesses")
      .update({
        name: v.name,
        phone,
        address: v.address || null,
        city: v.city || null,
        timezone: v.timezone,
        currency: v.currency.toUpperCase(),
        cancellation_hours: v.cancellation_hours,
        reminder_hours: [...(v.remind24 ? [24] : []), ...(v.remind2 ? [2] : [])],
      })
      .eq("id", business.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    await refresh();
  }

  async function uploadLogo(file: File) {
    setUploading(true);
    const path = `${business.id}/logo-${Date.now()}.${file.name.split(".").pop() ?? "png"}`;
    const up = await supabase.storage.from("logos").upload(path, file, { upsert: true });
    if (up.error) {
      setUploading(false);
      toast.error(up.error.message);
      return;
    }
    const url = supabase.storage.from("logos").getPublicUrl(path).data.publicUrl;
    const { error } = await supabase
      .from("businesses")
      .update({ logo_url: url })
      .eq("id", business.id);
    setUploading(false);
    if (error) toast.error(error.message);
    else {
      toast.success(t("common.saved"));
      await refresh();
    }
  }

  async function invite() {
    setInviting(true);
    const { data, error } = await supabase.rpc("invite_staff", {
      p_business_id: business.id,
      p_email: inviteEmail.trim(),
      p_staff_id: inviteStaff || null,
    });
    setInviting(false);
    if (error) {
      toast.error(
        t(`errors.${errorCode(error)}` as "errors.forbidden", { defaultValue: error.message }),
      );
      return;
    }
    toast.success(
      (data as { status: string }).status === "added"
        ? t("settings.inviteAdded")
        : t("settings.inviteSaved"),
    );
    setInviteEmail("");
    await qc.invalidateQueries({ queryKey: ["members", business.id] });
  }

  const zones = timezoneOptions(business.timezone);
  const currencies = CURRENCIES.includes(business.currency)
    ? CURRENCIES
    : [business.currency, ...CURRENCIES];
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.display_name;

  return (
    <>
      <PageHeader title={t("nav.settings")} description={t("settings.subtitle")} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.business")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
              <div className="flex items-center gap-4">
                {business.logo_url ? (
                  <img
                    src={business.logo_url}
                    alt=""
                    className="h-16 w-16 rounded-lg border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 text-2xl font-bold text-primary">
                    {business.name.slice(0, 1)}
                  </div>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])}
                  />
                  <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent">
                    <ImageUp className="h-4 w-4" />{" "}
                    {uploading ? t("common.loading") : t("settings.uploadLogo")}
                  </span>
                </label>
              </div>
              <Field
                label={t("apply.businessName")}
                htmlFor="st-name"
                error={errors.name && t("catalog.nameRequired")}
              >
                <Input id="st-name" {...register("name")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("common.phone")} htmlFor="st-phone">
                  <Input id="st-phone" type="tel" {...register("phone")} />
                </Field>
                <Field label={t("apply.city")} htmlFor="st-city">
                  <Input id="st-city" {...register("city")} />
                </Field>
              </div>
              <Field label={t("settings.address")} htmlFor="st-address">
                <Input id="st-address" {...register("address")} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("apply.timezone")} htmlFor="st-tz">
                  <Select id="st-tz" {...register("timezone")}>
                    {zones.map((z) => (
                      <option key={z} value={z}>
                        {timezoneLabel(z, i18n.language)}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("settings.currency")} htmlFor="st-cur">
                  <Select id="st-cur" {...register("currency")}>
                    {currencies.map((c) => (
                      <option key={c} value={c}>
                        {currencyLabel(c, i18n.language)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="space-y-3 rounded-lg border p-4">
                <p className="text-sm font-medium">{t("settings.policies")}</p>
                <Field
                  label={t("settings.cancellationHours")}
                  htmlFor="st-cancel"
                  hint={t("settings.cancellationHint")}
                >
                  <Input
                    id="st-cancel"
                    type="number"
                    min={0}
                    max={168}
                    className="w-32"
                    {...register("cancellation_hours")}
                  />
                </Field>
                <p className="text-sm font-medium">{t("settings.reminders")}</p>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={watch("remind24")}
                    onCheckedChange={(v) => setValue("remind24", v)}
                  />
                  {t("settings.remind24")}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={watch("remind2")}
                    onCheckedChange={(v) => setValue("remind2", v)}
                  />
                  {t("settings.remind2")}
                </label>
              </div>
              <div className="space-y-2 rounded-lg border border-dashed p-4">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{t("settings.deposits")}</p>
                  <Badge variant="secondary">{t("settings.soon")}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{t("settings.depositsHint")}</p>
              </div>
              <div className="flex justify-end">
                <Button type="submit" loading={isSubmitting}>
                  {t("common.save")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.team")}</CardTitle>
            <CardDescription>{t("settings.teamHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
              <Input
                type="email"
                aria-label={t("common.email")}
                placeholder="barbero@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Select
                aria-label={t("common.staff")}
                value={inviteStaff}
                onChange={(e) => setInviteStaff(e.target.value)}
              >
                <option value="">{t("settings.linkStaff")}</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.display_name}
                  </option>
                ))}
              </Select>
              <Button
                loading={inviting}
                disabled={!/^\S+@\S+\.\S+$/.test(inviteEmail)}
                onClick={invite}
              >
                <MailPlus /> {t("settings.invite")}
              </Button>
            </div>
            <div className="divide-y rounded-lg border">
              {membersQ.data?.members.map((m, i) => (
                <div key={i} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{m.profiles?.full_name ?? m.profiles?.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.profiles?.email}
                      {m.staff_id && ` · ${staffName(m.staff_id) ?? ""}`}
                    </p>
                  </div>
                  <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                    {m.role === "owner" ? t("nav.roleOwner") : t("nav.roleStaff")}
                  </Badge>
                </div>
              ))}
              {membersQ.data?.invitations.map((inv) => (
                <div key={inv.id} className="flex items-center justify-between p-3 text-sm">
                  <div>
                    <p className="font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">{staffName(inv.staff_id) ?? ""}</p>
                  </div>
                  <Badge variant="warning">{t("settings.invited")}</Badge>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("settings.inviteHowTo", { url: `${window.location.origin}/signup` })}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
