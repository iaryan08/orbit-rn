'use client'

import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Heart, Mail } from 'lucide-react'

export default function SignUpSuccessPage() {
    return (
        <main className="min-h-screen flex items-center justify-center p-8 bg-[#09090b] text-center font-sans selection:bg-rose-500/10">
            <div className="fixed top-0 left-0 right-0 bg-[#09090b] z-[9999]" style={{ height: 'env(safe-area-inset-top, 44px)' }} />

            <svg width="0" height="0" className="absolute">
                <defs>
                    <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f472b6" />
                        <stop offset="50%" stopColor="#e2556f" />
                        <stop offset="100%" stopColor="#d98b75" />
                    </linearGradient>
                </defs>
            </svg>

            <Card className="w-full max-w-[320px] border-none bg-transparent shadow-none animate-in fade-in duration-700">
                <CardHeader className="space-y-12 pb-16">
                    <div className="mx-auto block">
                        <Mail className="w-8 h-8 opacity-40 text-rose-300" />
                    </div>
                    <div className="space-y-3">
                        <CardTitle className="text-3xl font-serif text-white tracking-tight">Check Email</CardTitle>
                        <CardDescription className="text-white/20 text-[9px] uppercase tracking-[0.3em] font-black">
                            Verify your account
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent className="space-y-10 p-0">
                    <p className="text-[10px] text-white/40 leading-relaxed font-black uppercase tracking-widest">
                        Welcome to Orbit! We've sent a verification link to your inbox. Please verify your email to secure your private space.
                    </p>

                    <div className="flex items-center justify-center gap-4 opacity-10">
                        <Heart className="w-3 h-3" fill="url(#heartGradient)" strokeWidth={0} />
                        <span className="text-[7px] uppercase tracking-[0.4em] font-black text-white">Orbit awaits</span>
                        <Heart className="w-3 h-3" fill="url(#heartGradient)" strokeWidth={0} />
                    </div>
                </CardContent>

                <CardFooter className="p-0 pt-16">
                    <Button asChild className="w-full h-14 bg-white text-black hover:bg-white/90 font-black text-[10px] uppercase tracking-[0.2em] rounded-none transition-all">
                        <Link href="/auth/login">Continue to Sign In</Link>
                    </Button>
                </CardFooter>
            </Card>
        </main>
    )
}
