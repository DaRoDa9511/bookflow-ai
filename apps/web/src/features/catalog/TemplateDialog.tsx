import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import type { Business } from "@/types/models";
import { catalogKeys } from "./api";
import { SERVICE_TEMPLATES } from "./templates";

/** Lets the owner pick typical services for their category and set prices in one step. */
export function ServiceTemplateDialog({
  business,
  existingNames,
  onClose,
}: {
  business: Business;
  existingNames: string[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const lang = i18n.language.startsWith("en") ? "en" : "es";
  const items = SERVICE_TEMPLATES[business.category] ?? SERVICE_TEMPLATES.other;
  const [rows, setRows] = useState(() =>
    items.map((it) => ({
      ...it,
      name: it[lang],
      checked: !existingNames.some((n) => n.toLowerCase() === it[lang].toLowerCase()),
      price: "",
      duration: it.duration,
    })),
  );
  const [saving, setSaving] = useState(false);
  const selected = rows.filter((r) => r.checked);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("services").insert(
      selected.map((r) => ({
        business_id: business.id,
        name: r.name.trim(),
        duration_min: Number(r.duration) || 30,
        price: Number(r.price) || 0,
        buffer_min: r.buffer ?? 0,
      })),
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: catalogKeys.services(business.id) });
    toast.success(t("templates.added", { count: selected.length }));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t("templates.title", { category: t(`categories.${business.category}`) })}
          </DialogTitle>
          <DialogDescription>{t("templates.hint")}</DialogDescription>
        </DialogHeader>
        <div className="divide-y rounded-md border">
          <div className="hidden grid-cols-[minmax(0,1fr)_110px_130px] gap-3 px-3 py-2 text-xs font-medium text-muted-foreground sm:grid">
            <span>{t("common.service")}</span>
            <span>{t("catalog.durationMin")}</span>
            <span>
              {t("common.price")} ({business.currency})
            </span>
          </div>
          {rows.map((r, i) => {
            const update = (patch: Partial<typeof r>) =>
              setRows((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
            return (
              <div
                key={r[lang]}
                className="grid grid-cols-2 items-center gap-2 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_110px_130px] sm:gap-3"
              >
                <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-1">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--primary))]"
                    checked={r.checked}
                    onChange={(e) => update({ checked: e.target.checked })}
                  />
                  <Input
                    aria-label={t("common.name")}
                    value={r.name}
                    disabled={!r.checked}
                    onChange={(e) => update({ name: e.target.value })}
                    className="h-8"
                  />
                </label>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  aria-label={t("catalog.durationMin")}
                  value={r.duration}
                  disabled={!r.checked}
                  onChange={(e) => update({ duration: Number(e.target.value) })}
                  className="h-8"
                />
                <Input
                  type="number"
                  min={0}
                  step="any"
                  aria-label={t("common.price")}
                  placeholder="0"
                  value={r.price}
                  disabled={!r.checked}
                  onChange={(e) => update({ price: e.target.value })}
                  className="h-8"
                />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button loading={saving} disabled={selected.length === 0} onClick={save}>
            {t("templates.addSelected", { count: selected.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
