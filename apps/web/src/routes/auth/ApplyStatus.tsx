import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link, Navigate } from "react-router-dom";
import { AuthLayout } from "@/components/brand";
import { FullPageLoader } from "@/components/guards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { useMyApplication } from "./Apply";

export default function ApplyStatus() {
  const { t } = useTranslation();
  const { memberships, refresh, signOut } = useAuth();
  const appQ = useMyApplication();
  const app = appQ.data;

  // Poll while pending so the owner sees the approval without reloading.
  useEffect(() => {
    if (app?.status !== "pending") return;
    const id = setInterval(() => void appQ.refetch(), 15_000);
    return () => clearInterval(id);
  }, [app?.status, appQ]);

  useEffect(() => {
    if (app?.status === "approved" && memberships.length === 0) void refresh();
  }, [app?.status, memberships.length, refresh]);

  if (appQ.isLoading) return <FullPageLoader />;
  if (!app) return <Navigate to="/apply" replace />;

  const icon =
    app.status === "approved" ? (
      <CheckCircle2 className="h-12 w-12 text-success" />
    ) : app.status === "rejected" ? (
      <XCircle className="h-12 w-12 text-destructive" />
    ) : (
      <Clock className="h-12 w-12 text-primary" />
    );

  return (
    <AuthLayout>
      <Card>
        <CardHeader className="items-center text-center">
          {icon}
          <CardTitle className="text-xl">{t(`apply.status_${app.status}`)}</CardTitle>
          <Badge
            variant={
              app.status === "approved"
                ? "success"
                : app.status === "rejected"
                  ? "destructive"
                  : "default"
            }
          >
            {t(`status.${app.status}`)}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            {t(`apply.statusHint_${app.status}`, { name: app.business_name })}
          </p>
          {app.reviewer_note && (
            <blockquote className="rounded-md bg-muted p-3 text-left text-sm">
              <span className="font-medium">{t("apply.reviewerNote")}:</span> {app.reviewer_note}
            </blockquote>
          )}
          <div className="flex flex-col gap-2">
            {app.status === "approved" && (
              <Button asChild>
                <Link to="/app/onboarding">{t("apply.goToPanel")}</Link>
              </Button>
            )}
            {app.status === "rejected" && (
              <Button asChild>
                <Link to="/apply">{t("apply.applyAgain")}</Link>
              </Button>
            )}
            <Button variant="ghost" onClick={signOut}>
              {t("common.signOut")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
