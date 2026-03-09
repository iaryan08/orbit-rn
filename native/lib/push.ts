import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { doc, setDoc, arrayUnion } from 'firebase/firestore';
import { db, auth } from './firebase';

export async function registerForPushNotificationsAsync() {
    let token;

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        if (existingStatus !== 'granted') {
            const { status } = await Notifications.requestPermissionsAsync();
            finalStatus = status;
        }
        if (finalStatus !== 'granted') {
            console.log('Failed to get push token for push notification!');
            return;
        }

        // Learn more about projectId here: https://docs.expo.dev/push-notifications/push-notifications-setup/#configure-projectid
        token = (await Notifications.getExpoPushTokenAsync({
            projectId: '8dba604e-7f8f-4bf1-bd84-e70058ab1e45',
        })).data;
        console.log('[Push] Token:', token);

        // Save token to Firestore
        const user = auth.currentUser;
        if (user && token) {
            const userRef = doc(db, 'users', user.uid);
            await setDoc(userRef, {
                push_tokens: arrayUnion(token)
            }, { merge: true });
        }
    } else {
        console.log('Must use physical device for Push Notifications');
    }

    return token;
}

export function setupNotificationListeners(onNotification: (notif: Notifications.Notification) => void) {
    const notificationListener = Notifications.addNotificationReceivedListener((notification: Notifications.Notification) => {
        onNotification(notification);
    });

    const responseListener = Notifications.addNotificationResponseReceivedListener((response: Notifications.NotificationResponse) => {
        console.log('[Push] Response received:', response);
    });

    return () => {
        notificationListener.remove();
        responseListener.remove();
    };
}
