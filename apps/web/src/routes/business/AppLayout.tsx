import {
  Bot,
  CalendarDays,
  ChevronsUpDown,
  Clock,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageSquare,
  Scissors,
  Settings,
  Smartphone,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Logo, Preferences } from "@/components/brand";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLiveAlerts } from "@/features/alerts";
import { useHandoffCount } from "@/features/chat/api";
import { useAuth, useBusiness } from "@/lib/auth";
import { cn } from "@/lib/utils";

export default function AppLayout() {
  const { t } = useTranslation();
  const { business, isOwner, staffId } = useBusiness();
  const { memberships, setActiveBusiness, signOut, profile } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const handoffs = useHandoffCount(business.id, isOwner);
  useLiveAlerts(business, isOwner, staffId);

  const items = [
    { to: "/app", label: t("nav.dashboard"), icon: LayoutDashboard, owner: true, end: true },
    { to: "/app/calendar", label: t("nav.calendar"), icon: CalendarDays, owner: false },
    { to: "/app/bookings", label: t("nav.bookings"), icon: ListChecks, owner: false },
    { to: "/app/customers", label: t("nav.customers"), icon: UsersRound, owner: true },
    { to: "/app/inbox", label: t("nav.inbox"), icon: MessageSquare, owner: true, badge: handoffs },
    { to: "/app/simulator", label: t("nav.simulator"), icon: Smartphone, owner: true },
    { section: t("nav.setup"), owner: true },
    { to: "/app/services", label: t("nav.services"), icon: Scissors, owner: true },
    { to: "/app/staff", label: t("nav.staff"), icon: Users, owner: true },
    {
      to: "/app/hours",
      label: isOwner ? t("nav.hours") : t("nav.myTimeOff"),
      icon: Clock,
      owner: false,
    },
    { to: "/app/assistant", label: t("nav.assistant"), icon: Bot, owner: true },
    { to: "/app/settings", label: t("nav.settings"), icon: Settings, owner: true },
  ].filter((i) => isOwner || !i.owner);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3" aria-label="main">
      {items.map((item, idx) =>
        "section" in item ? (
          <p
            key={idx}
            className="mt-4 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            {item.section}
          </p>
        ) : (
          <NavLink
            key={item.to}
            to={item.to!}
            end={item.end}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive &&
                  "bg-accent font-semibold text-foreground shadow-[inset_2px_0_0_hsl(var(--primary))]",
              )
            }
          >
            {item.icon && <item.icon className="h-4 w-4" />}
            <span className="flex-1">{item.label}</span>
            {item.badge ? <Badge variant="destructive">{item.badge}</Badge> : null}
          </NavLink>
        ),
      )}
    </nav>
  );

  const switcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md border bg-background p-2 text-left text-sm hover:bg-accent">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 font-semibold text-primary">
            {business.name.slice(0, 1)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{business.name}</span>
            <span className="block text-xs text-muted-foreground">
              {isOwner ? t("nav.roleOwner") : t("nav.roleStaff")}
            </span>
          </span>
          {memberships.length > 1 && <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />}
        </button>
      </DropdownMenuTrigger>
      {memberships.length > 1 && (
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel>{t("nav.switchBusiness")}</DropdownMenuLabel>
          {memberships.map((m) => (
            <DropdownMenuItem
              key={m.business_id}
              onSelect={() => {
                setActiveBusiness(m.business_id);
                navigate(m.role === "owner" ? "/app" : "/app/calendar");
              }}
            >
              <span className="flex-1 truncate">{m.businesses.name}</span>
              <span className="text-xs text-muted-foreground">
                {m.role === "owner" ? t("nav.roleOwner") : t("nav.roleStaff")}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Logo to={isOwner ? "/app" : "/app/calendar"} />
      </div>
      <div className="border-b p-3">{switcher}</div>
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t p-3">
        <p className="truncate px-1 pb-2 text-xs text-muted-foreground">{profile?.email}</p>
        <Button variant="ghost" className="w-full justify-start" onClick={signOut}>
          <LogOut /> {t("common.signOut")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-muted/30">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r bg-background lg:block">
        {sidebar}
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-background shadow-xl">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-3"
              aria-label={t("common.close")}
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background/90 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t("common.menu")}
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
          <p className="truncate text-sm font-medium lg:hidden">{business.name}</p>
          <div className="ml-auto">
            <Preferences />
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
