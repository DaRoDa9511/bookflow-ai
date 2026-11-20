import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "@/locales/en";
import { es } from "@/locales/es";

export const LANGS = ["es", "en"] as const;
export type Lang = (typeof LANGS)[number];

function detect(): Lang {
  try {
    const saved = localStorage.getItem("bf-lang");
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : "es";
  return nav?.toLowerCase().startsWith("en") ? "en" : "es";
}

void i18n.use(initReactI18next).init({
  resources: { es: { translation: es }, en: { translation: en } },
  lng: detect(),
  fallbackLng: "es",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (lng) => {
  try {
    localStorage.setItem("bf-lang", lng);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = lng;
});
document.documentElement.lang = i18n.language;

export default i18n;
