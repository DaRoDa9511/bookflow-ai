import { Check, PartyPopper } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Logo, Preferences } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useServices, useStaff, useWorkingHours } from "@/features/catalog/api";
import { HoursEditor } from "@/features/catalog/HoursEditor";
import { KnowledgeEditor } from "@/features/catalog/KnowledgeEditor";
import { ServicesEditor } from "@/features/catalog/ServicesEditor";
import { ShareCard } from "@/features/catalog/ShareCard";
import { StaffEditor } from "@/features/catalog/StaffEditor";
import { useAuth, useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export default function Onboarding() {
  const { t } = useTranslation();
  const { business } = useBusiness();
  const { refresh } = useAuth();
  const [step, setStep] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [done, setDone] = useState(business.onboarding_completed);
  const services = useServices(business.id).data ?? [];
  const staff = useStaff(business.id).data ?? [];
  const hours = useWorkingHours(business.id).data ?? [];

  const steps = [
    {
      title: t("onboarding.stepServices"),
      hint: t("onboarding.stepServicesHint"),
      ok: services.length > 0,
    },
    { title: t("onboarding.stepStaff"), hint: t("onboarding.stepStaffHint"), ok: staff.length > 0 },
    { title: t("onboarding.stepHours"), hint: t("onboarding.stepHoursHint"), ok: hours.length > 0 },
    { title: t("onboarding.stepKnowledge"), hint: t("onboarding.stepKnowledgeHint"), ok: true },
  ];

  async function finish() {
    setFinishing(true);
    const { error } = await supabase
      .from("businesses")
      .update({ onboarding_completed: true })
      .eq("id", business.id);
    setFinishing(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refresh();
    setDone(true);
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container flex h-14 items-center justify-between">
          <Logo to="/app" />
          <Preferences />
        </div>
      </header>
      <main className="container max-w-4xl py-8">
        {done ? (
          <div className="space-y-6">
            <Card className="text-center">
              <CardHeader className="items-center">
                <PartyPopper className="h-12 w-12 text-primary" />
                <CardTitle className="text-2xl">{t("onboarding.doneTitle")}</CardTitle>
                <CardDescription>
                  {t("onboarding.doneHint", { name: business.name })}
                </CardDescription>
              </CardHeader>
            </Card>
            <ShareCard business={business} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/app/simulator">{t("onboarding.trySimulator")}</Link>
              </Button>
              <Button asChild>
                <Link to="/app">{t("onboarding.goDashboard")}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">
                {t("onboarding.title", { name: business.name })}
              </h1>
              <p className="text-sm text-muted-foreground">{t("onboarding.subtitle")}</p>
            </div>
            <ol
              className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4"
              aria-label={t("onboarding.progress")}
            >
              {steps.map((s, i) => (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => setStep(i)}
                    aria-current={i === step ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg border bg-background p-3 text-left text-sm transition",
                      i === step && "border-primary ring-1 ring-primary",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                        s.ok && i !== step ? "bg-success text-success-foreground" : "bg-muted",
                        i === step && "bg-primary text-primary-foreground",
                      )}
                    >
                      {s.ok && i !== step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                    </span>
                    <span className="font-medium">{s.title}</span>
                  </button>
                </li>
              ))}
            </ol>
            <Card>
              <CardHeader>
                <CardTitle>{steps[step].title}</CardTitle>
                <CardDescription>{steps[step].hint}</CardDescription>
              </CardHeader>
              <CardContent>
                {step === 0 && <ServicesEditor business={business} />}
                {step === 1 && <StaffEditor business={business} />}
                {step === 2 && <HoursEditor business={business} />}
                {step === 3 && <KnowledgeEditor business={business} />}
              </CardContent>
            </Card>
            <div className="mt-6 flex justify-between">
              <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                {t("common.back")}
              </Button>
              {step < 3 ? (
                <Button disabled={!steps[step].ok} onClick={() => setStep((s) => s + 1)}>
                  {t("common.next")}
                </Button>
              ) : (
                <Button
                  loading={finishing}
                  disabled={!steps.slice(0, 3).every((s) => s.ok)}
                  onClick={finish}
                >
                  {t("onboarding.finish")}
                </Button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
