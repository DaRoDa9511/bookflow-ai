import {
  ArrowRight,
  BellRing,
  Bot,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  Globe,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Scissors,
  Flower2,
  Smile,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Logo, Preferences } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function DemoChat() {
  const { t } = useTranslation();
  const script = t("landing.chat", { returnObjects: true }) as {
    from: "user" | "bot";
    text: string;
  }[];
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (shown >= script.length) {
      const reset = setTimeout(() => setShown(1), 4000);
      return () => clearTimeout(reset);
    }
    const id = setTimeout(() => setShown((n) => n + 1), 1600);
    return () => clearTimeout(id);
  }, [shown, script.length]);

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] border-[10px] border-neutral-900 bg-neutral-900 shadow-2xl">
      <div className="flex items-center gap-3 bg-[#008069] px-3 py-2.5 text-white">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
          D
        </div>
        <div>
          <p className="text-sm font-semibold">Barbería Don Pepe</p>
          <p className="text-xs opacity-80">{t("simulator.online")}</p>
        </div>
      </div>
      <div className="h-[380px] space-y-2 overflow-hidden bg-[#efeae2] p-3" aria-live="polite">
        {script.slice(0, shown).map((m, i) => (
          <div
            key={i}
            className={cn(
              "flex animate-in fade-in slide-in-from-bottom-2",
              m.from === "user" ? "justify-end" : "justify-start",
            )}
          >
            <p
              className={cn(
                "max-w-[85%] whitespace-pre-line rounded-lg px-3 py-1.5 text-sm text-[#111b21] shadow-sm",
                m.from === "user" ? "rounded-tr-none bg-[#d9fdd3]" : "rounded-tl-none bg-white",
              )}
            >
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  const { t } = useTranslation();
  const steps = [
    { icon: MessageCircle, title: t("landing.step1"), text: t("landing.step1Text") },
    { icon: Bot, title: t("landing.step2"), text: t("landing.step2Text") },
    { icon: CalendarCheck, title: t("landing.step3"), text: t("landing.step3Text") },
  ];
  const features = [
    { icon: Clock, title: t("landing.f1"), text: t("landing.f1Text") },
    { icon: CalendarDays, title: t("landing.f2"), text: t("landing.f2Text") },
    { icon: BellRing, title: t("landing.f3"), text: t("landing.f3Text") },
    { icon: Globe, title: t("landing.f4"), text: t("landing.f4Text") },
    { icon: ShieldCheck, title: t("landing.f5"), text: t("landing.f5Text") },
    { icon: Sparkles, title: t("landing.f6"), text: t("landing.f6Text") },
  ];
  const verticals = [
    { icon: Scissors, label: t("categories.barbershop") },
    { icon: Flower2, label: t("categories.salon") },
    { icon: Stethoscope, label: t("categories.clinic") },
    { icon: Smile, label: t("categories.spa") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between gap-2">
          <Logo />
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="main">
            <Preferences />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/login">{t("auth.login")}</Link>
            </Button>
            <Button size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/signup">{t("landing.ctaRegister")}</Link>
            </Button>
            <Button size="sm" variant="outline" asChild className="sm:hidden">
              <Link to="/login">{t("auth.login")}</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,hsl(var(--accent)),transparent_60%)]" />
          <div className="container grid items-center gap-12 py-16 lg:grid-cols-2 lg:py-24">
            <div className="space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" /> {t("landing.badge")}
              </span>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                {t("landing.heroTitle")}{" "}
                <span className="text-primary">{t("landing.heroHighlight")}</span>
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">{t("landing.heroText")}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button size="lg" asChild>
                  <Link to="/signup">
                    {t("landing.ctaRegister")} <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link to="/login">{t("landing.ctaDemo")}</Link>
                </Button>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {[t("landing.check1"), t("landing.check2"), t("landing.check3")].map((c) => (
                  <li key={c} className="flex items-center gap-1.5">
                    <Check className="h-4 w-4 text-success" /> {c}
                  </li>
                ))}
              </ul>
            </div>
            <DemoChat />
          </div>
        </section>

        <section className="border-y bg-muted/40 py-16" aria-labelledby="how">
          <div className="container">
            <h2 id="how" className="text-center text-3xl font-bold tracking-tight">
              {t("landing.howTitle")}
            </h2>
            <div className="mt-10 grid gap-6 md:grid-cols-3">
              {steps.map((s, i) => (
                <div key={s.title} className="rounded-xl border bg-background p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <s.icon className="h-5 w-5" />
                    </span>
                    <span className="text-sm font-medium text-muted-foreground">{i + 1}</span>
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container py-16" aria-labelledby="features">
          <h2 id="features" className="text-center text-3xl font-bold tracking-tight">
            {t("landing.featuresTitle")}
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="space-y-2">
                <f.icon className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/40 py-16" aria-labelledby="verticals">
          <div className="container text-center">
            <h2 id="verticals" className="text-3xl font-bold tracking-tight">
              {t("landing.verticalsTitle")}
            </h2>
            <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              {verticals.map((v) => (
                <div
                  key={v.label}
                  className="flex flex-col items-center gap-2 rounded-xl border bg-background p-5"
                >
                  <v.icon className="h-7 w-7 text-primary" />
                  <span className="text-sm font-medium">{v.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/signup">{t("landing.ctaRegister")}</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/b/barberia-don-pepe">{t("landing.ctaPublic")}</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <Logo />
          <p>{t("landing.footer")}</p>
          <Link to="/me" className="hover:text-foreground">
            {t("me.title")}
          </Link>
        </div>
      </footer>
    </div>
  );
}
