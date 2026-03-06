import * as Location from 'expo-location';
import { LocationInfo } from '../types';

/**
 * Request location permission and return the device's current GPS coordinates
 * plus a human-readable place name via reverse geocoding.
 */
export async function getCurrentLocation(): Promise<LocationInfo> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    throw new Error('Location permission denied. Please enable it in Settings.');
  }

  const position = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });

  const { latitude, longitude } = position.coords;

  // Reverse geocode to get a city name
  const places = await Location.reverseGeocodeAsync({ latitude, longitude });
  const place  = places[0];

  const cityName    = place?.city ?? place?.district ?? place?.region ?? 'Unknown location';
  const countryName = place?.country ?? '';

  return { latitude, longitude, cityName, countryName };
}
