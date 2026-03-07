/**
 * Orbit Feature Flags
 *
 * Flip a flag here to enable/disable an experimental feature app-wide.
 * Code is never deleted — features are gated, not removed.
 */
export const FEATURES = {
    /**
     * End-to-End Encryption for media.
     * Keep false until React Native migration is complete and the crypto
     * pipeline has been validated on both platforms.
     * When false: all images render as plain <img>, no decrypt overhead,
     * no key prompts, no E2EE UI shown anywhere.
     */
    E2EE_ENABLED: false,
} as const;
