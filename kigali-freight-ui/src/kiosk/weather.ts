// src/kiosk/weather.ts — Kigali current conditions for the kiosk status
// strip. Open-Meteo is free, keyless, and CORS-open, so this calls it
// directly from the browser — no backend route or API key to manage for
// a widget that has no secret to protect.
const KIGALI_LAT = -1.9441;
const KIGALI_LNG = 30.0619;

export interface KioskWeather {
    temperatureC: number;
    label: string;
    icon: string;
    rainExpected: boolean;
}

// Open-Meteo's WMO weather codes are a small fixed set — bucketed into
// the handful of conditions actually worth distinguishing on a status
// strip, not mapped 1:1.
function describeWeatherCode(code: number): { label: string; icon: string; rainExpected: boolean } {
    if (code === 0) return { label: 'Clear', icon: '☀️', rainExpected: false };
    if ([1, 2].includes(code)) return { label: 'Partly cloudy', icon: '🌤️', rainExpected: false };
    if (code === 3) return { label: 'Overcast', icon: '☁️', rainExpected: false };
    if ([45, 48].includes(code)) return { label: 'Fog', icon: '🌫️', rainExpected: false };
    if ([51, 53, 55, 56, 57].includes(code)) return { label: 'Drizzle', icon: '🌦️', rainExpected: true };
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: 'Rain', icon: '🌧️', rainExpected: true };
    if ([95, 96, 99].includes(code)) return { label: 'Thunderstorm', icon: '⛈️', rainExpected: true };
    return { label: 'Unsettled', icon: '🌥️', rainExpected: false };
}

export async function fetchKigaliWeather(): Promise<KioskWeather | null> {
    try {
        const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${KIGALI_LAT}&longitude=${KIGALI_LNG}&current=temperature_2m,weather_code&timezone=Africa%2FKigali`
        );
        if (!res.ok) return null;
        const data = await res.json() as { current?: { temperature_2m?: number; weather_code?: number } };
        if (typeof data.current?.temperature_2m !== 'number' || typeof data.current?.weather_code !== 'number') return null;
        const { label, icon, rainExpected } = describeWeatherCode(data.current.weather_code);
        return { temperatureC: Math.round(data.current.temperature_2m), label, icon, rainExpected };
    } catch {
        return null;
    }
}
