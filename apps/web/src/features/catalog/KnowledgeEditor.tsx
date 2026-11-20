import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
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
import { EmptyState, Skeleton } from "@/components/ui/misc";
import type { Business, KnowledgeItem } from "@/types/models";
import { catalogKeys, useKnowledge, useTableMutation } from "./api";

export function KnowledgeEditor({ business }: { business: Business }) {
  const { t } = useTranslation();
  const { data, isLoading } = useKnowledge(business.id);
  const { upsert, remove } = useTableMutation("knowledge_base", [catalogKeys.kb(business.id)]);
  const [editing, setEditing] = useState<Partial<KnowledgeItem> | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeItem | null>(null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const suggestions = [
    t("catalog.kbSuggestLocation"),
    t("catalog.kbSuggestPayments"),
    t("catalog.kbSuggestPolicy"),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing({})}>
          <Plus /> {t("catalog.addKb")}
        </Button>
      </div>
      {data?.length === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={t("catalog.noKb")}
          description={t("catalog.noKbHint")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <Button
                  key={s}
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing({ title: s })}
                >
                  <Plus /> {s}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {data?.map((k) => (
            <Card key={k.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{k.title}</p>
                <p className="whitespace-pre-line text-sm text-muted-foreground">{k.content}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.edit")}
                  onClick={() => setEditing(k)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.delete")}
                  onClick={() => setDeleting(k)}
                >
                  <Trash2 />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <KbDialog
          initial={editing}
          onClose={() => setEditing(null)}
          onSave={async (title, content) => {
            try {
              await upsert.mutateAsync({
                id: editing.id,
                business_id: business.id,
                title,
                content,
              });
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
        title={t("catalog.deleteKbTitle")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        loading={remove.isPending}
        onConfirm={async () => {
          if (deleting) await remove.mutateAsync(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function KbDialog({
  initial,
  onClose,
  onSave,
}: {
  initial: Partial<KnowledgeItem>;
  onClose: () => void;
  onSave: (title: string, content: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title ?? "");
  const [content, setContent] = useState(initial.content ?? "");
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial.id ? t("catalog.editKb") : t("catalog.addKb")}</DialogTitle>
        </DialogHeader>
        <Field label={t("catalog.kbTitle")} htmlFor="kb-title">
          <Input id="kb-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label={t("catalog.kbContent")}
          htmlFor="kb-content"
          hint={t("catalog.kbContentHint")}
        >
          <Textarea
            id="kb-content"
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            loading={saving}
            disabled={title.trim().length < 2 || content.trim().length < 2}
            onClick={async () => {
              setSaving(true);
              await onSave(title.trim(), content.trim());
              setSaving(false);
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
