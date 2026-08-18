// Weather & environment type definitions
// L1: simple snapshot; L2: full environment state (Open-Meteo + hardware sensors)

/** L1: Simple weather snapshot (used by older API surfaces) */
export interface WeatherData {
  temperature: number;
  humidity: number;
  lightIntensity: number;
  weatherCondition: 'sunny' | 'cloudy' | 'rainy' | 'unknown';
  timestamp: string;
}

/** Full environment & weather state — Open-Meteo API + hardware sensors */
export interface EnvironmentState {
  /** Real-time temperature (°C) */
  temperature: number;
  /** Real-time humidity (%) */
  humidity: number;
  /** Light intensity (lux) — LDR photoresistor or API derived */
  lightIntensity: number;
  /** Weather condition enum */
  weatherCondition: 'sunny' | 'cloudy' | 'rainy' | 'unknown';
  /** Cloud cover fraction [0, 1] — Open-Meteo */
  cloudCover: number;
  /** Wind speed (km/h) */
  windSpeed: number;
  /** Precipitation (mm/h) */
  precipitation: number;
  /** Weather code — Open-Meteo WMO code */
  weatherCode: number;
  /** Solar factor [0, 1] — sine-wave computed from Shenzhen time; 0 = night, 1 = noon */
  solarFactor: number;
  /** Solar generation efficiency forecast [0, 1] */
  solarEfficiency: number;
  /** Hardware sensor temperature (°C) — DHT11 */
  hardwareTemperature: number;
  /** Hardware sensor humidity (%) — DHT11 */
  hardwareHumidity: number;
  /** Hardware photoresistor reading [0, 1023] — LDR */
  hardwareLdrValue: number;
}
