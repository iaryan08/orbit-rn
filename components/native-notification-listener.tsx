'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/components/auth-provider'

export function NativeNotificationListener() {
    const { user } = useAuth()
    const supabase = createClient()

    useEffect(() => {
        if (!user || !Capacitor.isNativePlatform()) return

        // 1. Request channel permissions once (good practice)
        const initNotifs = async () => {
            const perm = await LocalNotifications.checkPermissions()
            if (perm.display !== 'granted') {
                await LocalNotifications.requestPermissions()
            }
        }
        initNotifs()

        // 2. Subscribe to realtime notifications
        const channel = supabase
            .channel(`notifs-${user.uid}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `recipient_id=eq.${user.uid}`,
                },
                async (payload: any) => {
                    const { title, message, id } = payload.new

                    await LocalNotifications.schedule({
                        notifications: [
                            {
                                title: title || 'New Notification',
                                body: message || 'New notification from Partner.',
                                id: Math.floor(Math.random() * 100000),
                                schedule: { at: new Date(Date.now() + 100) },
                                sound: 'default',
                                actionTypeId: '',
                                extra: payload.new
                            }
                        ]
                    })

                    // Dispatch to frontend to trigger silent Delta-Fetches 
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('orbit-push-sync', { detail: payload.new }))
                    }
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [user, supabase])

    return null
}
