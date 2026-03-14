import * as Location from 'expo-location';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// Haversine formula for distance calculation in KM
export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export async function updateLocation() {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
            return { error: 'Permission to access location was denied' };
        }

        const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
        });

        const user = auth.currentUser;
        if (!user) return { error: 'Not authenticated' };

        // Reverse geocoding to get detailed address
        const reverseGeocode = await Location.reverseGeocodeAsync({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
        });

        const address = reverseGeocode[0];
        const city = address?.city || address?.region || 'Unknown';
        const subtext = address
            ? `${address.name || ''} ${address.street || ''} ${address.district ? `(${address.district})` : ''}`.trim()
            : '';

        const locationData = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            city,
            subtext: subtext || address?.name || address?.district || '',
            updated_at: Date.now(),
        };

        const userRef = doc(db, 'users', user.uid);
        await updateDoc(userRef, {
            location: locationData,
            location_json: JSON.stringify(locationData),
            updated_at: serverTimestamp(),
        });

        // 🚀 High-Frequency Broadcast (RTDB Dual-Sync)
        // If we have a coupleId in the profile, we mirror to RTDB for zero-latency UI
        const { getDoc } = require('firebase/firestore');
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const coupleId = userData?.couple_id;

        if (coupleId) {
            const { ref, update, serverTimestamp } = require('firebase/database');
            const { rtdb } = require('./firebase');
            const presenceUserId = userData?.id || user.uid;
            const presenceRef = ref(rtdb, `presence/${coupleId}/${presenceUserId}`);
            await update(presenceRef, {
                location: locationData,
                last_changed: serverTimestamp()
            });
        }

        return { success: true, location: locationData };
    } catch (error: any) {
        console.error('[Location] Update failed:', error);
        return { error: error.message };
    }
}
