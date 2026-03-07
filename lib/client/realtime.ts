import { createClient } from '@/lib/supabase/client'

let activeChannel: ReturnType<ReturnType<typeof createClient>['channel']> | null = null

export const RealtimeManager = {
  subscribe(coupleId: string) {
    if (!coupleId) return
    if (activeChannel) return
    const supabase = createClient()
    const channel = supabase.channel(`orbit_sync_provider_${coupleId}`)
    channel.subscribe()
    activeChannel = channel
  },
  unsubscribe() {
    if (!activeChannel) return
    try {
      activeChannel.unsubscribe()
    } catch {
      //
    }
    activeChannel = null
  },
}

