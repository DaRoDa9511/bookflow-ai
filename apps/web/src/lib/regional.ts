// Time zones and currencies offered in the app, with labels in the UI language
// (country and currency names come from Intl, so they follow ES/EN automatically).

/** IANA zone → ISO country code. Latin America first, then common others. */
export const TIMEZONES: { tz: string; country: string; currency: string }[] = [
  { tz: "America/La_Paz", country: "BO", currency: "BOB" },
  { tz: "America/Bogota", country: "CO", currency: "COP" },
  { tz: "America/Mexico_City", country: "MX", currency: "MXN" },
  { tz: "America/Lima", country: "PE", currency: "PEN" },
  { tz: "America/Santiago", country: "CL", currency: "CLP" },
  { tz: "America/Argentina/Buenos_Aires", country: "AR", currency: "ARS" },
  { tz: "America/Guayaquil", country: "EC", currency: "USD" },
  { tz: "America/Caracas", country: "VE", currency: "VES" },
  { tz: "America/Asuncion", country: "PY", currency: "PYG" },
  { tz: "America/Montevideo", country: "UY", currency: "UYU" },
  { tz: "America/Sao_Paulo", country: "BR", currency: "BRL" },
  { tz: "America/Panama", country: "PA", currency: "USD" },
  { tz: "America/Costa_Rica", country: "CR", currency: "CRC" },
  { tz: "America/Guatemala", country: "GT", currency: "GTQ" },
  { tz: "America/El_Salvador", country: "SV", currency: "USD" },
  { tz: "America/Tegucigalpa", country: "HN", currency: "HNL" },
  { tz: "America/Managua", country: "NI", currency: "NIO" },
  { tz: "America/Santo_Domingo", country: "DO", currency: "DOP" },
  { tz: "America/Puerto_Rico", country: "PR", currency: "USD" },
  { tz: "America/New_York", country: "US", currency: "USD" },
  { tz: "America/Chicago", country: "US", currency: "USD" },
  { tz: "America/Denver", country: "US", currency: "USD" },
  { tz: "America/Los_Angeles", country: "US", currency: "USD" },
  { tz: "Europe/Madrid", country: "ES", currency: "EUR" },
  { tz: "UTC", country: "", currency: "USD" },
];

/** International dialing code per country (without "+"). */
export const DIAL_CODES: Record<string, string> = {
  BO: "591",
  CO: "57",
  MX: "52",
  PE: "51",
  CL: "56",
  AR: "54",
  EC: "593",
  VE: "58",
  PY: "595",
  UY: "598",
  BR: "55",
  PA: "507",
  CR: "506",
  GT: "502",
  SV: "503",
  HN: "504",
  NI: "505",
  DO: "1",
  PR: "1",
  US: "1",
  ES: "34",
};

/** Dialing code for a business time zone (e.g. America/La_Paz → "591"). */
export function dialCodeFor(tz: string | undefined): string {
  const country = TIMEZONES.find((z) => z.tz === tz)?.country;
  return (country && DIAL_CODES[country]) || "";
}

/** Phone input placeholder for a time zone, e.g. "+591 7XXXXXXX". */
export function phonePlaceholder(tz: string | undefined): string {
  const code = dialCodeFor(tz);
  return code ? `+${code} …` : "+1 555 123 4567";
}

export const CURRENCIES = [
  "BOB",
  "COP",
  "MXN",
  "PEN",
  "CLP",
  "ARS",
  "USD",
  "VES",
  "PYG",
  "UYU",
  "BRL",
  "CRC",
  "GTQ",
  "HNL",
  "NIO",
  "DOP",
  "EUR",
];

function utcOffset(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part === "GMT" ? "UTC" : (part ?? "").replace("GMT", "UTC");
  } catch {
    return "";
  }
}

/** "Bolivia · La Paz (UTC-4)" in the current language. */
export function timezoneLabel(tz: string, lang: string): string {
  const entry = TIMEZONES.find((z) => z.tz === tz);
  const city = tz.split("/").pop()!.replace(/_/g, " ");
  let country = "";
  try {
    country = entry?.country
      ? (new Intl.DisplayNames([lang], { type: "region" }).of(entry.country) ?? "")
      : "";
  } catch {
    /* ignore */
  }
  const offset = utcOffset(tz);
  return `${country ? `${country} · ` : ""}${city}${offset ? ` (${offset})` : ""}`;
}

/** "Bs · Boliviano (BOB)" in the current language. */
export function currencyLabel(code: string, lang: string): string {
  let name = code;
  let symbol = code;
  try {
    name = new Intl.DisplayNames([lang], { type: "currency" }).of(code) ?? code;
    symbol =
      new Intl.NumberFormat(lang, {
        style: "currency",
        currency: code,
        currencyDisplay: "narrowSymbol",
      })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? code;
  } catch {
    /* ignore */
  }
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  return symbol === code ? `${cap} (${code})` : `${symbol} · ${cap} (${code})`;
}

export function defaultCurrencyFor(tz: string): string {
  return TIMEZONES.find((z) => z.tz === tz)?.currency ?? "USD";
}

/** Options for a select, keeping an unknown current value visible. */
export function timezoneOptions(current?: string) {
  const list = TIMEZONES.map((z) => z.tz);
  return current && !list.includes(current) ? [current, ...list] : list;
}
