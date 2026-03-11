export const Colors = {
    dark: {
        background: '#000000', // Pure black for OLED battery saving
        foreground: '#FAFAFA',
        card: 'rgba(20, 20, 20, 0.4)', // Translucent base for blurring
        cardForeground: '#FAFAFA',
        popover: '#0A0A0A',
        popoverForeground: '#FAFAFA',
        primary: '#FAFAFA',
        primaryForeground: '#171717',
        secondary: '#1A1A1A',
        secondaryForeground: '#FAFAFA',
        muted: '#1A1A1A',
        mutedForeground: '#A3A3A3',
        accent: '#262626',
        accentForeground: '#FAFAFA',
        destructive: '#7F1D1D',
        destructiveForeground: '#F87171',
        border: 'rgba(255, 255, 255, 0.08)',
        input: '#262626',
        ring: '#D4D4D4',
        rose: {
            50: '#fff1f2',
            100: '#ffe4e6',
            400: '#fb7185',
            500: '#f43f5e',
            600: '#e11d48',
            900: '#881337',
            950: '#4c0519',
        },
        amber: {
            400: '#fbbf24',
            900: '#78350f',
        },
        emerald: {
            400: '#34d399',
            900: '#064e3b',
        },
        indigo: {
            400: '#818cf8',
            900: '#312e81',
        }
    },
    light: {
        // Light mode matches root oklch(1 0 0)
        background: '#FFFFFF',
        foreground: '#0A0A0A',
        card: '#FFFFFF',
        cardForeground: '#0A0A0A',
        popover: '#FFFFFF',
        popoverForeground: '#0A0A0A',
        primary: '#171717',
        primaryForeground: '#FAFAFA',
        secondary: '#F5F5F5',
        secondaryForeground: '#171717',
        muted: '#F5F5F5',
        mutedForeground: '#737373',
        accent: '#F5F5F5',
        accentForeground: '#171717',
        border: '#E5E5E5',
        input: '#E5E5E5',
        ring: '#171717',
    },
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
};

export const Radius = {
    sm: 6,
    md: 10,
    lg: 12,
    xl: 16,
    xxl: 24,
    full: 9999,
};

export const Typography = {
    sans: 'Outfit_400Regular',
    sansBold: 'Outfit_700Bold',
    serif: 'CormorantGaramond_400Regular',
    serifBold: 'CormorantGaramond_700Bold',
    serifItalic: 'CormorantGaramond_400Regular_Italic',
    script: 'MeaCulpa_400Regular',
    emoji: 'AppleColorEmoji',
};

// --- Design System: Uniform Animations ---
export const Animations = {
    // Apple-Style Fluid Spring
    springApple: {
        damping: 18,
        stiffness: 120,
        mass: 1,
    },
    // OnePlus-Style Snappy Spring
    springSnap: {
        damping: 20,
        stiffness: 200,
        mass: 0.8,
    },
    // Zero-Latency Timing
    timingFast: {
        duration: 250,
        // Easing.out(Easing.exp) is best for premium feel
    },
    // Subtle Micro-timing
    timingMicro: {
        duration: 150,
    }
};

