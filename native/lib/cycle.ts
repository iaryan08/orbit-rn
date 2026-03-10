export function getTodayIST(): string {
    const now = new Date();
    // Adjust to IST (UTC+5:30)
    const offset = 5.5 * 60 * 60 * 1000;
    const ist = new Date(now.getTime() + offset);
    return ist.toISOString().split('T')[0]; // YYYY-MM-DD
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
    confidence: 'Learning' | 'Fair' | 'High';
    daysUntil: number;
    ovulationDay: number;
    fertilityWindow: number[]; // Array of cycle days
    currentPregnancyChance: 'Low' | 'Medium' | 'High' | 'Peak';
}

export function predictNextPeriod(history: string[], defaultLength = 28): CyclePrediction {
    if (!history || history.length < 1) {
        return {
            predictedDate: '—',
            avgCycleLength: defaultLength,
            confidence: 'Learning',
            daysUntil: 0,
            ovulationDay: 14,
            fertilityWindow: [10, 11, 12, 13, 14, 15],
            currentPregnancyChance: 'Low'
        };
    }

    // Sort history (most recent first)
    const sorted = [...history].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const latest = new Date(sorted[0]);

    let avgLength = defaultLength;
    let confidence: 'Learning' | 'Fair' | 'High' = 'Learning';

    if (sorted.length >= 2) {
        let totalGap = 0;
        let gaps = 0;
        for (let i = 0; i < Math.min(sorted.length - 1, 6); i++) {
            const start = new Date(sorted[i]);
            const prev = new Date(sorted[i + 1]);
            const gap = (start.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
            if (gap > 18 && gap < 45) { // Sanity check for natural cycle variation
                totalGap += gap;
                gaps++;
            }
        }
        if (gaps > 0) {
            avgLength = Math.round(totalGap / gaps);
            confidence = gaps >= 4 ? 'High' : (gaps >= 2 ? 'Fair' : 'Learning');
        }
    }

    const predicted = new Date(latest.getTime() + avgLength * 24 * 60 * 60 * 1000);
    const today = new Date(getTodayIST());
    const daysUntil = Math.ceil((predicted.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Ovulation is typically 14 days BEFORE the next period
    const ovulationDay = Math.max(1, avgLength - 14);

    // Fertility window (usually 5 days before ovulation up to 1 day after)
    const fertilityWindow = [];
    for (let i = ovulationDay - 5; i <= ovulationDay + 1; i++) {
        if (i > 0) fertilityWindow.push(i);
    }

    // Pregnancy Chance Logic
    const currentDay = getCycleDay(sorted[0], avgLength);
    let currentPregnancyChance: 'Low' | 'Medium' | 'High' | 'Peak' = 'Low';

    if (currentDay === ovulationDay) {
        currentPregnancyChance = 'Peak';
    } else if (Math.abs(currentDay - ovulationDay) <= 2) {
        currentPregnancyChance = 'High';
    } else if (fertilityWindow.includes(currentDay)) {
        currentPregnancyChance = 'Medium';
    }

    return {
        predictedDate: predicted.toISOString().split('T')[0],
        avgCycleLength: avgLength,
        confidence,
        daysUntil,
        ovulationDay,
        fertilityWindow,
        currentPregnancyChance
    };
}

export const VIBE_COLORS: Record<string, string> = {
    'Lavender': 'rgba(168, 85, 247, 0.15)', // Menstrual
    'Soft Teal': 'rgba(45, 212, 191, 0.12)', // Follicular
    'Amber Glow': 'rgba(251, 191, 36, 0.15)', // Ovulation
    'Dusty Rose': 'rgba(251, 113, 133, 0.12)', // Luteal
    'Midnight Blue': 'rgba(30, 64, 175, 0.15)'
};
