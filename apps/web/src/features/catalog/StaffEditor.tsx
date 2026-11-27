import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus, Trash2, UserCheck, Users } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Field, Label } from "@/components/ui/label";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { cn, initials } from "@/lib/utils";
import type { Business, Service, Staff } from "@/types/models";
import { useQueryClient } from "@tanstack/react-query";
import {
  catalogKeys,
  setStaffServices,
  STAFF_COLORS,
  useServices,
  useStaff,
  useStaffServices,
  useTableMutation,
} from "./api";

const schema = z.object({
  display_name: z.string().min(2),
  bio: z.string().optional(),
  color: z.string(),
  is_active: z.boolean(),
  service_ids: z.array(z.string()),
});
type Form = z.infer<typeof schema>;

export function StaffAvatar({
  staff,
  className,
}: {
  staff: Pick<Staff, "display_name" | "color">;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
        className,
      )}
      style={{ backgroundColor: staff.color }}
      aria-hidden
    >
      {initials(staff.display_name)}
    </span>
  );
}

export function StaffEditor({ business }: { business: Business }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { profile, session, refresh } = useAuth();
  const [addingMe, setAddingMe] = useState(false);
  const staffQ = useStaff(business.id);
  const servicesQ = useServices(business.id);
  const linksQ = useStaffServices(business.id);
  const { upsert, remove } = useTableMutation("staff", [catalogKeys.staff(business.id)]);
  const [editing, setEditing] = useState<Partial<Staff> | null>(null);
  const [deleting, setDeleting] = useState<Staff | null>(null);

  if (staffQ.isLoading || servicesQ.isLoading) return <Skeleton className="h-40 w-full" />;
  const services = servicesQ.data ?? [];
  const links = linksQ.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() =>
            setEditing({
              is_active: true,
              color: STAFF_COLORS[(staffQ.data?.length ?? 0) % STAFF_COLORS.length],
            })
          }
        >
          <Plus /> {t("catalog.addStaff")}
        </Button>
      </div>

      {staffQ.data?.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={t("catalog.noStaff")}
          description={t("catalog.noStaffHint")}
          action={
            <Button
              loading={addingMe}
              onClick={async () => {
                setAddingMe(true);
                try {
                  const me = await upsert.mutateAsync({
                    business_id: business.id,
                    display_name: profile?.full_name || t("catalog.me"),
                    color: STAFF_COLORS[0],
                    is_active: true,
                  });
                  await setStaffServices(
                    business.id,
                    String(me.id),
                    (servicesQ.data ?? []).map((s) => s.id),
                  );
                  // Link the owner's account to this staff profile (agenda filters, etc.).
                  await supabase
                    .from("memberships")
                    .update({ staff_id: me.id })
                    .eq("business_id", business.id)
                    .eq("user_id", session!.user.id);
                  await qc.invalidateQueries({ queryKey: catalogKeys.staffServices(business.id) });
                  await refresh();
                  toast.success(t("common.saved"));
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setAddingMe(false);
                }
              }}
            >
              <UserCheck /> {t("catalog.iWorkHere")}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {staffQ.data?.map((s) => {
            const mine = links.filter((l) => l.staff_id === s.id);
            return (
              <Card key={s.id} className="flex items-start gap-3 p-4">
                <StaffAvatar staff={s} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium">{s.display_name}</p>
                    {!s.is_active && <Badge variant="secondary">{t("common.inactive")}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("catalog.servicesCount", { count: mine.length })}
                  </p>
                  {s.bio && <p className="line-clamp-2 text-xs text-muted-foreground">{s.bio}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.edit")}
                    onClick={() => setEditing(s)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    onClick={() => setDeleting(s)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {editing && (
        <StaffDialog
          initial={editing}
          services={services}
          selected={links.filter((l) => l.staff_id === editing.id).map((l) => l.service_id)}
          onClose={() => setEditing(null)}
          onSave={async ({ service_ids, ...v }) => {
            try {
              const saved = await upsert.mutateAsync({
                ...v,
                id: editing.id,
                business_id: business.id,
              });
              await setStaffServices(business.id, String(saved.id), service_ids);
              await qc.invalidateQueries({ queryKey: catalogKeys.staffServices(business.id) });
              toast.success(t("common.saved"));
              setEditing(null);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("catalog.deleteStaffTitle", { name: deleting?.display_name ?? "" })}
        description={t("catalog.deleteStaffHint")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success(t("common.saved"));
          } catch {
            toast.error(t("catalog.deleteInUse"));
          }
          setDeleting(null);
        }}
      />
    </div>
  );
}

function StaffDialog({
  initial,
  services,
  selected,
  onClose,
  onSave,
}: {
  initial: Partial<Staff>;
  services: Service[];
  selected: string[];
  onClose: () => void;
  onSave: (v: Form) => Promise<void>;
}) {
  const { t } = useTranslation();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      display_name: initial.display_name ?? "",
      bio: initial.bio ?? "",
      color: initial.color ?? STAFF_COLORS[0],
      is_active: initial.is_active ?? true,
      service_ids: initial.id ? selected : services.map((s) => s.id),
    },
  });
  const ids = watch("service_ids");
  const color = watch("color");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? t("catalog.editStaff") : t("catalog.addStaff")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSave)} noValidate>
          <Field
            label={t("common.name")}
            htmlFor="st-name"
            error={errors.display_name && t("catalog.nameRequired")}
          >
            <Input id="st-name" {...register("display_name")} />
          </Field>
          <Field label={t("catalog.bio")} htmlFor="st-bio">
            <Textarea id="st-bio" rows={2} {...register("bio")} />
          </Field>
          <div className="space-y-1.5">
            <Label>{t("catalog.color")}</Label>
            <div className="flex flex-wrap gap-2">
              {STAFF_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setValue("color", c)}
                  className={cn(
                    "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition",
                    color === c && "ring-2 ring-foreground",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t("catalog.servicesOffered")}</Label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={ids.includes(s.id)}
                    onChange={(e) =>
                      setValue(
                        "service_ids",
                        e.target.checked ? [...ids, s.id] : ids.filter((x) => x !== s.id),
                      )
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={watch("is_active")}
              onCheckedChange={(v) => setValue("is_active", v)}
            />
            {t("common.active")}
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
