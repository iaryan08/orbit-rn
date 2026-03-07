'use client'

import { useEffect } from 'react'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Capacitor } from '@capacitor/core'
import { auth, db } from '@/lib/firebase/client'
import { collection, query, where, onSnapshot, limit, orderBy } from 'firebase/firestore'

export function NativeNotificationListener() {
    const user = auth.currentUser

    useEffect(() => {
        if (!user || !Capacitor.isNativePlatform()) return

        // 1. Request channel permissions once
        const initNotifs = async () => {
            const perm = await LocalNotifications.checkPermissions()
            if (perm.display !== 'granted') {
                await LocalNotifications.requestPermissions()
            }
        }
        initNotifs()

        // 2. Subscribe to firestore notifications
        // We only care about new ones, but Firestore onSnapshot will give us existing ones too if not careful.
        // We filter by recipient_id and order by created_at desc.
        // For a true "monitor", we might just listen to the collection.
        const q = query(
            collection(db, 'notifications'),
            where('recipient_id', '==', user.uid),
            orderBy('created_at', 'desc'),
            limit(1)
        )

        let initialLoad = true
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (initialLoad) {
                initialLoad = false
                return
            }

            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const data = change.doc.data()
                    const { title, message } = data

                    await LocalNotifications.schedule({
                        notifications: [
                            {
                                title: title || 'New Notification',
                                body: message || 'New notification from Partner.',
                                id: Math.floor(Math.random() * 100000),
                                schedule: { at: new Date(Date.now() + 100) },
                                sound: 'default',
                                actionTypeId: '',
                                extra: data
                            }
                        ]
                    })

                    // Dispatch to frontend to trigger silent Delta-Fetches 
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('orbit-push-sync', { detail: data }))
                    }
                }
            })
        })

        return () => {
            unsubscribe()
        }
    }, [user])

    return null
}
