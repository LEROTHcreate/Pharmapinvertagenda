import { unstable_cache } from "next/cache";

/**
 * Météo locale de l'officine (affichée sur l'accueil).
 *
 * Chaîne 100 % gratuite, sans clé API, côté serveur :
 *  1. Géocodage de l'adresse libre via l'API Adresse (BAN, data.gouv.fr).
 *  2. Prévision via Open-Meteo (température courante + min/max du jour).
 *
 * ⚠️ `unstable_cache` sérialise les valeurs : on ne renvoie QUE des
 * primitives/strings (pas de Date) — cf. piège cache+Date déjà rencontré.
 */

export type WeatherCondition =
  | "clear"
  | "partly"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunder";

export type PharmacyWeather = {
  city: string;
  condition: WeatherCondition;
  label: string;
  temp: number; // °C, arrondi
  tempMin: number;
  tempMax: number;
};

/** WMO weather code → (condition, libellé FR). */
function mapWmo(code: number): { condition: WeatherCondition; label: string } {
  if (code === 0) return { condition: "clear", label: "Ciel dégagé" };
  if (code === 1 || code === 2) return { condition: "partly", label: "Peu nuageux" };
  if (code === 3) return { condition: "cloudy", label: "Couvert" };
  if (code === 45 || code === 48) return { condition: "fog", label: "Brouillard" };
  if (code >= 51 && code <= 57) return { condition: "drizzle", label: "Bruine" };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return { condition: "rain", label: "Pluie" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { condition: "snow", label: "Neige" };
  if (code >= 95) return { condition: "thunder", label: "Orage" };
  return { condition: "cloudy", label: "Nuageux" };
}

async function geocode(address: string): Promise<{ lat: number; lon: number; city: string } | null> {
  const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(
    address
  )}&limit=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: { city?: string; name?: string };
    }>;
  };
  const f = data.features?.[0];
  const coords = f?.geometry?.coordinates;
  if (!coords) return null;
  return {
    lon: coords[0],
    lat: coords[1],
    city: f?.properties?.city ?? f?.properties?.name ?? "",
  };
}

async function fetchWeather(address: string): Promise<PharmacyWeather | null> {
  const geo = await geocode(address);
  if (!geo) return null;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
    `&current=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min` +
    `&timezone=Europe%2FParis&forecast_days=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number };
    daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] };
  };
  const temp = data.current?.temperature_2m;
  const code = data.current?.weather_code;
  if (temp == null || code == null) return null;
  const { condition, label } = mapWmo(code);
  return {
    city: geo.city,
    condition,
    label,
    temp: Math.round(temp),
    tempMax: Math.round(data.daily?.temperature_2m_max?.[0] ?? temp),
    tempMin: Math.round(data.daily?.temperature_2m_min?.[0] ?? temp),
  };
}

/**
 * Météo mise en cache 30 min par adresse (évite de marteler les APIs
 * externes à chaque affichage de l'accueil).
 */
export async function getPharmacyWeather(
  address: string | null | undefined
): Promise<PharmacyWeather | null> {
  const q = address?.trim();
  if (!q) return null;
  const cached = unstable_cache(
    () => fetchWeather(q),
    ["pharmacy-weather", q],
    { revalidate: 1800 }
  );
  try {
    return await cached();
  } catch {
    return null;
  }
}
