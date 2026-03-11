import { StyleSheet } from 'react-native';
import { Colors, Spacing, Typography } from './Theme';

/**
 * Global Design System Styles
 * Use these to maintain consistency across the entire application.
 * ORBIT IS NOT RANDOM APP IT'S PROFESSIONAL.
 */
export const GlobalStyles = StyleSheet.create({
    // Standardized screen header container
    standardHeader: {
        paddingTop: 10,
        paddingBottom: 32,
        paddingHorizontal: Spacing.xl,
    },

    // Primary title (e.g., "Dashboard", "Settings")
    standardTitle: {
        fontSize: 34,
        fontFamily: Typography.serifBold,
        color: 'white',
        letterSpacing: -0.5,
        marginBottom: 4,
        textAlign: 'left',
    },

    // Sub-header tags (e.g., "IDENTITY · SPACE")
    standardSubtitle: {
        fontSize: 11,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.7)',
        letterSpacing: 1.5,
        textAlign: 'left',
    },

    // Centered layout variants for specific hero moments
    centeredHeader: {
        paddingTop: 40,
        paddingBottom: Spacing.xl,
        paddingHorizontal: Spacing.md,
        alignItems: 'center',
    },
    centeredTitle: {
        fontSize: 48,
        fontFamily: Typography.serif,
        color: 'white',
        letterSpacing: -1,
        marginBottom: 4,
        textAlign: 'center',
    },
    centeredSubtitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 2,
        textAlign: 'center',
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

