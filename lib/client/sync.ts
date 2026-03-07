import { OutboxSyncManager } from '@/lib/client/outbox'

export const SyncManager = {
  async syncAll(coupleId?: string) {
    if (!coupleId) return
    try {
      await OutboxSyncManager.processOutbox(coupleId)
    } catch {
      // Best-effort sync; caller handles connectivity state.
    }
  },
}
