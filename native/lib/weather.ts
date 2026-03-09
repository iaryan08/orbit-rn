import { db, auth } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

const OPEN_WEATHER_API_KEY = process.env.EXPO_PUBLIC_WEATHER_API_KEY; // Optional, can use a proxy

export async function updateWeatherAndLocation() {
    const user = auth.currentUser;
    if (!user) return;

    try {
        // Dynamic import to prevent crash if native module is missing
        const Location = await import('expo-location');

        // Critical: Check if methods exist to avoid "is not a function" errors
        if (!Location || typeof Location.requestForegroundPermissionsAsync !== 'function') {
            console.warn("[Weather] Native Location module missing or methods not found.");
            return;
        }

        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!Location || typeof Location.requestForegroundPermissionsAsync !== 'function') {
            console.warn("[Weather] Native Location module not available. Skipping update.");
            return;
        }
        if (status !== 'granted') return;

        if (typeof Location.getCurrentPositionAsync !== 'function') {
            console.warn("[Weather] getCurrentPositionAsync is missing. Skipping update.");
            return;
        }

        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude, longitude } = location.coords;

        // Fetch Weather
        let temp = 27; // Default fallback
        let condition = 'Clear';

        if (OPEN_WEATHER_API_KEY) {
            try {
                const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&units=metric&appid=${OPEN_WEATHER_API_KEY}`);
                const data = await res.json();
                if (data.main) {
                    temp = data.main.temp;
                    condition = data.weather[0].main;
                }
            } catch (e) {
                console.error("Weather fetch failed:", e);
            }
        }

        // Update User Profile with real coordinates and weather
        const { useOrbitStore } = await import('./store');
        const state = useOrbitStore.getState();
        const coupleId = state.profile?.couple_id;

        if (coupleId) {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                location: {
                    latitude,
                    longitude,
                    temp,
                    condition,
                    updated_at: serverTimestamp()
                }
            }, { merge: true });
        }
    } catch (error) {
        console.error("Location/Weather update failed:", error);
    }
}
