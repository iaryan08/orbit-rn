'use client'

import React, { useEffect, useState } from "react"
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase/client'
import { onAuthStateChanged } from 'firebase/auth'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Heart, Lock } from 'lucide-react'
import { OrbitLoading } from '@/components/orbit-loading'

export default function HomePage() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        router.replace('/dashboard')
      } else {
        setIsChecking(false)
      }
    })

    const safetyTimer = setTimeout(() => setIsChecking(false), 3000)
    return () => {
      unsubscribe()
      clearTimeout(safetyTimer)
    }
  }, [router])

  if (isChecking) return <OrbitLoading />

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center overflow-hidden">
      <div
        className="fixed top-0 left-0 right-0 bg-black pointer-events-none z-[9999]"
        style={{ height: 'env(safe-area-inset-top, 44px)' }}
      />
      <div
        className="fixed left-0 right-0 pointer-events-none z-[9998]"
        style={{
          top: 'env(safe-area-inset-top, 44px)',
          height: '28px',
          background: 'linear-gradient(to bottom, #000000 0%, transparent 100%)'
        }}
      />

      <div className="flex flex-col items-center space-y-12 mb-20 animate-in fade-in zoom-in duration-1000">
        <div
          className="mx-auto w-24 h-24 bg-white/[0.04] flex items-center justify-center ring-1 ring-white/[0.08]"
          style={{ borderRadius: '24px' }}
        >
          <svg width="0" height="0" className="absolute">
            <defs>
              <linearGradient id="heartGradientSplash" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f472b6" />
                <stop offset="50%" stopColor="#e2556f" />
                <stop offset="100%" stopColor="#d98b75" />
              </linearGradient>
            </defs>
          </svg>
          <Heart
            className="w-12 h-12 animate-pulse drop-shadow-lg"
            style={{ fill: 'url(#heartGradientSplash)' }}
            strokeWidth={0}
          />
        </div>

        <div className="space-y-4">
          <h1 className="text-6xl md:text-8xl font-serif font-black tracking-tighter text-white leading-none">
            Orbit
          </h1>
          <p className="text-rose-100/20 text-xs md:text-sm uppercase tracking-[0.4em] font-black">
            Love &amp; Connection
          </p>
        </div>
      </div>

      <div className="w-full max-w-sm space-y-4 animate-in fade-in slide-in-from-bottom-10 duration-1000 delay-300">
        <Button asChild className="w-full h-16 rounded-none bg-white text-black hover:bg-white/90 font-black text-[12px] uppercase tracking-[0.2em] transition-transform active:scale-[0.98]">
          <Link href="/auth/login">Sign In</Link>
        </Button>
        <Button asChild variant="ghost" className="w-full h-16 rounded-none text-white/40 hover:text-white hover:bg-white/5 font-bold text-[10px] uppercase tracking-[0.2em]">
          <Link href="/auth/sign-up">Join Orbit</Link>
        </Button>
      </div>

      <div className="fixed bottom-12 opacity-10 flex flex-col items-center gap-2">
        <div className="flex items-center gap-2">
          <Lock className="w-3 h-3" />
          <p className="text-[10px] uppercase tracking-[0.3em] font-black">End-to-End Private</p>
        </div>
      </div>
    </main>
  )
}
