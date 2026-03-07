import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js' // Standard client
import { cookies } from 'next/headers'
import { getResolvedSupabasePublishableKey, getResolvedSupabaseUrl } from '@/lib/supabase/env'

export async function createClient() {
  const cookieStore = await cookies()
  const resolvedSupabaseUrl = getResolvedSupabaseUrl()
  const resolvedPublishableKey = getResolvedSupabasePublishableKey()

  return createServerClient(
    resolvedSupabaseUrl,
    resolvedPublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // The "setAll" method was called from a Server Component.
          }
        },
      },
    },
  )
}

export async function createAdminClient() {
  const { getResolvedDirectSupabaseUrl } = await import('@/lib/supabase/env')
  const resolvedSupabaseUrl = getResolvedDirectSupabaseUrl()
  return createSupabaseClient(
    resolvedSupabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
