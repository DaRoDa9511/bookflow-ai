import { CheckCircle2, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AuthLayout } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

/** Step 1: ask for the account email and send the reset link. */
export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const valid = /^\S+@\S+\.\S+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSent(true);
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("password.forgotTitle")}</CardTitle>
          <CardDescription>{t("password.forgotHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {sent ? (
            <div className="flex flex-col items-center gap-3 text-center text-sm">
              <MailCheck className="h-10 w-10 text-primary" />
              <p>{t("password.sent", { email })}</p>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit} noValidate>
              <Field label={t("common.email")} htmlFor="fp-email">
                <Input
                  id="fp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Button type="submit" className="w-full" loading={sending} disabled={!valid}>
                {t("password.sendLink")}
              </Button>
            </form>
          )}
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              {t("password.backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}

/** Step 2: the email link opens this page with a recovery session; set a new password. */
export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8 || password !== confirm) return;
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDone(true);
    setTimeout(() => navigate("/login", { replace: true }), 2500);
  }

  return (
    <AuthLayout>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">{t("password.resetTitle")}</CardTitle>
          <CardDescription>{t("password.resetHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 text-center text-sm">
              <CheckCircle2 className="h-10 w-10 text-success" />
              <p>{t("password.updated")}</p>
            </div>
          ) : !ready ? (
            <p className="text-sm text-muted-foreground">{t("password.invalidLink")}</p>
          ) : (
            <form className="space-y-4" onSubmit={submit} noValidate>
              <Field
                label={t("password.newPassword")}
                htmlFor="rp-pass"
                hint={t("auth.passwordHint")}
                error={tooShort ? t("auth.passwordShort") : undefined}
              >
                <Input
                  id="rp-pass"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              <Field
                label={t("password.confirmPassword")}
                htmlFor="rp-confirm"
                error={mismatch ? t("password.mismatch") : undefined}
              >
                <Input
                  id="rp-confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </Field>
              <Button
                type="submit"
                className="w-full"
                loading={saving}
                disabled={password.length < 8 || password !== confirm}
              >
                {t("password.save")}
              </Button>
            </form>
          )}
          <p className="text-center text-sm">
            <Link to="/login" className="text-primary hover:underline">
              {t("password.backToLogin")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
