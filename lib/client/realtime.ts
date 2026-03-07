import { rtdb } from '@/lib/firebase/client'
import { ref, onValue, off } from 'firebase/database'

export const RealtimeManager = {
  subscribe(coupleId: string) {
    if (!coupleId) return
    const presenceRef = ref(rtdb, `presence/${coupleId}`)
    // This is a minimal subscriber to keep the connection alive if needed
    // or to trigger specific sync logic.
    onValue(presenceRef, () => {
      // Heartbeat or sync trigger
    })
  },
  unsubscribe(coupleId: string) {
    if (!coupleId) return
    try {
      off(ref(rtdb, `presence/${coupleId}`))
    } catch {
      //
    }
  },
}
