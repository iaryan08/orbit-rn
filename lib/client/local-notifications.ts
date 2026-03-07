import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

export class LocalNotificationManager {
    /**
     * Request permissions (Needed for Android 13+)
     */
    static async requestPermissions(): Promise<boolean> {
        if (Capacitor.getPlatform() === 'web') return false;

        const { display } = await LocalNotifications.requestPermissions();
        return display === 'granted';
    }

    /**
     * Schedule a simple local notification at a future date
     */
    static async schedule(options: { id: number; title: string; body: string; scheduleAt: Date }) {
        if (Capacitor.getPlatform() === 'web') return;

        await LocalNotifications.schedule({
            notifications: [
                {
                    title: options.title,
                    body: options.body,
                    id: options.id,
                    schedule: { at: options.scheduleAt },
                    sound: undefined,
                    actionTypeId: '',
                    extra: null
                }
            ]
        });
    }

    /**
     * Schedule a daily recurring notification
     */
    static async scheduleDaily(options: { id: number; title: string; body: string; hour: number; minute: number }) {
        if (Capacitor.getPlatform() === 'web') return;

        await LocalNotifications.schedule({
            notifications: [
                {
                    title: options.title,
                    body: options.body,
                    id: options.id,
                    schedule: {
                        on: { hour: options.hour, minute: options.minute }
                    }
                }
            ]
        });
    }

    /**
     * Cancel a specific scheduled notification
     */
    static async cancel(id: number) {
        if (Capacitor.getPlatform() === 'web') return;

        await LocalNotifications.cancel({ notifications: [{ id }] });
    }

    /**
     * Cancel all scheduled notifications
     */
    static async cancelAll() {
        if (Capacitor.getPlatform() === 'web') return;

        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
            await LocalNotifications.cancel({ notifications: pending.notifications });
        }
    }
}
