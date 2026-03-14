let NetInfo: any;

try {
    // Attempt to load the real NetInfo module
    // This might throw if the native module is missing (NativeModule.RNCNetInfo is null)
    NetInfo = require('@react-native-community/netinfo').default;
} catch (e) {
    console.warn("[NetInfo] Native module not found. App likely needs a rebuild. Defaulting to ONLINE mode.");
    // Mock implementation to prevent crash
    NetInfo = {
        fetch: () => Promise.resolve({ 
            type: 'wifi', 
            isConnected: true, 
            isInternetReachable: true, 
            details: { isConnectionExpensive: false } 
        }),
        addEventListener: () => () => {}, // No-op unsubscribe function
        configure: () => {},
        useNetInfo: () => ({ 
            type: 'wifi', 
            isConnected: true, 
            isInternetReachable: true, 
            details: { isConnectionExpensive: false } 
        }),
    };
}

export default NetInfo;
