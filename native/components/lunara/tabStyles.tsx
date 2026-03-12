import { Platform, StyleSheet } from 'react-native';
import { Radius, Spacing, Typography } from '../../constants/Theme';
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

    // Intimacy & AI
    aiBadge: { backgroundColor: 'rgba(168,85,247,0.15)', borderRadius: 100, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: 'rgba(168,85,247,0.3)' },
    aiBadgeText: { fontSize: 8, fontFamily: Typography.sansBold, color: '#d8b4fe', letterSpacing: 1 },

    // Cycle Specific
    phaseGuide: {
        marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md, padding: 20, borderRadius: 24,
        backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)'
    },
    phaseGuideLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 16 },
    phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    phaseDot: { width: 8, height: 8, borderRadius: 4 },
    phaseRowName: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', flex: 1 },
    phaseRowDays: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)' },
    irregWarn: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' },
    irregText: { fontSize: 12, fontFamily: Typography.sans, color: '#fbbf24', lineHeight: 18 },
    predCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 22, borderRadius: 24, alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.85)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)'
    },
    predLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 10 },
    predDate: { fontSize: 28, fontFamily: Typography.sansBold, color: 'white', marginBottom: 8 },
    predSub: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },

    // Body & Libido
    bodyCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22,
        borderRadius: 28, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(0,0,0,0.85)',
    },
    bodyCardLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 6 },
    bodyCardTitle: { fontSize: 20, fontFamily: Typography.serifItalic, color: 'white', marginBottom: 20 },
    chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 100, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.03)' },
    chipText: { fontSize: 12, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.45)', letterSpacing: 0.3 },
    libidoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    libidoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    hotBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: '#ef4444' },
    hotBadgeText: { fontSize: 8, fontFamily: Typography.sansBold, color: 'white' },
    meterContainer: { alignItems: 'center', marginBottom: 24, marginTop: -10 },
    meterSub: { fontSize: 9, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 2, marginTop: -6 },
    sliderWrapper: { marginTop: 10 },
    phaseNote: { marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' },
    phaseNoteText: { fontSize: 12, fontFamily: Typography.serifItalic, lineHeight: 20 },
});
