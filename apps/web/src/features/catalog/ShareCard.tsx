import { Copy, Download, ExternalLink, MessageCircle } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { Business } from "@/types/models";

export const WHATSAPP_NUMBER = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) ?? "";

export function waLink(bookingCode: string, greeting = "Hola") {
  const text = encodeURIComponent(`${greeting} ${bookingCode}`);
  return WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function ShareCard({
  business,
}: {
  business: Pick<Business, "slug" | "booking_code" | "name">;
}) {
  const { t } = useTranslation();
  const qrRef = useRef<HTMLDivElement>(null);
  const link = waLink(business.booking_code);
  const publicUrl = `${window.location.origin}/b/${business.slug}`;

  function copy(value: string) {
    void navigator.clipboard.writeText(value).then(() => toast.success(t("common.copied")));
  }

  function downloadQr() {
    const canvas = qrRef.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `bookflow-${business.slug}-qr.png`;
    a.click();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#128C4A]" /> {t("share.title")}
        </CardTitle>
        <CardDescription>{t("share.subtitle", { code: business.booking_code })}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-[auto_minmax(0,1fr)]">
        <div ref={qrRef} className="mx-auto flex flex-col items-center gap-2">
          <div className="rounded-lg bg-white p-3">
            <QRCodeCanvas value={link} size={168} includeMargin={false} />
          </div>
          <Button variant="outline" size="sm" onClick={downloadQr}>
            <Download /> {t("share.downloadQr")}
          </Button>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("share.waLink")}</p>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label={t("share.waLink")} />
              <Button
                variant="outline"
                size="icon"
                aria-label={t("common.copy")}
                onClick={() => copy(link)}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t("share.publicPage")}</p>
            <div className="flex gap-2">
              <Input readOnly value={publicUrl} aria-label={t("share.publicPage")} />
              <Button
                variant="outline"
                size="icon"
                aria-label={t("common.copy")}
                onClick={() => copy(publicUrl)}
              >
                <Copy />
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="whatsapp" asChild>
              <a href={link} target="_blank" rel="noreferrer">
                <MessageCircle /> {t("share.openWhatsApp")}
              </a>
            </Button>
            <Button variant="outline" asChild>
              <Link to={`/b/${business.slug}`} target="_blank">
                <ExternalLink /> {t("share.viewPublic")}
              </Link>
            </Button>
          </div>
          {!WHATSAPP_NUMBER && (
            <p className="text-xs text-muted-foreground">{t("share.noNumber")}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
