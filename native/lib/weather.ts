import { db, auth } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const OPEN_WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY; // Optional, can use a proxy
let lastWeatherUpdateAt = 0;
const WEATHER_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export async function updateWeatherAndLocation(force = false) {
    const user = auth.currentUser;
    if (!user) return;

    const now = Date.now();
    if (!force && lastWeatherUpdateAt > 0 && now - lastWeatherUpdateAt < WEATHER_REFRESH_COOLDOWN_MS) {
        console.log("[Weather] Skipping update: Cooldown active.");
        return;
    }

    let latitude, longitude, city, subtext, isIp = false;

    try {
        // Dynamic import to prevent crash if native module is missing
        const Location = await import('expo-location');

        // Check if permissions and methods are available
        if (Location && typeof Location.requestForegroundPermissionsAsync === 'function') {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted' && typeof Location.getCurrentPositionAsync === 'function') {
                const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                latitude = location.coords.latitude;
                longitude = location.coords.longitude;

                if (typeof Location.reverseGeocodeAsync === 'function') {
                    const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
                    if (geo) {
                        city = geo.city || geo.subregion || 'Orbit';
                        subtext = geo.district || geo.name || geo.region || 'India';
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[Weather] Native GPS fetch failed or disallowed:", e);
    }

    // IP Fallback if GPS failed
    if (!latitude || !longitude) {
        try {
            const ipRes = await fetch('https://ipapi.co/json/');
            const ipData = await ipRes.json();
            if (ipData.latitude && ipData.longitude) {
                latitude = ipData.latitude;
                longitude = ipData.longitude;
                city = ipData.city || 'Mars';
                subtext = ipData.region || 'Orbit';
                isIp = true;
                console.log("[Weather] Location fetched via IP");
            }
        } catch (e) {
            console.error("[Weather] IP fallback failed:", e);
        }
    }

    if (!latitude || !longitude) return;

    // Fetch Weather from Open-Meteo
    let temp = 27;
    let weatherCode = 0;

    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`);
        const data = await res.json();
        if (data.current_weather) {
            temp = Math.round(data.current_weather.temperature);
            weatherCode = data.current_weather.weathercode;
        }
    } catch (e) {
        console.error("Open-Meteo fetch failed:", e);
    }

    // Update User Profile
    try {
        const userRef = doc(db, 'users', user.uid);
        await setDoc(userRef, {
            location: {
                latitude,
                longitude,
                temp,
                weather_code: weatherCode,
                city: city || 'Orbit',
                subtext: subtext || 'Earth',
                is_ip: isIp,
                updated_at: serverTimestamp()
            }
        }, { merge: true });
        lastWeatherUpdateAt = now;
    } catch (e) {
        console.error("Firestore user update failed:", e);
    }
}
