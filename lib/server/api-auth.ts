import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getResolvedSupabasePublishableKey, getResolvedSupabaseUrl } from '@/lib/supabase/env'

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

async function getUserFromBearer(request: NextRequest): Promise<User | null> {
  const token = getBearerToken(request)
  if (!token) return null

  const supabase = createSupabaseClient(
    getResolvedSupabaseUrl(),
    getResolvedSupabasePublishableKey(),
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token)

  if (error) return null
  return user
}

async function getUserFromCookies(): Promise<User | null> {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) return null
    return user
  } catch {
    return null
  }
}

export async function requireApiUser(request: NextRequest): Promise<User | null> {
  const bearerUser = await getUserFromBearer(request)
  if (bearerUser) return bearerUser
  return getUserFromCookies()
}
