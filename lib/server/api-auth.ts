import { adminAuth } from '@/lib/firebase/admin'
import type { NextRequest } from 'next/server'
import { requireUser } from '@/lib/firebase/auth-server'

export type ApiUser = {
  uid: string
  email?: string
  display_name?: string
}

function getBearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (!authHeader) return null

  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

async function getUserFromBearer(request: NextRequest): Promise<ApiUser | null> {
  const token = getBearerToken(request)
  if (!token) return null

  try {
    const decodedToken = await adminAuth.verifyIdToken(token)
    return {
      uid: decodedToken.uid,
      email: decodedToken.email,
      display_name: decodedToken.name,
    }
  } catch (error) {
    console.warn('[ApiAuth] Bearer token verification failed:', error)
    return null
  }
}

async function getUserFromCookies(): Promise<ApiUser | null> {
  try {
    const user = await requireUser()
    if (!user) return null
    return {
      uid: user.uid,
      email: user.email,
      display_name: user.displayName || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Validates the user from either a Bearer Token (mobile app) or Session Cookie (web).
 * Returns a simplified User object or null if unauthorized.
 */
export async function requireApiUser(request: NextRequest): Promise<ApiUser | null> {
  const bearerUser = await getUserFromBearer(request)
  if (bearerUser) return bearerUser

  return getUserFromCookies()
}
