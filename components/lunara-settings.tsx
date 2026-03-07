'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    Save,
    Activity,
    Heart,
    Sparkles,
    RefreshCw,
    Shield
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { saveLunaraOnboarding } from '@/lib/client/auth'

interface LunaraSettingsProps {
    initialData: any
    onBack: () => void
    onSave: (newData: any) => void
}

export function LunaraSettings({ initialData, onBack, onSave }: LunaraSettingsProps) {
    const [data, setData] = useState({
        lastPeriodStart: initialData?.last_period_start ? new Date(initialData.last_period_start) : undefined,
        periodLength: initialData?.avg_period_length?.toString() || '5',
        cycleLength: initialData?.avg_cycle_length?.toString() || '28',
        regularity: initialData?.regularity || 'yes',
        contraception: initialData?.contraception || 'none',
        tryingToConceive: initialData?.trying_to_conceive ? 'yes' : 'no',
        symptoms: initialData?.typical_symptoms || [],
        trackingGoals: initialData?.tracking_goals || [],
        sharingEnabled: initialData?.sharing_enabled || false
    })

    const [saving, setSaving] = useState(false)
    const { toast } = useToast()

    const handleSave = async () => {
        setSaving(true)
        try {
            // Fix: Send date as YYYY-MM-DD string to avoid timezone shifts (e.g. IST midnight -> UTC previous day)
            const submissionData = {
                ...data,
                lastPeriodStart: data.lastPeriodStart ? format(data.lastPeriodStart, 'yyyy-MM-dd') : null
            }
            const result = await saveLunaraOnboarding(submissionData)
            if (result.success) {
                toast({
                    title: "Settings Saved ",
                    variant: "success"
                })
                onSave(data)
            } else {
                throw new Error(result.error)
            }
        } catch (error: any) {
            toast({
                title: "Save Failed",
                variant: "destructive"
            })
        } finally {
            setSaving(false)
        }
    }

    const toggleSymptom = (symptom: string) => {
        setData((prev: any) => ({
            ...prev,
            symptoms: prev.symptoms.includes(symptom)
                ? prev.symptoms.filter((s: string) => s !== symptom)
                : [...prev.symptoms, symptom]
        }))
    }

    const toggleGoal = (goal: string) => {
        setData((prev: any) => ({
            ...prev,
            trackingGoals: prev.trackingGoals.includes(goal)
                ? prev.trackingGoals.filter((g: string) => g !== goal)
                : [...prev.trackingGoals, goal]
        }))
    }

    return (
        <div className="space-y-12 pt-4 pb-32">
            {/* Header Navigation Area */}
            <div className="flex items-center justify-center">
                <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-purple-400/5 border border-purple-400/10 backdrop-blur-md">
                    <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[10px] uppercase tracking-[0.3em] font-black text-purple-200">Lunara Sync Profile</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                {/* Period Basics */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <CalendarIcon className="w-4 h-4 text-purple-400/50" />
                        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Period History</h3>
                    </div>

                    <div className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5 space-y-8">
                        <div className="space-y-3">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Last Period Start</Label>
                            <input
                                type="date"
                                value={data.lastPeriodStart ? data.lastPeriodStart.toISOString().split('T')[0] : ''}
                                onChange={(e) => {
                                    const date = e.target.value ? new Date(e.target.value) : undefined
                                    setData({ ...data, lastPeriodStart: date })
                                }}
                                max={new Date().toISOString().split('T')[0]}
                                className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm text-white outline-none focus:border-purple-400/40 transition-colors [color-scheme:dark]"
                            />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Period Duration</Label>
                            <div className="grid grid-cols-5 gap-3">
                                {['3', '4', '5', '6', '7+'].map(len => (
                                    <button
                                        key={len}
                                        onClick={() => setData({ ...data, periodLength: len })}
                                        className={cn(
                                            "h-12 rounded-2xl border transition-all text-[11px] font-black uppercase tracking-widest",
                                            data.periodLength === len
                                                ? "bg-purple-400/20 border-purple-400/40 text-purple-200"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {len}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cycle Rhythm */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <Activity className="w-4 h-4 text-purple-400/50" />
                        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Cycle Rhythm</h3>
                    </div>

                    <div className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5 space-y-8">
                        <div className="space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Regularity</Label>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Regular', val: 'yes' },
                                    { label: 'Sometimes', val: 'sometimes' },
                                    { label: 'Irregular', val: 'rarely' }
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        onClick={() => setData({ ...data, regularity: opt.val })}
                                        className={cn(
                                            "py-3.5 rounded-full border transition-all text-[10px] font-black uppercase tracking-tight",
                                            data.regularity === opt.val
                                                ? "bg-purple-400/20 border-purple-400/40 text-purple-200"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Cycle Length</Label>
                            <Select
                                value={data.cycleLength}
                                onValueChange={(val) => setData({ ...data, cycleLength: val })}
                            >
                                <SelectTrigger className="w-full h-12 bg-white/5 border border-white/10 rounded-2xl px-5 text-sm text-white outline-none focus:ring-0 focus:border-purple-400/40 transition-all">
                                    <SelectValue placeholder="Select length" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-950 border-white/10 text-white rounded-2xl">
                                    {[...Array(20)].map((_, i) => (
                                        <SelectItem key={20 + i} value={(20 + i).toString()} className="focus:bg-purple-400/20 focus:text-purple-200">
                                            {20 + i} Days
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Life Context */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <Heart className="w-4 h-4 text-purple-400/50" />
                        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Life Context</h3>
                    </div>

                    <div className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5 space-y-8">
                        <div className="space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Contraceptive Method</Label>
                            <div className="flex flex-wrap gap-3">
                                {['None', 'Pills', 'IUD', 'Implant', 'Other'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setData({ ...data, contraception: opt.toLowerCase() })}
                                        className={cn(
                                            "px-4 py-2 rounded-full border transition-all text-[10px] font-black uppercase tracking-widest",
                                            data.contraception === opt.toLowerCase()
                                                ? "bg-purple-400/20 border-purple-400/40 text-purple-200"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Trying to Conceive?</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {['Yes', 'No'].map(opt => (
                                    <button
                                        key={opt}
                                        onClick={() => setData({ ...data, tryingToConceive: opt.toLowerCase() })}
                                        className={cn(
                                            "py-3.5 rounded-full border transition-all text-[10px] font-black uppercase tracking-tight",
                                            data.tryingToConceive === opt.toLowerCase()
                                                ? "bg-purple-400/20 border-purple-400/40 text-purple-200"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {opt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Personalisation */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <Sparkles className="w-4 h-4 text-purple-400/50" />
                        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Personalisation</h3>
                    </div>

                    <div className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5 space-y-8">
                        <div className="space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Common Symptoms</Label>
                            <div className="flex flex-wrap gap-2.5">
                                {['Cramps', 'Fatigue', 'Mood swings', 'Headache', 'Bloating'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => toggleSymptom(s)}
                                        className={cn(
                                            "px-4 py-2 rounded-full border transition-all text-[10px] font-black uppercase tracking-tight",
                                            data.symptoms.includes(s)
                                                ? "bg-purple-400/20 border-purple-400/40 text-purple-200"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/30 ml-1">Tracking Focus</Label>
                            <div className="grid grid-cols-2 gap-3">
                                {['Stress', 'Sleep', 'Energy', 'Emotions'].map(g => (
                                    <button
                                        key={g}
                                        onClick={() => toggleGoal(g)}
                                        className={cn(
                                            "p-3 rounded-full border transition-all flex items-center gap-3",
                                            data.trackingGoals.includes(g)
                                                ? "bg-purple-400/20 border-purple-400/40 text-white"
                                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10 px-4"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-2.5 h-2.5 rounded-full border transition-all",
                                            data.trackingGoals.includes(g) ? "border-purple-300 bg-purple-400" : "border-white/20"
                                        )} />
                                        <span className="font-black text-[10px] uppercase tracking-widest">{g}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Privacy & Sync */}
                <div className="space-y-6">
                    <div className="flex items-center gap-3 px-1">
                        <Shield className="w-4 h-4 text-indigo-400/50" />
                        <h3 className="text-[10px] uppercase tracking-[0.3em] font-black text-white/40">Privacy & Partner Sync</h3>
                    </div>

                    <div className="p-8 rounded-3xl bg-zinc-950/40 border border-white/5 space-y-6">
                        <div className="flex items-center justify-between p-5 rounded-2xl bg-indigo-500/5 border border-indigo-500/10">
                            <div className="space-y-1">
                                <Label className="text-[11px] font-black uppercase tracking-wider text-indigo-100">Share Cycle Status</Label>
                                <p className="text-[9px] text-indigo-300/40 uppercase tracking-widest font-black font-serif italic">Real-time sync enabled</p>
                            </div>
                            <Switch
                                checked={data.sharingEnabled}
                                onCheckedChange={(checked) => setData({ ...data, sharingEnabled: checked })}
                                className="data-[state=checked]:bg-indigo-500"
                            />
                        </div>
                        <p className="text-[10px] text-white/40 italic px-2 font-serif leading-relaxed">
                            "When enabled, your partner will see your current cycle day, phase name, and tailored advice on how to support you."
                        </p>
                    </div>
                </div>
            </div>

            <div className="text-center py-6 opacity-20">
                <p className="text-[10px] italic tracking-[0.3em] uppercase font-black">Orbital encryption active</p>
            </div>

            {/* Bottom Save Button - Premium Pill */}
            <div className="flex justify-center mt-8 mb-12">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full max-w-md h-12 rounded-full bg-purple-500/90 text-white font-black uppercase tracking-[0.3em] text-[11px] shadow-[0_20px_40px_rgba(168,85,247,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 backdrop-blur-xl border border-white/20"
                >
                    {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Profile
                </button>
            </div>
        </div>
    )
}
