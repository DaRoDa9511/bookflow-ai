// Starter templates per business category, so onboarding takes minutes:
// the owner only ticks services and sets prices.
import type { BusinessCategory } from "@/types/models";

export interface ServiceTemplate {
  es: string;
  en: string;
  duration: number;
  buffer?: number;
}

export const SERVICE_TEMPLATES: Record<BusinessCategory, ServiceTemplate[]> = {
  barbershop: [
    { es: "Corte clásico", en: "Classic haircut", duration: 30 },
    { es: "Corte + barba", en: "Haircut + beard", duration: 60 },
    { es: "Fade / degradado", en: "Fade", duration: 45 },
    { es: "Arreglo de barba", en: "Beard trim", duration: 30 },
    { es: "Corte niño", en: "Kids haircut", duration: 30 },
  ],
  salon: [
    { es: "Corte de dama", en: "Women's haircut", duration: 45 },
    { es: "Brushing / peinado", en: "Blow-dry / styling", duration: 45 },
    { es: "Tinte completo", en: "Full color", duration: 120, buffer: 15 },
    { es: "Mechas / balayage", en: "Highlights / balayage", duration: 150, buffer: 15 },
    { es: "Manicure", en: "Manicure", duration: 45 },
    { es: "Pedicure", en: "Pedicure", duration: 60 },
  ],
  clinic: [
    { es: "Consulta general", en: "General consultation", duration: 30 },
    { es: "Control / seguimiento", en: "Follow-up visit", duration: 20 },
    { es: "Limpieza dental", en: "Dental cleaning", duration: 45, buffer: 15 },
    { es: "Valoración", en: "Assessment", duration: 30 },
    { es: "Procedimiento", en: "Procedure", duration: 60, buffer: 15 },
  ],
  spa: [
    { es: "Masaje relajante", en: "Relaxing massage", duration: 60, buffer: 15 },
    { es: "Masaje descontracturante", en: "Deep tissue massage", duration: 60, buffer: 15 },
    { es: "Limpieza facial", en: "Facial", duration: 60, buffer: 10 },
    { es: "Exfoliación corporal", en: "Body scrub", duration: 45, buffer: 10 },
    { es: "Circuito de spa", en: "Spa circuit", duration: 90 },
  ],
  other: [
    { es: "Consulta", en: "Consultation", duration: 30 },
    { es: "Sesión", en: "Session", duration: 60 },
  ],
};

/** Typical weekly hours (weekday 0 = Sunday). */
export const HOURS_TEMPLATES: Record<BusinessCategory, Record<number, [string, string]>> = {
  barbershop: {
    1: ["09:00", "19:00"],
    2: ["09:00", "19:00"],
    3: ["09:00", "19:00"],
    4: ["09:00", "19:00"],
    5: ["09:00", "19:00"],
    6: ["09:00", "14:00"],
  },
  salon: {
    2: ["09:00", "19:00"],
    3: ["09:00", "19:00"],
    4: ["09:00", "19:00"],
    5: ["09:00", "19:00"],
    6: ["09:00", "17:00"],
  },
  clinic: {
    1: ["08:00", "17:00"],
    2: ["08:00", "17:00"],
    3: ["08:00", "17:00"],
    4: ["08:00", "17:00"],
    5: ["08:00", "17:00"],
  },
  spa: {
    1: ["10:00", "20:00"],
    2: ["10:00", "20:00"],
    3: ["10:00", "20:00"],
    4: ["10:00", "20:00"],
    5: ["10:00", "20:00"],
    6: ["10:00", "18:00"],
    0: ["10:00", "16:00"],
  },
  other: {
    1: ["09:00", "18:00"],
    2: ["09:00", "18:00"],
    3: ["09:00", "18:00"],
    4: ["09:00", "18:00"],
    5: ["09:00", "18:00"],
  },
};
