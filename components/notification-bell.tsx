import { auth, db } from '@/lib/firebase/client'
import { doc, getDoc } from 'firebase/firestore'
import { useState, useEffect } from 'react'
import * as Portal from '@radix-ui/react-portal'
import { ImpactStyle } from '@capacitor/haptics'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { Geolocation } from '@capacitor/geolocation'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Bell, Calendar, Heart, Mail, Sparkles, X, Trash2, BellOff, RotateCw, MapPin, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Drawer,
    DrawerClose,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
} from '@/components/ui/drawer'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { getUnreadCount, getNotifications, markAsRead, deleteNotification, deleteAllNotifications } from '@/lib/client/notifications'
import { formatDistanceToNow } from 'date-fns'
import { useRouter } from 'next/navigation'
import { useOrbitStore } from '@/lib/store/global-store'
import { cn } from '@/lib/utils'
import { subscribeUserToPush, requestNotificationPermission } from '@/lib/push'
import { toast } from 'sonner'
import { AnnouncementModal } from './announcement-modal'
import { safeImpact } from '@/lib/client/haptics'

interface Notification {
    id: string
    title: string
    message: string
    created_at: string
    is_read: boolean
    action_url?: string
    type: 'mood' | 'letter' | 'memory' | 'period_start' | 'ovulation' | 'intimacy' | 'on_this_day' | 'spark' | 'heartbeat' | 'polaroid' | 'bucket_list' | 'announcement' | 'comment'
    metadata?: any
}

export function NotificationBell({ className }: { className?: string }) {
    const SESSION_NOTIF_REQUESTED_KEY = 'orbit:session:notif_prompted'
    const SESSION_LOC_REQUESTED_KEY = 'orbit:session:loc_prompted'
    const [count, setCount] = useState(0)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

    // Close drawer on Android back button press (consumed before GlobalBackHandler)
    useEffect(() => {
        if (!open) return
        const handleBack = (e: Event) => {
            e.preventDefault()
            setOpen(false)
        }
        window.addEventListener('capacitor:back', handleBack)
        return () => window.removeEventListener('capacitor:back', handleBack)
    }, [open])

    const [isPushSupported, setIsPushSupported] = useState(false)
    const [pushSubscription, setPushSubscription] = useState<PushSubscription | null>(null)
    const [checkingPush, setCheckingPush] = useState(true)
    const [isIncognito, setIsIncognito] = useState(false)
    const [locationPermission, setLocationPermission] = useState<PermissionState | 'prompt-with-rationale'>('prompt')
    const [permission, setPermission] = useState<NotificationPermission>('default')
    const [birthdayMissing, setBirthdayMissing] = useState(false)
    const [announcementModalOpen, setAnnouncementModalOpen] = useState(false)
    const [selectedAnnouncement, setSelectedAnnouncement] = useState<Notification | null>(null)
    const [permissionsDialogOpen, setPermissionsDialogOpen] = useState(false)
    const [hasPromptedInitial, setHasPromptedInitial] = useState(false)
    const { unreadMemoriesCount, unreadLettersCount, setCoreData, partnerTodayMoods, profile, partnerProfile } = useOrbitStore()
    const router = useRouter()
    const COUNT_CACHE_KEY = 'orbit:notification_unread_count'

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const cached = localStorage.getItem(COUNT_CACHE_KEY)
            if (cached && !Number.isNaN(Number(cached))) {
                setCount(Number(cached))
            }
        }

        const refreshBirthdayStatus = async (userId: string) => {
            try {
                const profileDoc = await getDoc(doc(db, 'users', userId));
                setBirthdayMissing(!profileDoc.data()?.birthday)
            } catch {
                setBirthdayMissing(false)
            }
        }

        const setupEvents = async () => {
            const user = auth.currentUser;
            if (!user) return

            fetchCount()
            refreshBirthdayStatus(user.uid)

            const onRefresh = () => {
                fetchNotifications()
                fetchCount()
            }

            const onOptimisticSync = () => {
                setCount(prev => {
                    const next = prev + 1
                    if (typeof window !== 'undefined') localStorage.setItem(COUNT_CACHE_KEY, String(next))
                    return next
                })
            }
            window.addEventListener('orbit:notification-refresh', onRefresh);
            window.addEventListener('orbit:notifications-sync', onOptimisticSync);
            return () => {
                window.removeEventListener('orbit:notification-refresh', onRefresh);
                window.removeEventListener('orbit:notifications-sync', onOptimisticSync);
            };
        }

        const cleanupPromise = setupEvents()

        checkPushSubscription();

        return () => {
            cleanupPromise.then(cleanup => cleanup?.());
        }
    }, [])


    const checkPushSubscription = async () => {
        if (typeof window === 'undefined') return

        // 1. Instant check for permission only
        const currentPermission = (typeof window !== 'undefined' && 'Notification' in window)
            ? Notification.permission
            : 'default'
        setPermission(currentPermission)

        // 2. Async check for push support (more resource intensive)
        const checkPush = async () => {
            if ('serviceWorker' in navigator && 'PushManager' in window) {
                setIsPushSupported(true)
                try {
                    const registration = await navigator.serviceWorker.getRegistration()
                    if (registration) {
                        const sub = await registration.pushManager.getSubscription()
                        setPushSubscription(sub)
                        if (sub) syncSubscription(sub)
                    }
                } catch (e) {
                    console.error('Push check error:', e)
                }
            }
        }

        // 3. Defer heavy privacy/permission checks
        const checkHeavy = async () => {
            if ('storage' in navigator && 'estimate' in navigator.storage) {
                const { quota } = await navigator.storage.estimate();
                if (quota && quota < 120000000) setIsIncognito(true);
            }

            if (Capacitor.isNativePlatform()) {
                try {
                    const loc = await Geolocation.checkPermissions();
                    // If fine OR coarse is granted, we consider location enabled.
                    const locStatus = (loc.location === 'granted' || loc.coarseLocation === 'granted') ? 'granted' : loc.location;
                    setLocationPermission(locStatus);

                    const notif = await LocalNotifications.checkPermissions();
                    setPermission(notif.display === 'prompt' ? 'default' : notif.display as NotificationPermission);
                } catch (e) { }
            } else if ('permissions' in navigator) {
                try {
                    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
                    setLocationPermission(status.state);
                    status.onchange = () => setLocationPermission(status.state);
                } catch (e) { }
            }
            setCheckingPush(false)
        }

        void checkPush()

        await checkHeavy();
    }

    useEffect(() => {
        if (!checkingPush && !hasPromptedInitial) {
            const needsPrompt = (isPushSupported && permission !== 'granted') || locationPermission !== 'granted';
            const hasDismissed = typeof window !== 'undefined' ? localStorage.getItem('orbit:permissions_prompt_dismissed') : null;
            const alreadyPromptedThisSession =
                typeof window !== 'undefined' &&
                sessionStorage.getItem(SESSION_NOTIF_REQUESTED_KEY) === '1' &&
                sessionStorage.getItem(SESSION_LOC_REQUESTED_KEY) === '1'

            if (needsPrompt && !isIncognito && !hasDismissed && !alreadyPromptedThisSession) {
                setPermissionsDialogOpen(true);
            }
            setHasPromptedInitial(true);
        }
    }, [checkingPush, permission, locationPermission, isPushSupported, isIncognito, hasPromptedInitial])

    const handleAllowPermissions = async () => {
        if (isPushSupported && permission === 'default') {
            await handleSubscribe()
        }

        await requestLocationPermission()

        setPermissionsDialogOpen(false)
    }

    const requestLocationPermission = async () => {
        if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_LOC_REQUESTED_KEY) === '1') {
            return
        }
        if (Capacitor.isNativePlatform()) {
            try {
                if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_LOC_REQUESTED_KEY, '1')
                const result = await Geolocation.requestPermissions()
                const status =
                    result.location === 'granted' || result.coarseLocation === 'granted'
                        ? 'granted'
                        : result.location
                setLocationPermission(status as PermissionState | 'prompt-with-rationale')

                if (status === 'denied') {
                    toast('Location permission blocked. Open app settings to enable.', {
                        icon: '📍'
                    })
                    try {
                        await (CapacitorApp as any).openSettings?.()
                    } catch {
                        // Some webviews may not support openSettings; label still guides user.
                    }
                }
            } catch (e) {
                console.error('Location permission request failed', e)
            }
            return
        }

        if (navigator.geolocation) {
            if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_LOC_REQUESTED_KEY, '1')
            navigator.geolocation.getCurrentPosition(
                () => setLocationPermission('granted'),
                (error) => {
                    if (error.code === error.PERMISSION_DENIED) {
                        setLocationPermission('denied')
                    } else {
                        setLocationPermission('granted')
                    }
                }
            )
        }
    }

    const handleSubscribe = async () => {
        try {
            if (typeof window !== 'undefined' && sessionStorage.getItem(SESSION_NOTIF_REQUESTED_KEY) === '1') {
                return
            }
            if (typeof window !== 'undefined') sessionStorage.setItem(SESSION_NOTIF_REQUESTED_KEY, '1')
            const result = await requestNotificationPermission()
            setPermission(result)

            if (result === 'denied') {
                toast.error('Notifications blocked. Please enable in browser settings.')
                return
            }

            if (result !== 'granted') return

            const sub = await subscribeUserToPush()
            setPushSubscription(sub)
            await syncSubscription(sub)
        } catch (error) {
            console.error('Push sub error:', error)
            toast.error('Could not enable live notifications')
        }
    }

    const syncSubscription = async (sub: PushSubscription) => {
        const subscriptionJSON = sub.toJSON();
        const res = await fetch('/api/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscriptionJSON),
        })
        return res.ok
    }

    useEffect(() => {
        if (open) {
            fetchNotifications()
        }
    }, [open])

    const fetchCount = async () => {
        const c = await getUnreadCount()
        setCount(c)
        if (typeof window !== 'undefined') localStorage.setItem(COUNT_CACHE_KEY, String(c))
    }

    const fetchNotifications = async () => {
        const isFirstLoad = notifications.length === 0
        if (isFirstLoad) setLoading(true)
        try {
            const data = await getNotifications()
            const notifs = data as Notification[]
            setNotifications(notifs)

            // Sync count accurately from list
            const unread = notifs.filter(n => !n.is_read).length
            setCount(unread)
            if (typeof window !== 'undefined') localStorage.setItem(COUNT_CACHE_KEY, String(unread))
        } catch (e) {
            console.error(e)
        } finally {
            if (isFirstLoad) setLoading(false)
        }
    }

    const resolveNotificationUrl = (notification: Notification) => {
        const actionUrl = notification.action_url || ''
        const metadata = notification.metadata || {}

        if (typeof metadata.letter_id === 'string' && metadata.letter_id) {
            return `/letters?open=${encodeURIComponent(metadata.letter_id)}`
        }
        if (typeof metadata.memory_id === 'string' && metadata.memory_id) {
            return `/memories?open=${encodeURIComponent(metadata.memory_id)}`
        }
        if (typeof metadata.polaroid_id === 'string' && metadata.polaroid_id) {
            return `/dashboard?polaroidId=${encodeURIComponent(metadata.polaroid_id)}`
        }
        if (typeof metadata.bucket_item_id === 'string' && metadata.bucket_item_id) {
            return `/dashboard?bucketItemId=${encodeURIComponent(metadata.bucket_item_id)}`
        }

        if (actionUrl) return actionUrl
        return '/dashboard'
    }

    const handleMarkAsRead = async (id: string, notification?: Notification) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
        setCount(prev => {
            const next = Math.max(0, prev - 1)
            if (typeof window !== 'undefined') localStorage.setItem(COUNT_CACHE_KEY, String(next))
            return next
        })

        if (notification) {
            if (notification.type === 'memory' || (notification.metadata?.type === 'memory')) {
                setCoreData({ unreadMemoriesCount: Math.max(0, unreadMemoriesCount - 1) })
            } else if (notification.type === 'letter' || (notification.metadata?.type === 'letter')) {
                setCoreData({ unreadLettersCount: Math.max(0, unreadLettersCount - 1) })
            }
        }

        await markAsRead(id)

        if (notification && notification.metadata?.type === 'announcement') {
            setSelectedAnnouncement(notification)
            setAnnouncementModalOpen(true)
            setOpen(false)
        } else if (notification) {
            const url = resolveNotificationUrl(notification)
            setOpen(false)
            router.push(url)
        }
    }

    const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
        await safeImpact(style, 10)
    }

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation()
        triggerHaptic(ImpactStyle.Medium)
        setNotifications(prev => prev.filter(n => n.id !== id))

        const wasUnread = notifications.find(n => n.id === id)?.is_read === false
        if (wasUnread) {
            setCount(prev => {
                const next = Math.max(0, prev - 1)
                if (typeof window !== 'undefined') localStorage.setItem(COUNT_CACHE_KEY, String(next))
                return next
            })
        }

        await deleteNotification(id)
    }

    const handleDeleteAll = async () => {
        triggerHaptic(ImpactStyle.Heavy)
        setNotifications([])
        setCount(0)
        if (typeof window !== 'undefined') localStorage.removeItem(COUNT_CACHE_KEY)
        await deleteAllNotifications()
        setClearConfirmOpen(false)
    }

    const getIcon = (type: string, size: number = 14) => {
        const props = {
            style: { width: size, height: size },
            strokeWidth: 2
        }
        switch (type) {
            case 'mood': return <Sparkles {...props} className="text-amber-400/80" />
            case 'letter': return <Mail {...props} className="text-rose-400/80" />
            case 'memory': return <Heart {...props} className="text-pink-400/80" />
            case 'period_start':
            case 'ovulation': return <Calendar {...props} className="text-purple-400/80" />
            default: return <Bell {...props} className="text-sky-400/80" />
        }
    }

    return (
        <>
            <Drawer
                open={open}
                onOpenChange={setOpen}
                shouldScaleBackground
                duration={175}
            >
                <DrawerTrigger asChild>
                    <button
                        className={cn(
                            "relative w-10 h-10 flex items-center justify-center rounded-full transition-all text-white/40 hover:text-white hover:bg-white/5",
                            className
                        )}
                    >
                        <Bell className="w-5 h-5" />
                        {count > 0 && (
                            <span className={cn(
                                "absolute top-1 right-1 h-2 w-2 rounded-full border-none shadow-[0_0_10px_rgba(244,63,94,0.4)]",
                                partnerTodayMoods[0] ? "bg-amber-400" : "bg-rose-500"
                            )} />
                        )}
                    </button>
                </DrawerTrigger>

                <DrawerContent className="bg-[#0a0a0a] border-white/[0.04] shadow-2xl h-[92dvh] rounded-t-[32px] flex flex-col focus:outline-none">
                    {/* Visually-hidden title and description for screen-reader accessibility */}
                    <DrawerTitle className="sr-only">Notifications</DrawerTitle>
                    <DrawerDescription className="sr-only">
                        View and manage relationship updates, letters, and memory notifications.
                    </DrawerDescription>

                    {/* Inner wrapper — fills parent max-height to enable scrolling */}
                    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden rounded-t-[32px]">

                        {/* Drag handle */}
                        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-white/[0.08] shrink-0" />

                        {/* Header Sticked Strip */}
                        <div className="sticky top-0 z-20 px-5 pt-6 pb-4 flex items-center justify-between shrink-0">
                            <div className="flex items-center gap-2.5">
                                <p className="text-[clamp(1.125rem,2.6vw,1.45rem)] font-bold text-white/92 tracking-tight leading-none">
                                    Notifications
                                </p>
                                {count > 0 && (
                                    <span className="text-[11px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]">
                                        {count}
                                    </span>
                                )}
                            </div>
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={(e) => { e.stopPropagation(); fetchNotifications(); fetchCount(); }}
                                    className="p-2 text-white/20 hover:text-white/60 transition-colors rounded-full hover:bg-white/5"
                                >
                                    <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                                </button>
                                {notifications.length > 0 && (
                                    <button
                                        onClick={() => setClearConfirmOpen(true)}
                                        className="p-2 text-white/20 hover:text-rose-400/60 transition-colors rounded-full hover:bg-white/5"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Permission Banners — condensed */}
                        {(!checkingPush && (
                            (locationPermission !== 'granted' && (locationPermission as any) !== 'coarseLocation') ||
                            (isPushSupported && permission !== 'granted' && !isIncognito) ||
                            birthdayMissing
                        )) && (
                                <div className="mx-5 my-3 rounded-2xl border border-white/[0.08] bg-black overflow-hidden shrink-0 shadow-lg">
                                    {!checkingPush && (locationPermission !== 'granted' && (locationPermission as any) !== 'coarseLocation') && (
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <MapPin className="h-3.5 w-3.5 text-amber-500/60 shrink-0" />
                                            <p className="text-[11px] text-white/35 flex-1">Location off — distance tracking disabled</p>
                                            <button
                                                onClick={requestLocationPermission}
                                                className="text-[10px] text-amber-400/60 hover:text-amber-400 font-medium shrink-0"
                                            >
                                                Turn on
                                            </button>
                                        </div>
                                    )}
                                    {!checkingPush && isPushSupported && permission !== 'granted' && !isIncognito && (
                                        <div className={cn("flex items-center gap-3 px-4 py-3", locationPermission !== 'granted' && "border-t border-white/[0.04]")}>
                                            <BellOff className="h-3.5 w-3.5 text-rose-500/60 shrink-0" />
                                            <p className="text-[11px] text-white/35 flex-1">Push alerts disabled</p>
                                            <button
                                                onClick={handleSubscribe}
                                                className="text-[10px] text-rose-400/60 hover:text-rose-400 font-medium shrink-0"
                                            >
                                                Enable
                                            </button>
                                        </div>
                                    )}
                                    {!checkingPush && birthdayMissing && (
                                        <div className={cn("flex items-center gap-3 px-4 py-3", ((locationPermission !== 'granted' && (locationPermission as any) !== 'coarseLocation') || (isPushSupported && permission !== 'granted' && !isIncognito)) && "border-t border-white/[0.04]")}>
                                            <Calendar className="h-3.5 w-3.5 text-rose-400/70 shrink-0" />
                                            <p className="text-[11px] text-white/45 flex-1">Add birthday to unlock date reminders</p>
                                            <button
                                                onClick={() => {
                                                    setOpen(false)
                                                    router.push('/settings?focus=birthday')
                                                }}
                                                className="text-[10px] text-rose-300/80 hover:text-rose-300 font-medium shrink-0"
                                            >
                                                Add now
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                        {/* Divider */}
                        <div className="mx-5 mb-1 h-px bg-white/[0.04] shrink-0" />

                        {/* Notification list */}
                        <div className="flex-1 overflow-y-auto notification-scrollbar">
                            {loading && notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-32">
                                    <RotateCw className="h-5 w-5 text-white/10 animate-spin" />
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-40 px-6 text-center animate-in fade-in zoom-in-95 duration-300">
                                    <div className="w-24 h-24 rounded-full bg-white/[0.08] flex items-center justify-center mb-8 shadow-inner shadow-white/[0.05]">
                                        <Bell className="h-10 w-10 text-white/[0.25]" strokeWidth={1} />
                                    </div>
                                    <p className="text-white/40 text-base font-medium tracking-tight">All caught up</p>
                                    <p className="text-white/15 text-xs mt-2 px-6 leading-relaxed">Notification sanctuary is clear.</p>
                                    <button
                                        onClick={fetchNotifications}
                                        className="mt-8 px-5 py-2.5 rounded-xl bg-white/[0.05] text-white/40 text-[11px] font-bold uppercase tracking-widest hover:bg-white/[0.08] hover:text-white/60 transition-all active:scale-95"
                                    >
                                        Check Refresh
                                    </button>
                                </div>
                            ) : (
                                <div className="px-4 pt-2 pb-8 flex flex-col gap-2">
                                    {notifications.map((notification) => (
                                        <div
                                            key={notification.id}
                                            className={cn(
                                                "group flex items-center gap-4 p-4 rounded-2xl transition-all duration-300",
                                                !notification.is_read
                                                    ? "bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] shadow-lg shadow-black/20"
                                                    : "bg-transparent hover:bg-white/[0.02] border border-transparent opacity-50 hover:opacity-80"
                                            )}
                                        >
                                            {/* Icon Indicator */}
                                            <div className="relative shrink-0">
                                                <div className={cn(
                                                    "w-10 h-10 rounded-xl flex items-center justify-center transition-colors duration-200",
                                                    !notification.is_read ? "bg-white/[0.06] text-white/90" : "bg-white/[0.03] text-white/40"
                                                )}>
                                                    {getIcon(notification.type, 18)}
                                                </div>
                                                {!notification.is_read && (
                                                    <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-rose-500 border-2 border-[#0a0a0a] shadow-[0_0_8px_rgba(244,63,94,0.4)]" />
                                                )}
                                            </div>

                                            {/* Content Area */}
                                            <div
                                                className="flex-1 min-w-0 cursor-pointer py-0.5"
                                                onClick={() => handleMarkAsRead(notification.id, notification)}
                                            >
                                                <div className="flex flex-col gap-0.5">
                                                    <p className={cn(
                                                        "text-[13px] font-semibold tracking-tight transition-colors duration-200",
                                                        !notification.is_read ? "text-white/90" : "text-white/40"
                                                    )}>
                                                        {notification.title}
                                                    </p>
                                                    <p className="text-[11px] leading-relaxed line-clamp-2 text-white/30 font-medium tracking-tight">
                                                        {notification.message}
                                                    </p>
                                                    <div className="flex items-center gap-1.5 mt-1">
                                                        <span className="text-[9px] text-white/15 font-bold uppercase tracking-widest">
                                                            {formatDistanceToNow(new Date(notification.created_at), { addSuffix: false })}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Button */}
                                            <button
                                                onClick={(e) => handleDelete(e, notification.id)}
                                                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-white/[0.04] hover:bg-rose-500/10 text-white/20 hover:text-rose-400 transition-all duration-300 active:scale-90"
                                                aria-label="Delete notification"
                                            >
                                                <X className="h-4 w-4" strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="h-safe-area-bottom mb-4" />

                        {/* ── Clear-all confirm — Vertically centered in viewport ── */}
                        {clearConfirmOpen && (
                            <div
                                className="fixed inset-0 z-[10002] flex items-center justify-center px-6"
                                style={{ background: 'rgba(5,5,5,0.92)' }}
                                onClick={() => setClearConfirmOpen(false)}
                            >
                                <div
                                    className="w-full max-w-sm rounded-2xl bg-[#161616] border border-white/[0.08] overflow-hidden shadow-2xl shadow-black/60"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <div className="flex flex-col items-center pt-8 pb-6 px-4 text-center">
                                        <div className="w-12 h-12 rounded-full bg-rose-500/10 flex items-center justify-center mb-4">
                                            <Trash2 className="h-5 w-5 text-rose-400" />
                                        </div>
                                        <h3 className="text-[16px] font-semibold text-white/90 mb-1">Clear all notifications?</h3>
                                        <p className="text-[12px] text-white/35">This can't be undone.</p>
                                    </div>
                                    <div className="grid grid-cols-2 border-t border-white/[0.06]">
                                        <button
                                            onClick={() => setClearConfirmOpen(false)}
                                            className="py-4 text-[14px] font-medium text-white/40 border-r border-white/[0.06] active:bg-white/5 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleDeleteAll}
                                            className="py-4 text-[14px] font-semibold text-rose-400 active:bg-rose-500/10 transition-colors"
                                        >
                                            Clear All
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>{/* end relative wrapper */}
                </DrawerContent>
            </Drawer>


            {/* Permissions Dialog */}
            <Dialog open={permissionsDialogOpen} onOpenChange={setPermissionsDialogOpen}>
                <DialogContent className="sm:max-w-md bg-[#0f0510] border-white/10 text-white shadow-none">
                    <DialogHeader>
                        <DialogTitle className="font-serif italic text-2xl text-rose-100">Enhance Your Experience</DialogTitle>
                        <DialogDescription className="text-white/60">
                            Allow permissions to unlock real-time distance tracking and receive live updates from {partnerProfile?.display_name || 'Partner'}.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex flex-col gap-3 py-4">
                        {locationPermission !== 'granted' && (
                            <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors", locationPermission === 'denied' ? "bg-red-500/10 border-red-500/30" : "bg-white/5 border-white/10")}>
                                {locationPermission === 'denied' ? <X className="text-red-400 w-5 h-5 shrink-0" /> : <MapPin className="text-amber-400 w-5 h-5 shrink-0" />}
                                <div className="flex flex-col">
                                    <span className={cn("text-sm font-medium", locationPermission === 'denied' ? "text-red-100" : "")}>
                                        {locationPermission === 'denied' ? 'Location Blocked' : 'Location Tracking'}
                                    </span>
                                    <span className={cn("text-[10px]", locationPermission === 'denied' ? "text-red-200/60" : "text-white/50")}>
                                        {locationPermission === 'denied' ? 'Please enable location in your browser settings' : 'To show distance between both'}
                                    </span>
                                </div>
                            </div>
                        )}
                        {isPushSupported && permission !== 'granted' && (
                            <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-colors", permission === 'denied' ? "bg-red-500/10 border-red-500/30" : "bg-white/5 border-white/10")}>
                                {permission === 'denied' ? <BellOff className="text-red-400 w-5 h-5 shrink-0" /> : <Bell className="text-amber-400 w-5 h-5 shrink-0" />}
                                <div className="flex flex-col">
                                    <span className={cn("text-sm font-medium", permission === 'denied' ? "text-red-100" : "")}>
                                        {permission === 'denied' ? 'Notifications Blocked' : 'Push Notifications'}
                                    </span>
                                    <span className={cn("text-[10px]", permission === 'denied' ? "text-red-200/60" : "text-white/50")}>
                                        {permission === 'denied' ? 'Please allow notifications in your browser settings' : 'To get instantly notified of new messages'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="flex gap-2 sm:gap-0 mt-2">
                        <Button variant="ghost" onClick={() => {
                            if (typeof window !== 'undefined') localStorage.setItem('orbit:permissions_prompt_dismissed', 'true');
                            setPermissionsDialogOpen(false);
                        }} className="text-white/40 hover:text-white">
                            Maybe Later
                        </Button>
                        <Button onClick={handleAllowPermissions} className="bg-gradient-to-r from-amber-500/80 to-rose-500/80 hover:from-amber-500 hover:to-rose-500 text-white border-0 shadow-lg shadow-rose-500/20">
                            Allow Access
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AnnouncementModal
                isOpen={announcementModalOpen}
                onClose={() => {
                    setAnnouncementModalOpen(false)
                    setSelectedAnnouncement(null)
                }}
                notification={selectedAnnouncement}
            />

        </>
    )
}
