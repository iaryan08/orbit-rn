/**
 * Central AI Configuration for Orbit-v2
 * Change the model here or in .env to update the entire application.
 */
export const AI_CONFIG = {
    // Split models to avoid rate limits if needed (>20 RPD)
    LUMARA_MODEL: process.env.EXPO_PUBLIC_LUMARA_MODEL || 'gemini-3.1-flash-lite',
    MOON_MODEL: process.env.EXPO_PUBLIC_MOON_MODEL || 'gemini-3.1-flash-lite',

    // Other AI parameters can be centralized here
    TEMPERATURE: 0.7,
    MAX_TOKENS: 1024,
};
