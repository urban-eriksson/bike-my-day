/**
 * One hour of weather at a single location, normalised across providers.
 * Every quantity is in SI-ish units the rest of the app can rely on:
 *   - temperatures in °C
 *   - precipitation in millimetres
 *   - wind speeds in metres per second
 *   - directions in compass degrees [0, 360), measured FROM (meteorological)
 *
 * Optional fields are only `null` when the provider didn't return them
 * (e.g. precipitation_probability is unavailable beyond a horizon).
 */
export type WeatherSnapshot = {
  /** ISO local time of the hour this snapshot covers, in `timezone`. */
  as_of_local: string;
  /** IANA timezone the times are expressed in. */
  timezone: string;

  temperature_c: number;
  apparent_temperature_c: number;
  precipitation_probability_pct: number | null;
  precipitation_mm: number;
  /** WMO weather interpretation code (Open-Meteo). */
  weather_code: number;
  cloud_cover_pct: number;

  wind_speed_ms: number;
  /** Direction the wind is blowing FROM, compass degrees. */
  wind_direction_from_deg: number;
  wind_gusts_ms: number;

  /** Whether the hour is in daylight per the provider. */
  is_day: boolean;
  /** Sunrise/sunset for the local date the hour falls on. */
  sunrise_local: string;
  sunset_local: string;
};

export type ForecastQuery = {
  lat: number;
  lon: number;
  /** The hour the verdict is for. Will be rounded to the start of the hour. */
  at: Date;
  /** IANA timezone of the rider; controls the local times returned. */
  timezone: string;
};

export type WeatherProvider = {
  forecast(query: ForecastQuery): Promise<WeatherSnapshot>;
};
