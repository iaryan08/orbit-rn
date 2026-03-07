'use client'

import dynamic from 'next/dynamic'
import { useAppMode } from './app-mode-context'
import { AnimatePresence, motion } from 'framer-motion'

const LunaraLayout = dynamic(
    () => import('./lunara/lunara-layout').then(mod => mod.LunaraLayout),
    { ssr: false, loading: () => null }
)

export function DashboardShell({
    children,
    profile,
    partnerProfile,
    couple,
    milestones,
    isInitialized
}: {
    children: React.ReactNode,
    profile?: any,
    partnerProfile?: any,
    couple?: any,
    milestones?: any,
    isInitialized?: boolean
}) {
    const { mode } = useAppMode()

    const lunaraData = { profile, partnerProfile, couple, milestones, isInitialized }

    return (
        <AnimatePresence mode="wait" initial={false}>
            {mode === 'lunara' ? (
                <motion.div
                    key="lunara-mode"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                    <LunaraLayout initialData={lunaraData} />
                </motion.div>
            ) : (
                <motion.div
                    key="moon-mode"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                >
                    {children}
                </motion.div>
            )}
        </AnimatePresence>
    )
}
