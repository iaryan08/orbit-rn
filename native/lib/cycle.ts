// ─── Lunara Cycle Intelligence Engine ────────────────────────────────────────
// Production-grade cycle prediction with weighted averaging, confidence scoring,
// irregularity detection, and hormonal phase modeling.

export function getTodayIST(): string {
    const now = new Date();
    const offset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + offset);
    return ist.toISOString().split('T')[0];
}

export function getCycleDay(lastPeriodStart: string, avgCycleLength = 28): number {
    if (!lastPeriodStart) return 1;
    const last = new Date(lastPeriodStart);
    const today = new Date(getTodayIST());
    const diffMs = today.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return (diffDays % avgCycleLength) + 1;
}

export interface CyclePrediction {
    predictedDate: string;
    avgCycleLength: number;
    avgPeriodLength: number;
    confidence: 'Learning' | 'Fair' | 'High';
    daysUntil: number;
    ovulationDay: number;
    fertilityWindow: number[];
    currentPregnancyChance: 'Low' | 'Medium' | 'High' | 'Peak'; chancePercentage: number;
    chanceColor: string;
    stdDev: number;
    isIrregular: boolean;
    irregularityReason?: string;
}

export interface PhaseWindow {
    name: 'Menstrual' | 'Follicular' | 'Ovulatory' | 'Luteal';
    startDay: number;
    endDay: number;
    color: string;
    gradient: [string, string];
    advice: string;
    partnerAdvice: string;
    energy: 'Low' | 'Building' | 'Peak' | 'Declining';
    hormones: string;
}

// Weighted average: recent cycles count more
function weightedAverage(gaps: number[]): number {
    const n = gaps.length;
    if (n === 0) return 28;
    let totalWeight = 0;
    let weightedSum = 0;
    for (let i = 0; i < n; i++) {
        const weight = n - i; // most recent = highest weight
        weightedSum += gaps[i] * weight;
        totalWeight += weight;
    }
    return Math.round(weightedSum / totalWeight);
}

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

export function predictNextPeriod(history: string[], defaultLength = 28, avgPeriodLength = 5): CyclePrediction {
    if (!history || history.length < 1) {
        return {
            predictedDate: '—',
            avgCycleLength: defaultLength,
            avgPeriodLength,
            confidence: 'Learning',
            daysUntil: 0,
            ovulationDay: defaultLength - 14,
            fertilityWindow: [],
            currentPregnancyChance: 'Low',
            chancePercentage: 0,
            chanceColor: '#22c55e',
            stdDev: 0,
            isIrregular: false,
        };
    }

    const sorted = [...history].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const latest = new Date(sorted[0]);

    let avgLength = defaultLength;
    let confidence: 'Learning' | 'Fair' | 'High' = 'Learning';
    let sd = 0;
    let isIrregular = false;
    let irregularityReason: string | undefined;

    if (sorted.length >= 2) {
        const gaps: number[] = [];
        for (let i = 0; i < Math.min(sorted.length - 1, 12); i++) {
            const gap = (new Date(sorted[i]).getTime() - new Date(sorted[i + 1]).getTime()) / (1000 * 60 * 60 * 24);
            if (gap > 15 && gap < 50) gaps.push(gap); // valid cycle range
        }

        if (gaps.length > 0) {
            avgLength = weightedAverage(gaps);
            sd = stdDev(gaps);
            confidence = gaps.length >= 6 && sd <= 2 ? 'High'
                : gaps.length >= 3 && sd <= 4 ? 'Fair'
                    : 'Learning';

            if (sd > 7) {
                isIrregular = true;
                irregularityReason = 'Your cycles vary significantly. Stress, nutrition, or hormonal changes may be a factor.';
            } else if (gaps.some(g => g < 21 || g > 35)) {
                isIrregular = true;
                irregularityReason = 'One or more of your recent cycles was outside the typical 21–35 day range.';
            }
        }
    }

    const predicted = new Date(latest.getTime() + avgLength * 24 * 60 * 60 * 1000);
    const today = new Date(getTodayIST());
    const daysUntil = Math.ceil((predicted.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    const ovulationDay = Math.max(1, avgLength - 14);
    const fertilityWindow: number[] = [];
    for (let i = ovulationDay - 5; i <= ovulationDay + 1; i++) {
        if (i > 0) fertilityWindow.push(i);
    }

    const currentDay = getCycleDay(sorted[0], avgLength);
    let currentPregnancyChance: 'Low' | 'Medium' | 'High' | 'Peak' = 'Low';
    let chancePercentage = 0;
    let chanceColor = '#22c55e'; // Green

    if (currentDay === ovulationDay) {
        currentPregnancyChance = 'Peak';
        chancePercentage = 30;
        chanceColor = '#ef4444'; // Red
    } else if (Math.abs(currentDay - ovulationDay) <= 1) {
        currentPregnancyChance = 'High';
        chancePercentage = 25;
        chanceColor = '#f97316'; // Orange
    } else if (fertilityWindow.includes(currentDay)) {
        currentPregnancyChance = 'Medium';
        chancePercentage = 15;
        chanceColor = '#fbbf24'; // Yellow
    } else {
        chancePercentage = currentDay <= avgPeriodLength ? 1 : 3;
    }

    return {
        predictedDate: predicted.toISOString().split('T')[0],
        avgCycleLength: avgLength,
        avgPeriodLength,
        confidence,
        daysUntil,
        ovulationDay,
        fertilityWindow,
        currentPregnancyChance,
        chancePercentage,
        chanceColor,
        stdDev: Math.round(sd * 10) / 10,
        isIrregular,
        irregularityReason,
    };
}

export function getPhaseWindows(avgCycleLength: number, avgPeriodLength: number): PhaseWindow[] {
    const ovulationDay = Math.max(1, avgCycleLength - 14);
    const follicularEnd = ovulationDay - 1;
    const lutealStart = ovulationDay + 2;

    return [
        {
            name: 'Menstrual',
            startDay: 1,
            endDay: avgPeriodLength,
            color: '#fb7185',
            gradient: ['#be123c', '#4c0519'],
            advice: "Honor your body's need for rest.Warmth, hydration, and gentle movement are your allies.",
            partnerAdvice: "She needs warmth, her favorite comfort food, and quiet presence. Now is not the time for plans.",
            energy: 'Low',
            hormones: 'Estrogen and progesterone are at their lowest. The uterine lining sheds.',
        },
        {
            name: 'Follicular',
            startDay: avgPeriodLength + 1,
            endDay: follicularEnd,
            color: '#34d399',
            gradient: ['#0d9488', '#064e3b'],
            advice: 'Estrogen rises. You have more energy, clarity, and a sharper mind — use it.',
            partnerAdvice: 'This is her renaissance phase. She\'s open to new experiences, creative dates, and adventure.',
            energy: 'Building',
            hormones: 'Rising estrogen drives follicle development. Mood, libido and cognition improve.',
        },
        {
            name: 'Ovulatory',
            startDay: ovulationDay - 1,
            endDay: ovulationDay + 1,
            color: '#fbbf24',
            gradient: ['#d97706', '#78350f'],
            advice: 'You\'re at your most magnetic. Peak confidence, social energy, and libido.',
            partnerAdvice: 'She\'s at her most outgoing and confident. A romantic evening or social event will be perfect timing.',
            energy: 'Peak',
            hormones: 'LH surge triggers ovulation. Estrogen peaks. Testosterone briefly spikes.',
        },
        {
            name: 'Luteal',
            startDay: lutealStart,
            endDay: avgCycleLength,
            color: '#818cf8',
            gradient: ['#4338ca', '#1e1b4b'],
            advice: 'Progesterone rises. Your body prepares. Rest is not weakness — it\'s wisdom.',
            partnerAdvice: 'Extra patience goes a long way. She may need space, comfort, and to be heard without it being fixed.',
            energy: 'Declining',
            hormones: 'Progesterone dominates. If no pregnancy occurs, levels drop, triggering the next cycle.',
        },
    ];
}

export function getPhaseForDay(day: number, avgCycleLength: number, avgPeriodLength: number): PhaseWindow {
    const phases = getPhaseWindows(avgCycleLength, avgPeriodLength);
    return phases.find(p => day >= p.startDay && day <= p.endDay)
        || phases[phases.length - 1];
}

export function getDailyInsightLocal(phase: string, cycleDay: number): {
    insight: string;
    recommendation: string;
    hormoneContext: string;
} {
    const insights: Record<string, { insight: string; recommendation: string; hormoneContext: string }[]> = {
        Menstrual: [
            { insight: 'Your body is completing a remarkable biological cycle. This shedding is renewal, not weakness.', recommendation: 'Apply warmth to your lower abdomen, hydrate with warm fluids, and let yourself rest without guilt.', hormoneContext: 'Estrogen and progesterone have dropped, signaling the lining to release.' },
            { insight: 'The first two days carry the heaviest load. Be patient with your energy levels — they will rise.', recommendation: 'Prioritize iron-rich foods today: lentils, spinach, or dark chocolate.', hormoneContext: 'Prostaglandins cause cramping as the uterus contracts. This is normal physiology.' },
        ],
        Follicular: [
            { insight: 'Estrogen is climbing. Your brain is sharper; your mood brighter. This is one of your most powerful windows.', recommendation: 'Tackle your most demanding creative or intellectual work while this window is open.', hormoneContext: 'Rising estrogen improves serotonin activity, boosting focus and emotional resilience.' },
            { insight: 'You are in a rebuilding phase — physically, emotionally, cognitively. New starts feel natural now.', recommendation: 'Begin a new habit, project, or conversation you\'ve been postponing.', hormoneContext: 'FSH drives follicle maturation; estrogen thickens the uterine lining in preparation.' },
        ],
        Ovulatory: [
            { insight: 'You are at your biological and social peak. Your voice sounds more attractive, your energy is magnetic.', recommendation: 'Schedule important conversations, presentations, or dates within this 3-day window.', hormoneContext: 'An LH surge has triggered ovulation. Estrogen peaks and testosterone briefly elevates.' },
            { insight: 'This window closes within 24 hours of ovulation. Your fertility is at its absolute maximum right now.', recommendation: 'Tune into your body — ovulation may feel like a light twinge on one side.', hormoneContext: 'The released egg is viable for 12–24 hours. Sperm can survive up to 5 days.' },
        ],
        Luteal: [
            { insight: 'Progesterone creates a calm, inward-focused state. Your body is guarding against uncertainty.', recommendation: 'Reduce stimulants, prioritize sleep, and add magnesium-rich foods: nuts, seeds, dark greens.', hormoneContext: 'The corpus luteum secretes progesterone, which has a sedating effect on the nervous system.' },
            { insight: 'Cravings for carbs and sweetness are hormonal, not a character flaw. Your body needs more fuel now.', recommendation: 'Choose complex carbs over refined sugar — sweet potato, oats, bananas keep levels stable.', hormoneContext: 'Progesterone increases insulin sensitivity, causing energy dips and carbohydrate cravings.' },
        ],
    };

    const phaseInsights = insights[phase] || insights['Follicular'];
    return phaseInsights[cycleDay % phaseInsights.length];
}

export const VIBE_COLORS: Record<string, string> = {
    'Lavender': 'rgba(168, 85, 247, 0.15)',
    'Soft Teal': 'rgba(45, 212, 191, 0.12)',
    'Amber Glow': 'rgba(251, 191, 36, 0.15)',
    'Dusty Rose': 'rgba(251, 113, 133, 0.12)',
    'Midnight Blue': 'rgba(30, 64, 175, 0.15)'
};
