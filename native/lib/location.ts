import * as Location from 'expo-location';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

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
            const presenceRef = ref(rtdb, `presence/${coupleId}/${user.uid}`);
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
