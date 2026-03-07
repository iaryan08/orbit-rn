'use client'

import { m, AnimatePresence } from 'framer-motion'
import { useEffect, useState, useRef } from 'react'
import { DecryptedImage } from '@/components/e2ee/decrypted-image'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { signOut } from '@/lib/client/auth'
import {
  Heart,
  LogOut,
  Settings,
  LayoutGrid,
  Mail,
  Image as ImageIcon,
  Moon,
  BookOpen,
  Film,
  Flame,
  Sparkles
} from 'lucide-react'
import { DeferredNotificationBell } from './deferred-notification-bell'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn, normalizeDate } from '@/lib/utils'
import { useAppMode } from './app-mode-context'
import { LunaraToggle } from './lunara-toggle'
import { SyncCinema } from './sync-cinema'
import { ImpactStyle } from '@capacitor/haptics'
import { useRouter } from 'next/navigation'
import { fetchUnreadCounts } from '@/lib/client/auth'
import { useBatteryOptimization } from '@/hooks/use-battery-optimization'
import { getPublicStorageUrl } from '@/lib/storage'
import { safeImpact, safeSelectionChanged } from '@/lib/client/haptics'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import { useOrbitStore } from '@/lib/store/global-store'
import { MediaCacheEngine } from '@/lib/client/media-cache/engine'
import { Checkbox } from '@/components/ui/checkbox'
import { SignOutDialog } from '@/components/dialogs/sign-out-dialog'
import { AddMemoryDialog } from '@/components/dialogs/add-memory-dialog'
import { SupportModal } from '@/components/support-modal'
import { PartnerOnlineDot } from './partner-online-dot'

interface DashboardHeaderProps {
  userName: string
  userAvatar?: string | null
  partnerName?: string | null
  daysTogetherCount?: number
  coupleId?: string | null
  unreadCounts?: {
    memories: number
    letters: number
  }
}

export function DashboardHeader({
  userName,
  userAvatar,
  partnerName,
  daysTogetherCount,
  coupleId,
  partnerId,
  userId,
  user,
  unreadCounts: initialUnreadCounts = { memories: 0, letters: 0 }
}: DashboardHeaderProps & { partnerId?: string, userId?: string, user?: any }) {
  const pathname = usePathname()
  const router = useRouter()
  const { mode } = useAppMode()
  const [hoveredPath, setHoveredPath] = useState<string | null>(null)
  const [optimisticPath, setOptimisticPath] = useState<string | null>(null)
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false)
  const [isAddingMemory, setIsAddingMemory] = useState(false)
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false)
  const { partnerProfile, profile, setCoreData, memoriesCount, unreadMemoriesCount, unreadLettersCount, partnerTodayMoods } = useOrbitStore()
  const [performanceMode, setPerformanceMode] = useState<'default' | 'lite'>('default')

  useEffect(() => {
    const { detectPerformanceMode } = require('@/lib/client/performance-mode')
    setPerformanceMode(detectPerformanceMode())
  }, [])

  const longPressTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const isLongPressActive = useRef<Record<string, boolean>>({})

  const handlePointerDown = (href: string) => {
    isLongPressActive.current[href] = false;
    longPressTimers.current[href] = setTimeout(async () => {
      isLongPressActive.current[href] = true;
      await triggerHaptic(ImpactStyle.Heavy);
      if (href === '/memories') {
        setIsAddingMemory(true);
      } else if (href === '/intimacy') {
        setIsSupportModalOpen(true);
      }
    }, 500);
  }

  const handlePointerUp = (href: string) => {
    if (longPressTimers.current[href]) {
      clearTimeout(longPressTimers.current[href]);
    }
  }

  const currentPath = (optimisticPath || pathname).replace(/\/$/, '') || '/'

  const { isVisible } = useBatteryOptimization()
  const DASH_FOCUS_REFRESH_KEY = 'orbit:dashboard_focus_refresh_at'
  const DASH_FOCUS_REFRESH_TTL_MS = 30000

  useEffect(() => {
    if (!coupleId || !isVisible) return
    if (pathname !== '/dashboard') return

    // Instead of polling with fetchUnreadCounts, we'll rely on the global store
    // which is updated by the consolidated sync and real-time broadenings.
    // However, we still want to refresh on focus/visible if stale.
    const checkSync = () => {
      try {
        const last = Number(localStorage.getItem(DASH_FOCUS_REFRESH_KEY) || '0')
        if (last > 0 && Date.now() - last < DASH_FOCUS_REFRESH_TTL_MS) return
        localStorage.setItem(DASH_FOCUS_REFRESH_KEY, String(Date.now()))
      } catch { }
      window.dispatchEvent(new CustomEvent('orbit:tab-delta-refresh', {
        detail: { pathname: '/dashboard', reason: 'focus' }
      }));
    }

    checkSync();
  }, [coupleId, isVisible, pathname])

  useEffect(() => {
    setOptimisticPath(null)
  }, [pathname])

  useEffect(() => {
    const moonRoutes = ['/dashboard', '/letters', '/memories', '/intimacy', '/settings']
    const lunaraRoutes = ['/dashboard', '/insights', '/partner', '/settings']
    const routes = mode === 'moon' ? moonRoutes : lunaraRoutes
    for (const route of routes) {
      router.prefetch(route)
    }
  }, [mode, router])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let showSub: any;
    let hideSub: any;

    const initKeyboard = async () => {
      showSub = await Keyboard.addListener('keyboardWillShow', () => setIsKeyboardVisible(true));
      hideSub = await Keyboard.addListener('keyboardWillHide', () => setIsKeyboardVisible(false));
    };

    initKeyboard();

    return () => {
      if (showSub) showSub.remove();
      if (hideSub) hideSub.remove();
    };
  }, [])

  const [mounted, setMounted] = useState(false)
  const [ready, setReady] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const topMarkerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const timer = setTimeout(() => setReady(true), 500)

    const observer = new IntersectionObserver(
      ([entry]) => {
        const header = headerRef.current
        if (header) {
          header.dataset.scrolled = (!entry.isIntersecting).toString()
        }
      },
      { threshold: 0 }
    )

    if (topMarkerRef.current) {
      observer.observe(topMarkerRef.current)
    }

    let lastY = 0
    let lastExec = 0
    let isDesktopWeb = false;

    if (typeof window !== 'undefined') {
      isDesktopWeb = !Capacitor.isNativePlatform() && window.matchMedia('(min-width: 1024px)').matches;
    }

    const handleScroll = () => {
      const now = Date.now()
      if (now - lastExec < 100) return
      lastExec = now

      window.requestAnimationFrame(() => {
        const currentY = window.scrollY
        const header = headerRef.current
        const profileCont = document.getElementById('profile-toggle-container')

        // Mobile web + native: hide on scroll down, show on scroll up
        // Tolerate small movements (50px) to prevent jitter
        const isScrollingDown = currentY > lastY && currentY > 50
        const isScrollingUp = currentY < lastY

        // Settings page specific: don't hide if we're near the bottom to prevent dock overlapping content when trying to reach bottom
        const isNearBottom = (window.innerHeight + currentY) >= document.body.offsetHeight - 100;

        let isVisible = true;

        if (header && header.dataset.visible !== "true") {
          header.dataset.visible = "true"
        }

        if (profileCont && profileCont.dataset.visible !== isVisible.toString()) {
          profileCont.dataset.visible = isVisible.toString()
        }

        lastY = currentY
      })
    }

    const scrollOpts = { passive: true }
    window.addEventListener('scroll', handleScroll, scrollOpts)

    return () => {
      clearTimeout(timer)
      observer.disconnect()
      window.removeEventListener('scroll', handleScroll, scrollOpts as any)
    }
  }, [])

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false)
  const [showSyncCinema, setShowSyncCinema] = useState(false)

  if (!mounted) return null

  const triggerHaptic = async (style: ImpactStyle = ImpactStyle.Light) => {
    await safeImpact(style, 10)
  }

  // Extra-light haptic for UI chrome elements like the bell
  const triggerSoftTick = async () => {
    await safeSelectionChanged(5)
  }

  const triggerTabDeltaRefresh = (targetPath: string) => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('orbit:tab-delta-refresh', {
      detail: {
        pathname: targetPath,
        force: true,
        reason: 'same-tab-refresh'
      }
    }))
  }

  return (
    <>
      <div ref={topMarkerRef} className="absolute top-0 left-0 w-px h-px pointer-events-none" />

      {/* 0. Desktop Blur Protection */}
      <div className={cn(
        "fixed top-0 left-0 right-0 h-20 z-[30] hidden lg:block pointer-events-none transition-all duration-500",
        mode === 'moon' ? "bg-black/5" : "bg-black/5"
      )} />

      {/* 0. Mobile/Tablet Status Bar Overlay (Gradient fade instead of full blur) */}
      <div className={cn(
        "fixed top-0 left-0 right-0 h-20 z-[30] lg:hidden pointer-events-none transition-all duration-500",
        performanceMode === 'lite'
          ? "bg-black !backdrop-blur-none"
          : "bg-gradient-to-b from-black/80 via-black/20 to-transparent"
      )} />

      {/* 2. The Dock (Adaptive positioning controlled purely via CSS [data-scrolled]) */}
      <nav
        ref={headerRef}
        data-scrolled="false"
        data-visible="true"
        className={cn(
          "fixed z-[2000] flex items-center gap-0 transition-all duration-200 ease-[cubic-bezier(0.2,0,0,1)]",
          "left-1/2 -translate-x-1/2 rounded-full p-1 px-2 md:px-1",
          // Premium Monochrome Border style
          "border shadow-2xl",
          mode === 'moon' ? "border-rose-500/30" : "border-purple-500/30",
          performanceMode === 'lite'
            ? "bg-black !backdrop-blur-none"
            : (cn("blur-ms nav-blur", "bg-black/40 shadow-xl", mode === 'moon' ? "text-rose-100" : "text-purple-100")),
          // Monochrome Mode Consistency (Reduced alpha)
          "[html[data-monochrome='true']_&]:bg-black/25 [html[data-monochrome='true']_&]:border-white/5",
          // Layout transitions using CSS only (Zero React Render Overhead)
          "bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] md:bottom-auto md:top-4 lg:top-4",
          "data-[visible=false]:opacity-0 data-[visible=false]:translate-y-10 md:data-[visible=false]:translate-y-0",
          isKeyboardVisible && "opacity-0 translate-y-20 pointer-events-none transition-none"
        )}
      >
        <TooltipProvider delayDuration={100}>
          <div className="hidden lg:flex items-center gap-2 pl-2 pr-1 select-none pointer-events-none">
            <div
              className={cn(
                "w-1.5 h-1.5 rounded-full ring-2 ring-black shadow-[0_0_10px_rgba(244,63,94,0.4)]",
                mode === 'moon' ? "bg-rose-500" : "bg-purple-500"
              )}
            />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/40 border-r border-white/10 pr-2.5">
              {mode === 'moon' ? 'MoonBetweenUs' : 'Lunara Sync'}
            </span>
          </div>

          <DeferredNotificationBell />

          <div className={cn(
            "w-px h-5 mx-2",
            mode === 'moon' ? "bg-white/10" : "bg-white/20"
          )} />

          {(mode === 'moon' ? [
            { href: '/dashboard', icon: LayoutGrid, label: 'Home' },
            { href: '/letters', icon: Mail, label: 'Letters' },
            { href: '/memories', icon: ImageIcon, label: 'Memories' },
            { href: '/intimacy', icon: Flame, label: 'Intimacy' },
          ] : [
            { href: '/dashboard', icon: Sparkles, label: 'Dashboard' },
            { href: '/insights', icon: BookOpen, label: 'Insights' },
            { href: '/partner', icon: Heart, label: 'Partner' },
          ]).map((item) => {
            const isActive = currentPath.startsWith(item.href) && (item.href !== '/dashboard' || currentPath === '/dashboard' || currentPath === '/')
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    scroll
                    onMouseEnter={() => setHoveredPath(item.href)}
                    onClick={(e) => {
                      if (isLongPressActive.current[item.href]) {
                        e.preventDefault()
                        isLongPressActive.current[item.href] = false
                        return
                      }

                      const normalizedTarget = item.href.replace(/\/$/, '') || '/'
                      const normalizedCurrent = currentPath.replace(/\/$/, '') || '/'

                      if (normalizedCurrent === normalizedTarget) {
                        e.preventDefault()
                        triggerTabDeltaRefresh(normalizedTarget)
                        return
                      }

                      setOptimisticPath(item.href)
                      triggerTabDeltaRefresh(normalizedTarget)
                    }}
                    onContextMenu={(e) => {
                      // Prevent default context menu on long press
                      e.preventDefault()
                    }}
                    className="relative block"
                  >
                    {isActive && (
                      <m.div
                        layoutId="nav-active-indicator"
                        className="absolute inset-0 bg-white/10 border border-white/10 rounded-full shadow-sm"
                        transition={{
                          type: "spring",
                          stiffness: 150,
                          damping: 20,
                          bounce: 0
                        }}
                      />
                    )}
                    <m.div
                      onTapStart={() => {
                        triggerHaptic(ImpactStyle.Light);
                        handlePointerDown(item.href);
                      }}
                      onTapCancel={() => handlePointerUp(item.href)}
                      onTap={() => handlePointerUp(item.href)}
                      onPointerLeave={() => handlePointerUp(item.href)}
                      onPan={(e, info) => {
                        if (info.offset.y < -30) handlePointerUp(item.href);
                      }}
                      className={cn(
                        "p-2.5 rounded-full flex items-center justify-center relative group transition-all duration-300",
                        isActive ? "text-white" : "opacity-40 hover:opacity-100 relative z-10"
                      )}
                    >
                      <item.icon className={cn(
                        "w-5 h-5 relative z-10 transition-colors duration-300",
                        isActive ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "text-white/40"
                      )} />
                      {item.label === 'Memories' && unreadMemoriesCount > 0 && !isActive && (
                        <span className={cn(
                          "absolute top-1 right-1 w-2 h-2 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.4)] border-none",
                          mode === 'moon' ? "bg-rose-500" : "bg-purple-400"
                        )} />
                      )}
                      {item.label === 'Letters' && unreadLettersCount > 0 && !isActive && (
                        <span className={cn(
                          "absolute top-1 right-1 w-2 h-2 rounded-full shadow-[0_0_10px_rgba(244,63,94,0.4)] border-none",
                          mode === 'moon' ? "bg-rose-500" : "bg-purple-400"
                        )} />
                      )}
                      {item.label === 'Intimacy' && !isActive && (
                        (() => {
                          const state = useOrbitStore.getState();
                          const isUser1 = profile?.id === state.couple?.user1_id;
                          const partnerContentField = isUser1 ? 'content_user2' : 'content_user1';
                          const myContentField = isUser1 ? 'content_user1' : 'content_user2';

                          const lastViewed = profile?.last_viewed_intimacy_at
                            ? new Date(profile.last_viewed_intimacy_at).getTime()
                            : 0;

                          const hasUnreadIntimacy = Object.values(useOrbitStore.getState().milestones || {}).some((m: any) => {
                            const partnerContent = m[partnerContentField];
                            const myContent = m[myContentField];
                            const updatedAt = m.updated_at ? new Date(m.updated_at).getTime() : 0;

                            // Unread if partner answered, I haven't, and it was updated after I last checked.
                            return partnerContent && !myContent && updatedAt > lastViewed;
                          });

                          return hasUnreadIntimacy ? (
                            <span className={cn(
                              "absolute top-1 right-1 w-2 h-2 rounded-full border-none",
                              partnerTodayMoods[0]
                                ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]"
                                : (mode === 'moon' ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]" : "bg-purple-400 shadow-[0_0_8px_rgba(168,85,247,0.4)]")
                            )} />
                          ) : null;
                        })()
                      )}
                    </m.div>
                  </Link>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  sideOffset={15}
                  className="bg-black text-white px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10 shadow-2xl"
                >
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            )
          })}

          <div className={cn(
            "w-px h-5 mx-2",
            mode === 'moon' ? "bg-white/10" : "bg-white/20"
          )} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/settings"
                scroll
                onClick={(e) => {
                  const normalizedTarget = '/settings'
                  const normalizedCurrent = currentPath.replace(/\/$/, '') || '/'

                  if (normalizedCurrent === normalizedTarget) {
                    e.preventDefault()
                    triggerTabDeltaRefresh(normalizedTarget)
                    return
                  }

                  setOptimisticPath('/settings')
                  triggerTabDeltaRefresh(normalizedTarget)
                }}
                className="relative block"
              >
                <m.div
                  className={cn(
                    "p-2.5 rounded-full flex items-center justify-center relative group transition-all duration-300",
                    currentPath.startsWith('/settings') ? "text-white" : "opacity-40 hover:opacity-100 relative z-10"
                  )}
                >
                  <Settings className={cn(
                    "w-5 h-5 relative z-10 transition-colors duration-300",
                    currentPath.startsWith('/settings') ? "text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "text-white/40"
                  )} />
                </m.div>
              </Link>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              sideOffset={15}
              className="bg-black text-white px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/10 shadow-2xl"
            >
              <p>Settings</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </nav>

      <div
        id="profile-toggle-container"
        data-visible="true"
        className={cn(
          "fixed right-4 md:right-10 z-[2000] flex flex-col items-end justify-center gap-3 top-[calc(env(safe-area-inset-top,0px)+2px)] md:top-0 h-16 md:h-20 transition-all duration-300 data-[visible=false]:opacity-0 data-[visible=false]:pointer-events-none data-[visible=false]:translate-y-[-10px] md:data-[visible=false]:translate-y-0",
          pathname === '/settings' && "hidden"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="hidden md:block">
            <LunaraToggle />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-12 w-12 rounded-full p-0 border border-white/10 shadow-lg focus-visible:ring-0">
                <div className="h-full w-full relative">
                  {userAvatar ? (
                    <DecryptedImage
                      src={userAvatar}
                      alt={userName}
                      className="h-full w-full rounded-full object-cover"
                      priority={true}
                      loadingSize="sm"
                      prefix={coupleId}
                      bucket="avatars"
                    />
                  ) : (
                    <div className="h-full w-full rounded-full bg-gradient-to-br from-rose-500/20 to-rose-900/40 flex items-center justify-center text-rose-100 font-bold text-lg select-none uppercase">
                      {userName?.charAt(0) || 'U'}
                    </div>
                  )}
                  {partnerId && (
                    <PartnerOnlineDot
                      coupleId={coupleId || ''}
                      userId={userId || ''}
                      partnerId={partnerId}
                    />
                  )}
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-black/95 text-white border-white/10 rounded-[1.5rem] p-2 shadow-2xl" align="end" sideOffset={12} collisionPadding={24}>
              <div className="px-2 py-1.5">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{userName}</p>
                  {partnerId && (
                    <div className="relative w-2 h-2">
                      <PartnerOnlineDot
                        coupleId={coupleId || ''}
                        userId={userId || ''}
                        partnerId={partnerId}
                      />
                    </div>
                  )}
                </div>
                {partnerId && <p className="text-xs opacity-60">with {useOrbitStore.getState().getPartnerDisplayName()}</p>}
              </div>
              <DropdownMenuSeparator className="bg-white/10" />
              <div className="px-2 py-2 flex justify-center md:hidden">
                <LunaraToggle variant="menu" />
              </div>
              <DropdownMenuSeparator className="bg-white/10 md:hidden" />
              <DropdownMenuItem className="rounded-xl cursor-pointer" onClick={() => setShowSyncCinema(true)}>
                Sync Cinema
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="rounded-xl cursor-pointer">
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="rounded-xl cursor-pointer" onClick={() => setShowSignOutConfirm(true)}>
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Sync Cinema Dialog Overlay */}
        <SyncCinema isActive={showSyncCinema} onClose={() => setShowSyncCinema(false)} coupleId={coupleId} partnerId={partnerId} userId={userId} />
      </div>

      <SignOutDialog
        open={showSignOutConfirm}
        onOpenChange={setShowSignOutConfirm}
      />

      <AddMemoryDialog
        open={isAddingMemory}
        onOpenChange={setIsAddingMemory}
        onSuccess={() => {
          if (memoriesCount !== undefined) {
            setCoreData({ memoriesCount: memoriesCount + 1 })
          }
        }}
      />
      {partnerId && (
        <SupportModal
          isOpen={isSupportModalOpen}
          onClose={() => setIsSupportModalOpen(false)}
          phase={partnerProfile?.current_phase || 'follicular'}
          day={partnerProfile?.cycle_day || 1}
          partnerName={partnerName || 'Partner'}
          partnerAvatar={getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars') || undefined}
          partnerId={partnerId}
        />
      )}
    </>
  )
}

