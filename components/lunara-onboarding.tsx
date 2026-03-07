'use client'

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
    Calendar as CalendarIcon,
    ChevronRight,
    ChevronLeft,
    Sparkles,
    Moon,
    Activity,
    Settings,
    Heart,
    Info,
    Check
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn, normalizeDate } from '@/lib/utils'
import { format } from 'date-fns'

interface OnboardingData {
    lastPeriodStart: Date | undefined
    periodLength: string
    cycleLength: string
    regularity: string
    contraception: string
    tryingToConceive: string
    symptoms: string[]
    trackingGoals: string[]
}

export function LunaraOnboarding({ onComplete }: { onComplete: (data: OnboardingData) => void }) {
    const [step, setStep] = useState(1)
    const [data, setData] = useState<OnboardingData>({
        lastPeriodStart: undefined,
        periodLength: '5',
        cycleLength: '28',
        regularity: 'yes',
        contraception: 'none',
        tryingToConceive: 'no',
        symptoms: [],
        trackingGoals: []
    })

    const totalSteps = 4

    const handleNext = () => {
        if (step < totalSteps) setStep(step + 1)
        else onComplete(data)
    }

    const handleBack = () => {
        if (step > 1) setStep(step - 1)
    }

    const toggleSymptom = (symptom: string) => {
        setData(prev => ({
            ...prev,
            symptoms: prev.symptoms.includes(symptom)
                ? prev.symptoms.filter(s => s !== symptom)
                : [...prev.symptoms, symptom]
        }))
    }

    const toggleGoal = (goal: string) => {
        setData(prev => ({
            ...prev,
            trackingGoals: prev.trackingGoals.includes(goal)
                ? prev.trackingGoals.filter(g => g !== goal)
                : [...prev.trackingGoals, goal]
        }))
    }

    const steps = [
        { title: 'Period Basics', icon: CalendarIcon },
        { title: 'Cycle Rhythm', icon: Activity },
        { title: 'Life Context', icon: Heart },
        { title: 'Personalise', icon: Sparkles }
    ]

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] max-w-2xl mx-auto px-4 py-12">
            {/* Progress Header */}
            <div className="w-full mb-12">
                <div className="flex justify-between items-center mb-4">
                    {steps.map((s, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 relative">
                            <div
                                className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-500 z-10",
                                    step > i + 1 ? "bg-purple-400 border-purple-400 text-white" :
                                        step === i + 1 ? "bg-purple-950/50 border-purple-400 text-purple-200 shadow-[0_0_15px_rgba(168,85,247,0.4)]" :
                                            "bg-zinc-900 border-zinc-800 text-zinc-600"
                                )}
                            >
                                {step > i + 1 ? <Check className="w-5 h-5" /> : <s.icon className="w-4 h-4" />}
                            </div>
                            <span className={cn(
                                "text-[10px] uppercase tracking-widest font-bold mt-2",
                                step === i + 1 ? "text-purple-300" : "text-zinc-600"
                            )}>
                                {s.title}
                            </span>
                            {i < steps.length - 1 && (
                                <div className={cn(
                                    "absolute top-5 left-[50%] w-full h-[2px] -z-0",
                                    step > i + 1 ? "bg-purple-400" : "bg-zinc-800"
                                )} />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <Card className="w-full bg-zinc-950/50 border-zinc-800/50 backdrop-blur-sm p-8 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-purple-400/50 to-transparent" />

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.3 }}
                        className="space-y-8"
                    >
                        {/* Step 1: Basics */}
                        {step === 1 && (
                            <div className="space-y-6">
                                <div>
                                    <h2 className="text-2xl font-serif text-white mb-2">When did your last period start?</h2>
                                    <p className="text-sm text-zinc-400">This helps us estimate your current cycle.</p>
                                </div>

                                <Input
                                    type="date"
                                    value={data.lastPeriodStart ? format(normalizeDate(data.lastPeriodStart), "yyyy-MM-dd") : ""}
                                    onChange={(e) => {
                                        const date = e.target.value ? normalizeDate(e.target.value) : undefined
                                        setData({ ...data, lastPeriodStart: date })
                                    }}
                                    max={format(normalizeDate(new Date()), "yyyy-MM-dd")}
                                    className="w-full h-12 bg-zinc-900/50 border-zinc-800 text-white rounded-xl px-4 [color-scheme:dark]"
                                />

                                <div className="space-y-4">
                                    <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">How long does it usually last?</Label>
                                    <div className="grid grid-cols-5 gap-2">
                                        {['3', '4', '5', '6', '7+'].map(len => (
                                            <button
                                                key={len}
                                                onClick={() => setData({ ...data, periodLength: len })}
                                                className={cn(
                                                    "h-12 rounded-xl border-2 transition-all font-bold",
                                                    data.periodLength === len
                                                        ? "bg-purple-400 border-purple-400 text-white"
                                                        : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-800"
                                                )}
                                            >
                                                {len}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">Average cycle length?</Label>
                                    <RadioGroup
                                        value={data.cycleLength}
                                        onValueChange={(val) => setData({ ...data, cycleLength: val })}
                                        className="grid grid-cols-2 gap-3"
                                    >
                                        {[
                                            { label: '21-23 days', val: '22' },
                                            { label: '24-26 days', val: '25' },
                                            { label: '27-29 days', val: '28' },
                                            { label: '30-32 days', val: '31' },
                                            { label: '33+ days', val: '35' },
                                            { label: 'Not sure', val: '28' }
                                        ].map(opt => (
                                            <div key={opt.val + opt.label} className="relative">
                                                <RadioGroupItem value={opt.val} id={opt.label} className="peer sr-only" />
                                                <Label
                                                    htmlFor={opt.label}
                                                    className={cn(
                                                        "flex items-center justify-center p-4 rounded-xl border-2 cursor-pointer transition-all hover:bg-zinc-900 peer-data-[state=checked]:bg-purple-950/30 peer-data-[state=checked]:border-purple-400 peer-data-[state=checked]:text-purple-100",
                                                        "bg-zinc-950 border-zinc-800 text-zinc-400 font-medium"
                                                    )}
                                                >
                                                    {opt.label}
                                                </Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                </div>
                            </div>
                        )}

                        {/* Step 2: Regularity */}
                        {step === 2 && (
                            <div className="space-y-8">
                                <div>
                                    <h2 className="text-2xl font-serif text-white mb-2">Are your periods usually regular?</h2>
                                    <p className="text-sm text-zinc-400">Regularity helps in identifying prediction confidence.</p>
                                </div>

                                <div className="space-y-3">
                                    {[
                                        { label: 'Yes', desc: 'Always predictable', val: 'yes' },
                                        { label: 'Sometimes', desc: 'Occasional variance', val: 'sometimes' },
                                        { label: 'Not really', desc: 'Highly unpredictable', val: 'rarely' }
                                    ].map(opt => (
                                        <button
                                            key={opt.val}
                                            onClick={() => setData({ ...data, regularity: opt.val })}
                                            className={cn(
                                                "w-full p-6 rounded-2xl border-2 text-left transition-all",
                                                data.regularity === opt.val
                                                    ? "bg-purple-950/40 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                                                    : "bg-zinc-900/50 border-zinc-800 hover:border-zinc-700"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <p className={cn("font-bold text-lg", data.regularity === opt.val ? "text-white" : "text-zinc-300")}>{opt.label}</p>
                                                    <p className="text-sm text-zinc-500">{opt.desc}</p>
                                                </div>
                                                {data.regularity === opt.val && <Check className="w-5 h-5 text-purple-400" />}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Step 3: Context */}
                        {step === 3 && (
                            <div className="space-y-8">
                                <div>
                                    <h2 className="text-2xl font-serif text-white mb-2">Life Context</h2>
                                    <p className="text-sm text-zinc-400">This data is private and only used to adjust your feed tone.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">Birth Control</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {['None', 'Pills', 'IUD', 'Implant', 'Other'].map(opt => (
                                                <button
                                                    key={opt}
                                                    onClick={() => setData({ ...data, contraception: opt.toLowerCase() })}
                                                    className={cn(
                                                        "px-6 py-3 rounded-full border-2 transition-all font-medium text-sm",
                                                        data.contraception === opt.toLowerCase()
                                                            ? "bg-purple-400 border-purple-400 text-white"
                                                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                                    )}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">Trying to Conceive?</Label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {['Yes', 'No', 'Not sure'].map(opt => (
                                                <button
                                                    key={opt}
                                                    onClick={() => setData({ ...data, tryingToConceive: opt.toLowerCase() })}
                                                    className={cn(
                                                        "py-4 rounded-xl border-2 transition-all font-bold text-sm",
                                                        data.tryingToConceive === opt.toLowerCase()
                                                            ? "bg-purple-400 border-purple-400 text-white"
                                                            : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800"
                                                    )}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Personalisation */}
                        {step === 4 && (
                            <div className="space-y-8">
                                <div>
                                    <h2 className="text-2xl font-serif text-white mb-2">Personalise Your Feed</h2>
                                    <p className="text-sm text-zinc-400">Select what you'd like to track or common symptoms.</p>
                                </div>

                                <div className="space-y-6">
                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">Common Symptoms</Label>
                                        <div className="flex flex-wrap gap-2">
                                            {['Cramps', 'Fatigue', 'Mood swings', 'Headache', 'Bloating'].map(s => (
                                                <button
                                                    key={s}
                                                    onClick={() => toggleSymptom(s)}
                                                    className={cn(
                                                        "px-4 py-2 rounded-lg border-2 transition-all text-xs font-bold uppercase tracking-wider",
                                                        data.symptoms.includes(s)
                                                            ? "bg-purple-400/20 border-purple-400 text-purple-100"
                                                            : "bg-zinc-900 border-zinc-800 text-zinc-500"
                                                    )}
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4">
                                        <Label className="text-sm font-bold uppercase tracking-widest text-zinc-500">I'd like to track...</Label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {['Stress', 'Sleep', 'Energy', 'Emotions'].map(g => (
                                                <button
                                                    key={g}
                                                    onClick={() => toggleGoal(g)}
                                                    className={cn(
                                                        "p-4 rounded-xl border-2 transition-all text-left flex items-center gap-3",
                                                        data.trackingGoals.includes(g)
                                                            ? "bg-purple-950/30 border-purple-400 text-white"
                                                            : "bg-zinc-900/50 border-zinc-800 text-zinc-500"
                                                    )}
                                                >
                                                    <div className={cn(
                                                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                                                        data.trackingGoals.includes(g) ? "border-purple-300 bg-purple-400" : "border-zinc-700"
                                                    )}>
                                                        {data.trackingGoals.includes(g) && <Check className="w-2.5 h-2.5 text-white" />}
                                                    </div>
                                                    <span className="font-bold text-sm tracking-wide">{g}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-between mt-12 pt-6 border-t border-zinc-800">
                    <Button
                        variant="ghost"
                        onClick={handleBack}
                        className={cn("text-zinc-400 hover:text-white px-0", step === 1 && "invisible")}
                    >
                        <ChevronLeft className="w-4 h-4 mr-2" />
                        Back
                    </Button>

                    <Button
                        onClick={handleNext}
                        disabled={step === 1 && !data.lastPeriodStart}
                        className="bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-bold px-8 py-6 rounded-2xl shadow-xl shadow-purple-500/20"
                    >
                        {step === totalSteps ? 'Finish Setup' : 'Next Step'}
                        <ChevronRight className="w-4 h-4 ml-2" />
                    </Button>
                </div>
            </Card>

            <div className="mt-6 flex items-center gap-2 text-zinc-600 text-xs">
                <Info className="w-3 h-3" />
                All health data is encrypted and remains private to you by default.
            </div>
        </div>
    )
}
