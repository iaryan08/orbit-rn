'use client'

import { useEffect } from 'react'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor } from '@capacitor/core'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/components/auth-provider'

export function NativePushRegister() {
    const { user } = useAuth()
    const supabase = createClient()

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

                // Store token in Supabase for this user
                // We'll upsert into a fcm_tokens table
                const { error } = await supabase
                    .from('profiles')
                    .update({ fcm_token: token.value })
                    .eq('id', user.id)

                if (error) {
                    console.error('Error saving FCM token to profile:', error)
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
    }, [user, supabase])

    return null
}
