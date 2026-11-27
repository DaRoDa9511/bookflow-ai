import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AuthLayout } from "@/components/brand";
import { FullPageLoader } from "@/components/guards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { dialCodeFor, phonePlaceholder, timezoneLabel, timezoneOptions } from "@/lib/regional";
import { E164, normalizePhone } from "@/lib/utils";
import type { Application, BusinessCategory } from "@/types/models";

const CATEGORIES: BusinessCategory[] = ["barbershop", "salon", "clinic", "spa", "other"];

const schema = z
  .object({
    business_name: z.string().min(2).max(80),
    category: z.enum(["barbershop", "salon", "clinic", "spa", "other"]),
    city: z.string().min(2),
    phone: z.string().min(6),
    timezone: z.string().min(1),
  })
  // The dialing code comes from the selected time zone (e.g. Bolivia -> +591).
  .transform((v) => ({ ...v, phone: normalizePhone(v.phone, dialCodeFor(v.timezone)) }))
  .refine((v) => E164.test(v.phone), { path: ["phone"] });
type Form = z.input<typeof schema>;

export function useMyApplication() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["my-application", session?.user.id],
    enabled: Boolean(session),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("business_applications")
        .select("*")
        .eq("user_id", session!.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as Application | null;
    },
  });
}

export default function Apply() {
  const { t, i18n } = useTranslation();
  const { session, memberships } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const appQ = useMyApplication();
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = timezoneOptions(browserTz);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { category: "barbershop", timezone: browserTz },
  });

  if (appQ.isLoading) return <FullPageLoader />;
  if (memberships.length > 0) return <Navigate to="/app" replace />;
  if (appQ.data?.status === "pending") return <Navigate to="/apply/status" replace />;

  async function onSubmit(raw: Form) {
    const v = schema.parse(raw);
    const { error } = await supabase
      .from("business_applications")
      .insert({ ...v, user_id: session!.user.id });
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["my-application"] });
    navigate("/apply/status");
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("apply.title")}</CardTitle>
          <CardDescription>{t("apply.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field
              label={t("apply.businessName")}
              htmlFor="a-name"
              error={errors.business_name && t("catalog.nameRequired")}
            >
              <Input id="a-name" placeholder="Barbería Don Pepe" {...register("business_name")} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("apply.category")} htmlFor="a-cat">
                <Select id="a-cat" {...register("category")}>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {t(`categories.${c}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("apply.city")}
                htmlFor="a-city"
                error={errors.city && t("apply.cityRequired")}
              >
                <Input id="a-city" {...register("city")} />
              </Field>
            </div>
            <Field
              label={t("common.phone")}
              htmlFor="a-phone"
              hint={t("apply.phoneHint")}
              error={errors.phone && t("errors.invalid_phone")}
            >
              <Input
                id="a-phone"
                type="tel"
                placeholder={phonePlaceholder(watch("timezone"))}
                {...register("phone")}
              />
            </Field>
            <Field label={t("apply.timezone")} htmlFor="a-tz">
              <Select id="a-tz" {...register("timezone")}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {timezoneLabel(z, i18n.language)}
                  </option>
                ))}
              </Select>
            </Field>
            {appQ.data?.status === "rejected" && (
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                {t("apply.previousRejected")}
              </p>
            )}
            <Button type="submit" className="w-full" loading={isSubmitting}>
              {t("apply.submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
