import { useAppMode } from './app-mode-context'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, Moon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { safeImpact } from '@/lib/client/haptics'
import { ImpactStyle } from '@capacitor/haptics'

interface LunaraToggleProps {
    variant?: 'default' | 'menu' | 'nav'
    className?: string
}

export function LunaraToggle({ variant = 'default', className }: LunaraToggleProps) {
    const { mode, toggleMode } = useAppMode()

    const handleToggle = async () => {
        await safeImpact(ImpactStyle.Light, 10)
        toggleMode()
    }

    if (variant === 'menu') {
        return (
            <div className={cn("flex items-center justify-between w-full px-2 py-1", className)}>
                <span className={cn(
                    "text-sm font-bold transition-colors duration-500",
                    mode === 'moon' ? "text-rose-200" : "text-purple-200"
                )}>
                    {mode === 'moon' ? 'Moon' : 'Lunara'}
                </span>

                <button
                    onClick={handleToggle}
                    className={cn(
                        "relative flex items-center h-8 w-16 rounded-full p-1 cursor-pointer transition-all duration-500",
                        mode === 'moon'
                            ? "bg-rose-950/40 border-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.1)]"
                            : "bg-purple-950/40 border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.1)]",
                        "border border-white/10 backdrop-blur-md shadow-2xl ring-1 ring-white/5"
                    )}
                >
                    <motion.div
                        className={cn(
                            "absolute h-6 w-6 rounded-full flex items-center justify-center shadow-lg z-10",
                            mode === 'moon'
                                ? "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/50"
                                : "bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-500/50"
                        )}
                        animate={{
                            x: mode === 'moon' ? 0 : 32,
                        }}
                        transition={{
                            type: "spring",
                            stiffness: 450,
                            damping: 35
                        }}
                    >
                        <AnimatePresence mode="wait">
                            {mode === 'moon' ? (
                                <motion.div
                                    key="moon-icon"
                                    initial={{ scale: 0, rotate: -45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    exit={{ scale: 0, rotate: 45 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Heart className="w-3.5 h-3.5 text-white fill-white" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="lunara-icon"
                                    initial={{ scale: 0, rotate: 45 }}
                                    animate={{ scale: 1, rotate: 0 }}
                                    exit={{ scale: 0, rotate: -45 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Moon className="w-3.5 h-3.5 text-white fill-white" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </button>
            </div>
        )
    }

    if (variant === 'nav') {
        return (
            <button
                onClick={handleToggle}
                className={cn(
                    "relative flex items-center h-8 w-14 rounded-full p-1 cursor-pointer transition-all duration-500",
                    mode === 'moon'
                        ? "bg-rose-950/40 border-rose-500/30 shadow-[0_0_15px_rgba(251,113,133,0.1)]"
                        : "bg-purple-950/40 border-purple-500/30 shadow-[0_0_15px_rgba(168,85,247,0.1)]",
                    "border border-white/15 shadow-xl"
                )}
            >
                <motion.div
                    className={cn(
                        "absolute h-6 w-6 rounded-full flex items-center justify-center shadow-lg z-10",
                        mode === 'moon'
                            ? "bg-rose-400"
                            : "bg-purple-400"
                    )}
                    animate={{ x: mode === 'moon' ? 0 : 24 }}
                    transition={{ type: "spring", stiffness: 450, damping: 35 }}
                >
                    <AnimatePresence mode="wait">
                        {mode === 'moon' ? (
                            <motion.div key="m" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
                                <Heart className="w-3.5 h-3.5 text-white fill-white" />
                            </motion.div>
                        ) : (
                            <motion.div key="l" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ duration: 0.15 }}>
                                <Moon className="w-3.5 h-3.5 text-white fill-white" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            </button>
        )
    }

    return (
        <div className={cn("flex items-center gap-3", className)}>
            {/* Moon Mode */}
            <div className="hidden sm:flex items-center gap-2">
                <Heart
                    className={cn(
                        "w-3 h-3 transition-colors duration-500",
                        mode === 'moon' ? "text-rose-400" : "text-white/20"
                    )}
                    fill={mode === 'moon' ? "currentColor" : "none"}
                />
                <span
                    className={cn(
                        "text-[10px] uppercase tracking-[0.2em] font-bold transition-[color,transform] duration-500",
                        mode === 'moon'
                            ? "text-rose-100 drop-shadow-[0_0_12px_rgba(251,113,133,0.6)] scale-110"
                            : "text-white/20 hover:text-white/40"
                    )}
                >
                    Moon
                </span>
            </div>

            <button
                onClick={handleToggle}
                className={cn(
                    "relative flex items-center h-7 w-14 sm:h-8 sm:w-16 rounded-full p-1 cursor-pointer transition-all duration-500",
                    mode === 'moon'
                        ? "bg-rose-950/40 border-rose-500/30 shadow-[0_0_20px_rgba(251,113,133,0.15)]"
                        : "bg-purple-950/40 border-purple-500/30 shadow-[0_0_20px_rgba(168,85,247,0.15)]",
                    "border border-white/10 backdrop-blur-md shadow-xl"
                )}
            >
                <motion.div
                    className={cn(
                        "absolute h-5 w-5 sm:h-6 sm:w-6 rounded-full flex items-center justify-center shadow-lg z-10",
                        mode === 'moon'
                            ? "bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-500/50"
                            : "bg-gradient-to-br from-purple-400 to-purple-600 shadow-purple-500/50"
                    )}
                    animate={{
                        x: mode === 'moon' ? 0 : (variant === 'default' && typeof window !== 'undefined' && window.innerWidth < 640 ? 28 : 32),
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 450,
                        damping: 35
                    }}
                >
                    <AnimatePresence mode="wait">
                        {mode === 'moon' ? (
                            <motion.div
                                key="moon-icon"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <Heart className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white fill-white" />
                            </motion.div>
                        ) : (
                            <motion.div
                                key="lunara-icon"
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                            >
                                <Moon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white fill-white" />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>

                {/* Background visual feedback */}
                <div className="hidden sm:flex w-full justify-between items-center px-1.5 opacity-20 group-hover:opacity-40 transition-opacity">
                    <Heart className="w-3 h-3 text-rose-300" />
                    <Moon className="w-3 h-3 text-purple-300" />
                </div>
            </button>

            {/* Lunara Mode */}
            <div className="hidden sm:flex items-center gap-2">
                <Moon
                    className={cn(
                        "w-3 h-3 transition-colors duration-500",
                        mode === 'lunara' ? "text-purple-400" : "text-white/20"
                    )}
                    fill={mode === 'lunara' ? "currentColor" : "none"}
                />
                <span
                    className={cn(
                        "text-[10px] uppercase tracking-[0.2em] font-bold transition-[color,transform] duration-500",
                        mode === 'lunara'
                            ? "text-purple-100 drop-shadow-[0_0_12px_rgba(168,85,247,0.6)] scale-110"
                            : "text-white/20 hover:text-white/40"
                    )}
                >
                    Lunara
                </span>
            </div>
        </div>
    )
}
