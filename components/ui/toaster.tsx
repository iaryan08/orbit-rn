'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useToast } from '@/hooks/use-toast'
import type { ToastContext } from '@/hooks/use-toast'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastViewport,
} from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  Shield,
  RefreshCw,
  WifiOff,
  ImageIcon,
  Mail,
  Flame,
  Sparkles,
  Settings,
  Gamepad2,
  MoonStar,
  LifeBuoy,
  Wrench,
  BellRing,
  type LucideIcon,
} from 'lucide-react'

type ToastProfile = {
  icon: LucideIcon
  iconClass: string
  shellClass: string
}

const toastProfiles: Record<ToastContext, ToastProfile> = {
  general: {
    icon: BellRing,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  spark: {
    icon: Sparkles,
    iconClass: 'bg-[#7c3aed]/20 text-[#c4b5fd]',
    shellClass: 'border-[#7c3aed]/25 !bg-[#110d1b]/96',
  },
  auth: {
    icon: Shield,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  sync: {
    icon: RefreshCw,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  network: {
    icon: WifiOff,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  memories: {
    icon: ImageIcon,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  letters: {
    icon: Mail,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  intimacy: {
    icon: Flame,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  settings: {
    icon: Settings,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  games: {
    icon: Gamepad2,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  lunara: {
    icon: MoonStar,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  support: {
    icon: LifeBuoy,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
  admin: {
    icon: Wrench,
    iconClass: 'bg-white/[0.04] text-white/75',
    shellClass: '',
  },
}

const textFromNode = (node: ReactNode) =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node).toLowerCase()
    : ''

function detectToastContext(
  title: ReactNode,
  description: ReactNode,
): ToastContext {
  const text = `${textFromNode(title)} ${textFromNode(description)}`

  if (/password|login|sign|session|biometric|lock|recovery|auth/.test(text))
    return 'auth'
  if (/spark/.test(text)) return 'spark'
  if (/offline|online|sync|fallback|queued|retry|network|connection/.test(text))
    return /network|connection/.test(text) ? 'network' : 'sync'
  if (/memory|polaroid|photo|gallery/.test(text)) return 'memories'
  if (/letter|mail|message/.test(text)) return 'letters'
  if (/intimacy|passion|flame|desire|romantic/.test(text)) return 'intimacy'
  if (/setting|preference|profile|app lock|biometric/.test(text))
    return 'settings'
  if (/quiz|truth|dare|game|bucket|dream/.test(text)) return 'games'
  if (/period|cycle|lunara|aura/.test(text)) return 'lunara'
  if (/support|help|ticket|issue/.test(text)) return 'support'
  if (/admin|feature flag|tools/.test(text)) return 'admin'
  return 'general'
}

export function Toaster() {
  const { toasts, dismiss } = useToast()
  const [closeUpId, setCloseUpId] = useState<string | null>(null)

  useEffect(() => {
    if (!closeUpId) return
    if (!toasts.some((t) => t.id === closeUpId)) {
      setCloseUpId(null)
    }
  }, [toasts, closeUpId])

  useEffect(() => {
    if (!toasts.length) return
    const closeOnInteract = () => dismiss()
    const closeOnKey = () => dismiss()
    window.addEventListener('pointerdown', closeOnInteract, { passive: true })
    window.addEventListener('touchstart', closeOnInteract, { passive: true })
    window.addEventListener('wheel', closeOnInteract, { passive: true })
    window.addEventListener('scroll', closeOnInteract, { passive: true })
    window.addEventListener('keydown', closeOnKey)
    return () => {
      window.removeEventListener('pointerdown', closeOnInteract)
      window.removeEventListener('touchstart', closeOnInteract)
      window.removeEventListener('wheel', closeOnInteract)
      window.removeEventListener('scroll', closeOnInteract)
      window.removeEventListener('keydown', closeOnKey)
    }
  }, [toasts.length, dismiss])

  return (
    <ToastProvider>
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        context,
        className,
        ...props
      }) {
        const toastContext = context ?? detectToastContext(title, description)
        const profile = toastProfiles[toastContext]
        const Icon = profile.icon
        const contentText = description ?? title
        return (
          <Toast
            key={id}
            {...props}
            className={cn(
              'group/toast relative !rounded-[1rem] border-white/12 !bg-[#0b0d13]/96 p-3 pr-11 sm:p-3.5 sm:pr-12',
              id === closeUpId && 'data-[state=closed]:slide-out-to-top-full',
              profile.shellClass,
              className,
            )}
          >
            <div className="relative z-10 flex min-w-0 flex-1 items-center gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10',
                  profile.iconClass,
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                {contentText ? (
                  <ToastDescription className="text-sm font-semibold leading-tight text-white">
                    {contentText}
                  </ToastDescription>
                ) : null}
                {action && <div className="pt-0.5">{action}</div>}
              </div>
            </div>
            <ToastClose
              className="right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/25 text-white/55 opacity-100 transition-all hover:bg-white/10 hover:text-white sm:opacity-0 sm:group-hover/toast:opacity-100"
              onClick={() => {
                setCloseUpId(id)
                dismiss(id)
              }}
            />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
