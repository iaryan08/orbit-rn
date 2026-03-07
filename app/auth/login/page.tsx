'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Heart } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { signInClient } from '@/lib/firebase/auth-client'
import { normalizePairCode, stashPendingPairInvite } from '@/lib/client/pair-invite'

const scrollIntoView = (e: React.FocusEvent<HTMLInputElement>) =>
    setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)

function LoginForm() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [recentAccounts, setRecentAccounts] = useState<string[]>([])
    const [isPending, setIsPending] = useState(false)
    const router = useRouter()
    const searchParams = useSearchParams()
    const { toast } = useToast()

    useEffect(() => {
        const pairFromLink = normalizePairCode(searchParams.get('pair') || '')
        if (pairFromLink) stashPendingPairInvite(pairFromLink)

        try {
            const raw = localStorage.getItem('orbit:recent_accounts:v1')
            const parsed = raw ? JSON.parse(raw) : []
            if (Array.isArray(parsed)) setRecentAccounts(parsed.filter((v) => typeof v === 'string'))
        } catch { }
    }, [searchParams])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsPending(true)

        const result = await signInClient(email, password)
        if (result?.error) {
            toast({ title: "Drift Detected", description: result.error, variant: 'destructive' })
            setIsPending(false)
        } else {
            router.push('/dashboard')
        }
    }

    return (
        <main className="min-h-[100dvh] flex flex-col items-center justify-start sm:justify-center pt-24 sm:pt-8 pb-8 px-8 bg-[#09090b] font-sans selection:bg-rose-500/10 overflow-y-auto w-full">
            <div className="fixed top-0 left-0 right-0 bg-[#09090b] z-[9999]" style={{ height: 'env(safe-area-inset-top, 44px)' }} />

            <Card className="w-full max-w-[320px] border-none bg-transparent shadow-none animate-in fade-in duration-700 mt-0">
                <CardHeader className="text-center space-y-8 pb-12">
                    <div className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-white/5 border border-white/5 shadow-2xl">
                        <Heart className="w-8 h-8 text-rose-400 flex-shrink-0" strokeWidth={1.5} />
                    </div>
                    <div className="space-y-3">
                        <CardTitle className="text-3xl font-serif text-white tracking-tight">Welcome</CardTitle>
                        <CardDescription className="text-white/40 text-[9px] uppercase tracking-[0.3em] font-black">
                            Sign in to Orbit
                        </CardDescription>
                    </div>
                </CardHeader>

                <form onSubmit={handleSubmit}>
                    <CardContent className="space-y-10 p-0">
                        <div className="space-y-4">
                            <Label htmlFor="email" className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                placeholder="Address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                onFocus={scrollIntoView}
                                className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white placeholder:text-white/5 rounded-none focus:border-white/30 transition-all px-1"
                                required
                            />
                            {recentAccounts.length > 0 && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {recentAccounts.map((acct) => (
                                        <button
                                            key={acct}
                                            type="button"
                                            onClick={() => {
                                                setEmail(acct)
                                                setPassword('')
                                            }}
                                            className="px-2.5 py-1 rounded-full border border-white/10 text-[9px] font-black uppercase tracking-[0.12em] text-white/45 hover:text-white/70 hover:border-white/20 transition-colors"
                                        >
                                            {acct}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between ml-1">
                                <Label htmlFor="password" className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black">Password</Label>
                                <Link href="/auth/forgot-password" title="Forgot Password" className="text-[7px] text-white/40 hover:text-rose-400 uppercase tracking-widest font-black transition-colors">
                                    Forgot?
                                </Link>
                            </div>
                            <Input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                onFocus={scrollIntoView}
                                className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white placeholder:text-white/5 rounded-none focus:border-white/30 transition-all px-1"
                                required
                            />
                        </div>
                    </CardContent>

                    <CardFooter className="flex flex-col gap-12 p-0 pt-16">
                        <Button
                            type="submit"
                            className="w-full h-14 bg-white text-black hover:bg-white/90 font-black text-[10px] uppercase tracking-[0.2em] rounded-none transition-all"
                            disabled={isPending}
                        >
                            {isPending ? 'Authenticating...' : 'Sign In'}
                        </Button>
                        <p className="text-[9px] text-white/10 text-center font-black uppercase tracking-[0.3em]">
                            {"New User? "}
                            <Link href="/auth/sign-up" className="text-rose-400 hover:text-rose-300 transition-colors">
                                Join Orbit
                            </Link>
                        </p>
                    </CardFooter>
                </form>
            </Card>
        </main>
    )
}

export default function LoginPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#09090b]"><Heart className="w-6 h-6 text-white/5 animate-pulse" /></div>}>
            <LoginForm />
        </Suspense>
    )
}
