import { Platform, StyleSheet } from 'react-native';
import { Radius, Spacing, Typography, Colors } from '../../constants/Theme';
// Android-only app: entering/exiting layout animations crash at module-level
// Set all to undefined; useAnimatedStyle + scroll animations still work fine
export const FADE_IN = undefined;
export const FADE_IN_DOWN_1 = undefined;
export const FADE_IN_DOWN_2 = undefined;
export const FADE_IN_DOWN_3 = undefined;

// ─── Shared Tab Component Styles ──────────────────────────────────────────────
export const tab = StyleSheet.create({
    // Today & Phase Hero
    phaseHero: { alignItems: 'center', marginBottom: 26, marginTop: -12 },
    phaseTitle: { fontSize: 38, fontFamily: Typography.serifBold, marginBottom: 10, color: '#FFFFFF', letterSpacing: -0.5 }, // Ultra Brighter
    phaseDay: { fontSize: 14, fontFamily: Typography.sansBold, color: '#FFFFFF', opacity: 0.7, letterSpacing: 0.8 }, // Full White + Opacity

    // Stats Grid
    statsRow: {
        flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.lg,
        borderRadius: 24, alignItems: 'center', justifyContent: 'space-around',
    },
    stat: { alignItems: 'center', flex: 1, paddingVertical: 20 },
    statVal: { fontSize: 20, fontFamily: Typography.sansBold, color: '#FFFFFF' }, // Sharper
    statSubVal: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', marginLeft: 2 },
    statLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, textAlign: 'center', marginTop: 6 },
    statDivider: { width: 1.5, height: 30, backgroundColor: 'rgba(255,255,255,0.1)' },

    // Advice & Hormones
    adviceCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22,
        borderRadius: 28, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    adviceLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.8, marginBottom: 14 }, // Brighter & Larger
    adviceText: { fontSize: 21, fontFamily: Typography.serifItalic, color: '#FFFFFF', lineHeight: 30, borderLeftWidth: 4, paddingLeft: 18, marginBottom: 22 }, // Thicker & Sharper
    hormoneBox: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16 }, // Punchier
    hormoneLabel: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.6)', letterSpacing: 1.8, marginBottom: 10 },
    hormoneText: { fontSize: 14, fontFamily: Typography.sansBold, color: '#FFFFFF', lineHeight: 22 }, // Higher contrast

    // PMS & Status
    pmsBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: Spacing.md, marginBottom: 16, paddingVertical: 10, paddingHorizontal: 16, borderRadius: Radius.lg, backgroundColor: 'rgba(251,191,36,0.1)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' },
    pmsText: { fontSize: 11, fontFamily: Typography.sansBold, color: '#fbbf24', letterSpacing: 0.3 },

    // Mini stats (Cycle tab)
    statsRowTiny: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
    statTiny: { flex: 1, alignItems: 'center' },
    statValTiny: { fontSize: 16, fontFamily: Typography.sansBold, color: 'white' },
    statLabelTiny: { fontSize: 7, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, marginTop: 4 },
    statDividerTiny: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.06)' },

    // Empty states
    empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 40, gap: 14 },
    emptyTitle: { fontSize: 20, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.5)', textAlign: 'center' },
    emptySub: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.3)', textAlign: 'center', lineHeight: 20 },
    emptyBtn: {
        marginTop: 10,
        backgroundColor: Colors.dark?.rose?.[500] || '#e11d48', // Fallback to avoid crash
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 100,
    },
    emptyBtnText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'white',
    },

    // Intimacy & AI
    aiBadge: { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
    aiBadgeText: { fontSize: 12, fontFamily: Typography.sansBold, color: '#d8b4fe', letterSpacing: 1 },

    // Cycle Specific
    phaseGuide: {
        marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md, padding: 20, borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)'
    },
    predDate: { fontSize: 28, fontFamily: Typography.sansBold, color: 'white', marginBottom: 8 },
    phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    phaseDot: { width: 8, height: 8, borderRadius: 4 },
    phaseRowName: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.88)', flex: 1 },
    phaseRowDays: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.6)' },
    irregWarn: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' },
    irregText: { fontSize: 12, fontFamily: Typography.sans, color: '#fbbf24', lineHeight: 18 },
    predCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 22, borderRadius: 24, alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)'
    },

    // Body & Libido
    bodyCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22,
        borderRadius: 28, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    bodyCardLabel: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5, marginBottom: 6 },
    bodyCardTitle: { fontSize: 20, fontFamily: Typography.serifBold, color: 'white', marginBottom: 20 },
    phaseNoteText: { fontSize: 12, fontFamily: Typography.serifItalic, lineHeight: 20 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
    chipText: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.3 },
    libidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    libidoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hotBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: '#ef4444' },
    hotBadgeText: { fontSize: 12, fontFamily: Typography.sansBold, color: 'white' },
    meterContainer: { alignItems: 'center', marginBottom: 24, marginTop: -10 },
    meterSub: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.55)', letterSpacing: 1.5, marginTop: -6 },
    sliderWrapper: { marginTop: 10 },
    phaseNote: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    // Grid-based Micro Actions
    microActionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
    microActionCard: { width: '48%', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    microActionEmoji: { fontSize: 24, marginBottom: 8 },
    microActionTitle: { fontSize: 13, fontFamily: Typography.sansBold, color: '#FFFFFF', marginBottom: 4 },
    microActionDesc: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.6)', lineHeight: 16 },

    // Visual Recommendation Badge
    recBadge: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, borderWidth: 1 },
    recIconContainer: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
    recContent: { flex: 1 },
    recTitle: { fontSize: 11, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 2 },

    // Reintegrated Hero Data
    dataRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
    confidenceBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 100, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
    confidenceText: { fontSize: 10, fontFamily: Typography.sansBold, letterSpacing: 1 },
    miniLogBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(251,113,133,0.1)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.25)' },
    miniLogText: { fontSize: 10, fontFamily: Typography.sansBold, color: '#fb7185', letterSpacing: 0.8 },

    // Nutrition & Rituals
    foodRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16 },
    foodEmoji: { fontSize: 28 },
    foodName: { fontSize: 14, fontFamily: Typography.sansBold, color: '#FFFFFF', marginBottom: 2 },
    foodBenefit: { fontSize: 12, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },

    // Mini items for Today & Lists
    miniChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
    miniChipText: { fontSize: 10, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', letterSpacing: 0.5, textTransform: 'uppercase' },
    miniAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 100, backgroundColor: 'rgba(251,113,133,0.1)', borderWidth: 1, borderColor: 'rgba(251,113,133,0.25)' },
    miniAddBtnText: { fontSize: 10, fontFamily: Typography.sansBold, color: '#fb7185', letterSpacing: 0.8 },
});
