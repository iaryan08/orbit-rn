'use client'

import { useEffect } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { db, auth } from '@/lib/firebase/client'
import { doc, updateDoc } from 'firebase/firestore'

export function NativePushRegister() {
    const user = auth.currentUser

    useEffect(() => {
        if (!Capacitor.isNativePlatform() || !user) return

        const initializePush = async () => {
            // Request permissions for push notifications
            let permStatus = await PushNotifications.checkPermissions()

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions()
            }

            if (permStatus.receive !== 'granted') {
                console.warn('Push notification permission not granted')
                return
            }

            // Register with FCM
            await PushNotifications.register()

            // Handle registration successful (FCM Token)
            await PushNotifications.addListener('registration', async (token) => {
                console.log('Push registration success, token:', token.value)

                // Store token in Firestore for this user
                try {
                    const userRef = doc(db, 'users', user.uid)
                    await updateDoc(userRef, { fcm_token: token.value })
                } catch (error) {
                    console.error('Error saving FCM token to user profile:', error)
                }
            })

            // Handle registration error
            await PushNotifications.addListener('registrationError', (error: any) => {
                console.error('Error on registration:', JSON.stringify(error))
            })

            // Handle notification received (Foreground)
            await PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('Push received in foreground:', notification)
            })

            // Handle notification action performed (Clicking notification)
            await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('Push action performed:', notification)
            })
        }

        initializePush()

        return () => {
            PushNotifications.removeAllListeners()
        }
    }, [user])

    return null
}
