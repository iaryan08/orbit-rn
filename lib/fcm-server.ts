import 'server-only'
import crypto from 'crypto'

type FcmSendResult = { success: true } | { success: false; error: string; status?: number }

const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function getFirebaseEnv() {
  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

async function getGoogleAccessToken(): Promise<string> {
  const env = getFirebaseEnv()
  if (!env) {
    throw new Error('Missing Firebase env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY')
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: env.clientEmail,
    scope: FCM_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedClaims = base64UrlEncode(JSON.stringify(claimSet))
  const signingInput = `${encodedHeader}.${encodedClaims}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(env.privateKey)
  const jwt = `${signingInput}.${base64UrlEncode(signature)}`

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to get Google access token: ${response.status} ${text}`)
  }

  const json = (await response.json()) as { access_token: string }
  return json.access_token
}

export function isNativePushConfigured() {
  return Boolean(getFirebaseEnv())
}

export async function sendFcmToToken(params: {
  token: string
  title: string
  message: string
  url?: string
  metadata?: Record<string, unknown>
}): Promise<FcmSendResult> {
  const env = getFirebaseEnv()
  if (!env) {
    return { success: false, error: 'FCM not configured' }
  }

  try {
    const accessToken = await getGoogleAccessToken()
    const dataPayload: Record<string, string> = {
      url: params.url || '/',
      title: params.title,
      body: params.message,
      metadata: JSON.stringify(params.metadata || {}),
    }

    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: params.token,
            notification: {
              title: params.title,
            },
            data: dataPayload,
            android: {
              priority: 'HIGH',
              notification: {
                channel_id: 'default_channel_id',
                sound: 'default',
                ...(params.metadata?.type === 'heartbeat' ? {
                  default_vibrate_timings: false,
                  vibrate_timings: ['0.2s', '0.1s', '0.2s', '0.4s'],
                } : {})
              },
            },
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                  category: 'HEARTBEAT',
                  interruption_level: 'time-sensitive',
                },
              },
            },
          },
        }),
        cache: 'no-store',
      },
    )

    if (!response.ok) {
      const text = await response.text()
      return { success: false, error: `FCM send failed: ${text}`, status: response.status }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'Unknown FCM error' }
  }
}
