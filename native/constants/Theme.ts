export const Colors = {
    dark: {
        background: '#000000', // OLED Pure Black for Instagram-like contrast
        foreground: '#E5E5E5', // Soft Snow - high contrast but easy on eyes
        card: '#121212',
        cardForeground: '#FAFAFA',
        popover: '#0A0A0A',
        popoverForeground: '#FAFAFA',
        primary: '#f43f5e',
        primaryForeground: '#171717',
        secondary: '#818cf8',
        secondaryForeground: '#FAFAFA',
        muted: '#8E8E93', // iOS/Instagram style muted gray
        mutedForeground: '#A3A3A3',
        accent: '#fbbf24',
        accentForeground: '#FAFAFA',
        destructive: '#7F1D1D',
        destructiveForeground: '#F87171',
        border: 'rgba(255, 255, 255, 0.1)',
        input: '#262626',
        ring: '#D4D4D4',
        rose: {
            50: '#fff1f2',
            100: '#ffe4e6',
            200: '#fecdd3',
            300: '#fda4af',
            400: '#fb7185',
            500: '#f43f5e',
            600: '#e11d48',
            700: '#be123c',
            800: '#9f1239',
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
    sans: 'Outfit_400Regular', // Clean technical readability
    sansBold: 'Outfit_700Bold', // Professional, sharp technical bold
    sansMedium: 'Outfit_700Bold',
    serif: 'CormorantGaramond_700Bold', // Elegant classic
    serifBold: 'CormorantGaramond_700Bold',
    serifRegular: 'CormorantGaramond_400Regular',
    serifItalic: 'CormorantGaramond_400Regular_Italic',
    display: 'BodoniModa_700Bold', // "Vogue" style bold for headers
    italic: 'BodoniModa_400Regular_Italic', // Semantic Boutique Italic (Bodoni)
    special: 'MeaCulpa_400Regular',
    script: 'MeaCulpa_400Regular',
};

export const TypeScale = {
    h1: { fontSize: 36, fontFamily: Typography.sansBold, letterSpacing: -1 },
    h2: { fontSize: 28, fontFamily: Typography.sansBold, letterSpacing: -0.5 },
    h3: { fontSize: 22, fontFamily: Typography.serif, letterSpacing: 0 },
    title: { fontSize: 20, fontFamily: Typography.sansBold, letterSpacing: 0.5 },
    body: { fontSize: 16, fontFamily: Typography.sans, lineHeight: 24 },
    label: { fontSize: 14, fontFamily: Typography.sansBold, letterSpacing: 1 },
    caption: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.6)' },
    tiny: { fontSize: 11, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
};

export const TextTones = {
    primary: 'rgba(255,255,255,1)', // FULL WHITE
    secondary: 'rgba(255,255,255,0.85)',
    muted: 'rgba(255,255,255,0.72)',
    subtle: 'rgba(255,255,255,0.55)',
    decorative: 'rgba(255,255,255,0.3)',
};

export const Animations = {
    springApple: {
        damping: 18,
        stiffness: 120,
        mass: 1,
    },
    springSnap: {
        damping: 20,
        stiffness: 200,
        mass: 0.8,
    },
    timingFast: {
        duration: 250,
    },
    timingMicro: {
        duration: 150,
    }
};
