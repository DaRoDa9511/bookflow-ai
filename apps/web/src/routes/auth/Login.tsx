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
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

const schema = z.object({ email: z.string().email(), password: z.string().min(6) });
type Form = z.infer<typeof schema>;

export default function Login() {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) toast.error(t("errors.invalid_credentials"));
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("auth.loginTitle")}</CardTitle>
          <CardDescription>{t("auth.loginSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!isSupabaseConfigured && (
            <p className="rounded-md bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
              {t("common.notConfigured")}
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={handleSubmit((v) => signIn(v.email, v.password))}
            noValidate
          >
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
              error={errors.password && t("auth.passwordShort")}
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
              />
            </Field>
            <div className="-mt-2 text-right">
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                {t("password.forgotLink")}
              </Link>
            </div>
            <Button type="submit" className="w-full" loading={isSubmitting}>
              {t("auth.login")}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link to="/signup" className="font-medium text-primary hover:underline">
              {t("auth.signup")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
