import { useQueryClient } from "@tanstack/react-query";
import { Bot, Smartphone } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/misc";
import { KnowledgeEditor } from "@/features/catalog/KnowledgeEditor";
import { ShareCard } from "@/features/catalog/ShareCard";
import { useAuth, useBusiness } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

const TONES = ["friendly", "professional", "casual"] as const;

export default function AssistantPage() {
  const { t } = useTranslation();
  const { business } = useBusiness();
  const { refresh } = useAuth();
  const qc = useQueryClient();
  const [tone, setTone] = useState(business.bot_tone);
  const [instructions, setInstructions] = useState(business.bot_instructions ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("businesses")
      .update({ bot_tone: tone, bot_instructions: instructions || null })
      .eq("id", business.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("common.saved"));
    await refresh();
    await qc.invalidateQueries({ queryKey: ["memberships"] });
  }

  return (
    <>
      <PageHeader
        title={t("nav.assistant")}
        description={t("assistant.subtitle")}
        actions={
          <Button asChild>
            <Link to="/app/simulator">
              <Smartphone /> {t("assistant.test")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-5 w-5 text-primary" /> {t("assistant.personality")}
              </CardTitle>
              <CardDescription>{t("assistant.personalityHint")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label={t("assistant.tone")} htmlFor="tone">
                <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                  {TONES.map((x) => (
                    <option key={x} value={x}>
                      {t(`assistant.tone_${x}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t("assistant.instructions")}
                htmlFor="instructions"
                hint={t("assistant.instructionsHint")}
              >
                <Textarea
                  id="instructions"
                  rows={4}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder={t("assistant.instructionsPlaceholder")}
                />
              </Field>
              <div className="flex justify-end">
                <Button loading={saving} onClick={save}>
                  {t("common.save")}
                </Button>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("onboarding.stepKnowledge")}</CardTitle>
              <CardDescription>{t("onboarding.stepKnowledgeHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <KnowledgeEditor business={business} />
            </CardContent>
          </Card>
        </div>
        <div>
          <ShareCard business={business} />
        </div>
      </div>
    </>
  );
}
