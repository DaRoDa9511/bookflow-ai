import "i18next";
import type { es } from "@/locales/es";

// Typed translation keys: a missing key is a compile error.
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof es };
  }
}
