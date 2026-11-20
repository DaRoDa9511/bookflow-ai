import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { AuthLayout } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

const schema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});
type Form = z.infer<typeof schema>;

export default function Signup() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function onSubmit(v: Form) {
    const { data, error } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        data: { full_name: v.fullName },
        emailRedirectTo: `${window.location.origin}/apply`,
      },
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    // With email confirmation enabled there is no session yet.
    if (!data.session) toast.success(t("auth.checkEmail"), { duration: 10_000 });
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("auth.signupTitle")}</CardTitle>
          <CardDescription>{t("auth.signupSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <Field
              label={t("auth.fullName")}
              htmlFor="fullName"
              error={errors.fullName && t("auth.nameRequired")}
            >
              <Input id="fullName" autoComplete="name" {...register("fullName")} />
            </Field>
            <Field
              label={t("common.email")}
              htmlFor="email"
              error={errors.email && t("auth.invalidEmail")}
            >
              <Input id="email" type="email" autoComplete="email" {...register("email")} />
            </Field>
            <Field
              label={t("auth.password")}
              htmlFor="password"
              hint={t("auth.passwordHint")}
              error={errors.password && t("auth.passwordShort")}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...register("password")}
              />
            </Field>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              {t("auth.signup")}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            {t("auth.haveAccount")}{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              {t("auth.login")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
