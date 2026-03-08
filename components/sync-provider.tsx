'use client';

import { useEffect, useState } from 'react';
import { Network } from '@capacitor/network';
import { SyncManager } from '@/lib/client/sync';
import { RealtimeManager } from '@/lib/client/realtime';
import { sqliteService } from '@/lib/client/sqlite';

export function SyncProvider({
    children,
    coupleId,
}: {
    children: React.ReactNode;
    coupleId: string;
}) {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        let networkListener: any;

        const initialize = async () => {
            try {
                // 1. Init Database first
                await sqliteService.init();

                // 2. Perform initial background sync
                const status = await Network.getStatus();
                if (status.connected) {
                    await SyncManager.syncAll(coupleId);
                    RealtimeManager.subscribe(coupleId);
                }

                // 3. Setup network listener for re-connections
                networkListener = await Network.addListener('networkStatusChange', async (status) => {
                    console.log('Network status changed:', status.connected);

                    if (status.connected) {
                        console.log('Internet restored - Triggering sync...');
                        await SyncManager.syncAll(coupleId);
                        RealtimeManager.subscribe(coupleId);
                    } else {
                        console.log('Internet lost - Unsubscribing realtime...');
                        RealtimeManager.unsubscribe(coupleId);
                    }
                });

                setIsReady(true);
            } catch (e) {
                console.error('Initial sync/setup failed:', e);
                // Continue anyway so UI isn't perfectly blocked just because of an error
                setIsReady(true);
            }
        };

        if (coupleId) {
            initialize();
        }

        return () => {
            if (networkListener) {
                networkListener.remove();
            }
            RealtimeManager.unsubscribe(coupleId);
        };
    }, [coupleId]);

    if (!isReady) {
        // Or return a splash screen/loading fallback if desired
        return null;
    }

    return <>{children}</>;
}
