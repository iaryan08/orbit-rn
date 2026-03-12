import { StyleSheet } from 'react-native';
import { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Radius, Spacing, Typography } from '../../constants/Theme';

// ─── Shared Animation Constants ───────────────────────────────────────────────
export const FADE_IN = FadeIn.duration(280);
export const FADE_IN_DOWN_1 = FadeInDown.duration(380).delay(150);
export const FADE_IN_DOWN_2 = FadeInDown.duration(380).delay(250);
export const FADE_IN_DOWN_3 = FadeInDown.duration(380).delay(320);

// ─── Shared Tab Component Styles ──────────────────────────────────────────────
export const tab = StyleSheet.create({
    // Today & Phase Hero
    phaseHero: { alignItems: 'center', marginBottom: 24, marginTop: -10 },
    phaseTitle: { fontSize: 32, fontFamily: Typography.serifBold, marginBottom: 6 },
    phaseDay: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5 },

    // Stats Grid
    statsRow: {
        flexDirection: 'row', marginHorizontal: Spacing.md, marginBottom: Spacing.lg,
        padding: 20, borderRadius: Radius.xl, alignItems: 'center', justifyContent: 'space-around',
    },
    stat: { alignItems: 'center', flex: 1 },
    statVal: { fontSize: 18, fontFamily: Typography.sansBold, color: 'white' },
    statSubVal: { fontSize: 9, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.4)', marginLeft: 2 },
    statLabel: { fontSize: 7, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.2, textAlign: 'center', marginTop: 4 },
    statDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.06)' },

    // Advice & Hormones
    adviceCard: {
        marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22,
        borderRadius: Radius.xxl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    },
    adviceLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 12 },
    adviceText: { fontSize: 18, fontFamily: Typography.serifItalic, color: 'rgba(255,255,255,0.85)', lineHeight: 28, borderLeftWidth: 2, paddingLeft: 14, marginBottom: 20 },
    hormoneBox: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: Radius.lg, padding: 14 },
    hormoneLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 8 },
    hormoneText: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', lineHeight: 20 },

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
    phaseGuide: { marginHorizontal: Spacing.md, marginTop: Spacing.md, marginBottom: Spacing.md, padding: 20, borderRadius: Radius.xl },
    phaseGuideLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 16 },
    phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
    phaseDot: { width: 8, height: 8, borderRadius: 4 },
    phaseRowName: { fontSize: 13, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', flex: 1 },
    phaseRowDays: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)' },
    irregWarn: { backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: Radius.lg, padding: 12, marginTop: 12, borderWidth: 1, borderColor: 'rgba(251,191,36,0.2)' },
    irregText: { fontSize: 12, fontFamily: Typography.sans, color: '#fbbf24', lineHeight: 18 },
    predCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, padding: 22, borderRadius: Radius.xl, alignItems: 'center' },
    predLabel: { fontSize: 8, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.3)', letterSpacing: 1.5, marginBottom: 10 },
    predDate: { fontSize: 28, fontFamily: Typography.sansBold, color: 'white', marginBottom: 8 },
    predSub: { fontSize: 11, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.35)', textAlign: 'center' },

    // Body & Libido
    bodyCard: { marginHorizontal: Spacing.md, marginBottom: Spacing.lg, padding: 22, borderRadius: Radius.xxl, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
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
