import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/lib/theme";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn("h-8 w-8", className)} aria-hidden>
      <rect width="64" height="64" rx="14" className="fill-primary" />
      <path d="M18 20h18a10 10 0 0 1 0 20H26l-8 8V20z" fill="#fff" />
      <circle cx="28" cy="30" r="3" className="fill-primary" />
      <circle cx="37" cy="30" r="3" className="fill-primary" />
    </svg>
  );
}

export function Logo({ to = "/", className }: { to?: string; className?: string }) {
  return (
    <Link to={to} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="whitespace-nowrap">
        BookFlow <span className="text-primary">AI</span>
      </span>
    </Link>
  );
}

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const next = i18n.language.startsWith("es") ? "en" : "es";
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => i18n.changeLanguage(next)}
      aria-label={t("common.language")}
    >
      <Languages />
      <span className="uppercase">{next}</span>
    </Button>
  );
}

export function Preferences() {
  return (
    <div className="flex items-center gap-1">
      <LanguageToggle />
      <ThemeToggle />
    </div>
  );
}

export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-accent/60 to-background">
      <header className="container flex h-16 items-center justify-between">
        <Logo />
        <Preferences />
      </header>
      <main className="container flex flex-1 items-start justify-center py-8 sm:items-center">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
