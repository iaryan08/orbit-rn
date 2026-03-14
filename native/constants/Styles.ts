import { StyleSheet } from 'react-native';
import { Colors, Spacing, Typography, TextTones } from './Theme';

/**
 * Global Design System Styles
 * Use these to maintain consistency across the entire application.
 * ORBIT IS NOT RANDOM APP IT'S PROFESSIONAL.
 */
export const GlobalStyles = StyleSheet.create({
    // Standardized screen header container
    standardHeader: {
        paddingTop: 12,
        paddingBottom: 36,
        paddingHorizontal: Spacing.md, // Aligned with Lunara (reduced from xl)
    },

    // Primary title (The "Poetic Voice")
    standardTitle: {
        fontSize: 38,
        fontFamily: Typography.display, // BodoniModa_700Bold for structural strength
        color: TextTones.primary,
        letterSpacing: -1,
        lineHeight: 44,
        marginBottom: 6,
        textAlign: 'left',
    },

    // Sub-header tags (The "Technical" voice)
    standardSubtitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold, // Outfit for sharp clarity
        color: TextTones.muted,
        letterSpacing: 1.5, // Reduced from 4 for "natural flow"
        lineHeight: 16,
        textTransform: 'uppercase',
        textAlign: 'left',
    },

    // Centered layout variants for hero moments
    centeredHeader: {
        paddingTop: 48,
        paddingBottom: Spacing.xxl,
        paddingHorizontal: Spacing.lg,
        alignItems: 'center',
    },
    centeredTitle: {
        fontSize: 52,
        fontFamily: Typography.serifItalic,
        color: TextTones.primary,
        letterSpacing: -1,
        lineHeight: 60,
        marginBottom: 8,
        textAlign: 'center',
    },
    centeredSubtitle: {
        fontSize: 11,
        fontFamily: Typography.sansBold, // Outfit
        color: TextTones.subtle,
        letterSpacing: 3,
        textAlign: 'center',
    },

    // Modal Overlays
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },
});

/**
 * Standardized Hit Slops for buttons
 * Ensures professional touch precision on both platforms.
 */
export const GlobalHitSlops = {
    sm: { top: 10, bottom: 10, left: 10, right: 10 },
    md: { top: 20, bottom: 20, left: 20, right: 20 },
    lg: { top: 30, bottom: 30, left: 30, right: 30 },
};

