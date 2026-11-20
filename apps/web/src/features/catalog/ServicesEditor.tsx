import { zodResolver } from "@hookform/resolvers/zod";
import { Clock, Pencil, Plus, Scissors, Trash2 } from "lucide-react";
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
import { Field } from "@/components/ui/label";
import { EmptyState, Skeleton, Switch } from "@/components/ui/misc";
import { formatMoney } from "@/lib/utils";
import type { Business, Service } from "@/types/models";
import { catalogKeys, useServices, useTableMutation } from "./api";

const schema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  duration_min: z.coerce.number().int().min(5).max(600),
  price: z.coerce.number().min(0),
  buffer_min: z.coerce.number().int().min(0).max(240),
  is_active: z.boolean(),
});
type Form = z.infer<typeof schema>;

export function ServicesEditor({ business }: { business: Business }) {
  const { t, i18n } = useTranslation();
  const { data: services, isLoading } = useServices(business.id);
  const { upsert, remove } = useTableMutation("services", [catalogKeys.services(business.id)]);
  const [editing, setEditing] = useState<Partial<Service> | null>(null);
  const [deleting, setDeleting] = useState<Service | null>(null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setEditing({ is_active: true, duration_min: 30, price: 0, buffer_min: 0 })}
        >
          <Plus /> {t("catalog.addService")}
        </Button>
      </div>

      {services?.length === 0 ? (
        <EmptyState
          icon={<Scissors />}
          title={t("catalog.noServices")}
          description={t("catalog.noServicesHint")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {services?.map((s) => (
            <Card key={s.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{s.name}</p>
                  {!s.is_active && <Badge variant="secondary">{t("common.inactive")}</Badge>}
                </div>
                <p className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />{" "}
                    {t("common.minutes", { count: s.duration_min })}
                  </span>
                  <span>{formatMoney(s.price, business.currency, i18n.language)}</span>
                </p>
                {s.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                )}
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
          ))}
        </div>
      )}

      {editing && (
        <ServiceDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (v) => {
            try {
              await upsert.mutateAsync({ ...v, id: editing.id, business_id: business.id });
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
        title={t("catalog.deleteServiceTitle", { name: deleting?.name ?? "" })}
        description={t("catalog.deleteServiceHint")}
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

function ServiceDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<Service>;
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
      name: initial.name ?? "",
      description: initial.description ?? "",
      duration_min: initial.duration_min ?? 30,
      price: Number(initial.price ?? 0),
      buffer_min: initial.buffer_min ?? 0,
      is_active: initial.is_active ?? true,
    },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {initial.id ? t("catalog.editService") : t("catalog.addService")}
          </DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit(onSave)} noValidate>
          <Field
            label={t("common.name")}
            htmlFor="s-name"
            error={errors.name && t("catalog.nameRequired")}
          >
            <Input id="s-name" {...register("name")} />
          </Field>
          <Field label={t("catalog.description")} htmlFor="s-desc">
            <Textarea id="s-desc" rows={2} {...register("description")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field
              label={t("catalog.durationMin")}
              htmlFor="s-dur"
              error={errors.duration_min && "5–600"}
            >
              <Input id="s-dur" type="number" min={5} step={5} {...register("duration_min")} />
            </Field>
            <Field label={t("common.price")} htmlFor="s-price" error={errors.price && "≥ 0"}>
              <Input id="s-price" type="number" min={0} step="any" {...register("price")} />
            </Field>
            <Field
              label={t("catalog.bufferMin")}
              htmlFor="s-buf"
              error={errors.buffer_min && "0–240"}
            >
              <Input id="s-buf" type="number" min={0} step={5} {...register("buffer_min")} />
            </Field>
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
