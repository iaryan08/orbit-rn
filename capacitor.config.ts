import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.orbit.app',
    appName: 'Orbit',
    webDir: 'out',
    server: {
        androidScheme: 'https'
    },
    android: {
        buildOptions: {
            keystorePath: undefined,
            keystorePassword: '',
            keystoreAlias: '',
            keystoreAliasPassword: '',
            releaseType: 'AAB',
        }
    }
};

export default config;
