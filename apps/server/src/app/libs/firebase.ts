import { cert, getApps, initializeApp, type ServiceAccount } from 'firebase-admin/app'
import { getMessaging, type MulticastMessage, type SendResponse } from 'firebase-admin/messaging'
import fs from 'fs'
import path from 'path'
import configs from '../configs'
import { logger } from './logger'

let isFirebaseInitialized = false

try {
  if (getApps().length > 0) {
    isFirebaseInitialized = true
  } else {
    let credential: ReturnType<typeof cert> | null = null

    // 1. Direct path config or GOOGLE_APPLICATION_CREDENTIALS
    const keyPath =
      configs.firebase.serviceAccountKeyPath || process.env.GOOGLE_APPLICATION_CREDENTIALS
    if (keyPath && fs.existsSync(path.resolve(keyPath))) {
      credential = cert(path.resolve(keyPath))
    }
    // 2. Base64 encoded service account
    else if (configs.firebase.serviceAccountBase64) {
      const decoded = Buffer.from(configs.firebase.serviceAccountBase64, 'base64').toString(
        'utf-8'
      )
      const serviceAccount = JSON.parse(decoded) as ServiceAccount
      credential = cert(serviceAccount)
    }
    // 3. Environment variables (projectId, clientEmail, privateKey)
    else if (
      configs.firebase.projectId &&
      configs.firebase.clientEmail &&
      configs.firebase.privateKey
    ) {
      credential = cert({
        projectId: configs.firebase.projectId,
        clientEmail: configs.firebase.clientEmail,
        privateKey: configs.firebase.privateKey,
      })
    }

    if (credential) {
      initializeApp({ credential })
      isFirebaseInitialized = true
      logger.info('Firebase Admin initialized successfully.')
    } else {
      logger.warn(
        '[Firebase] Service account credentials not provided. Push notifications will be skipped.'
      )
    }
  }
} catch (error) {
  logger.error('[Firebase] Initialization error (push notifications disabled):', error)
  isFirebaseInitialized = false
}

export interface ISendPushPayload {
  tokens: string[]
  title: string
  body: string
  imageUrl?: string | null | undefined
  data?: Record<string, string> | undefined
}

/**
 * Send push notification to multiple FCM tokens via Firebase Cloud Messaging.
 * Returns array of invalid/unregistered tokens so they can be cleaned up if needed.
 */
export const sendFcmPushNotification = async ({
  tokens,
  title,
  body,
  imageUrl,
  data = {},
}: ISendPushPayload): Promise<string[]> => {
  if (!isFirebaseInitialized || !tokens || tokens.length === 0) {
    return []
  }

  // Deduplicate tokens
  const uniqueTokens = Array.from(
    new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 0))
  )
  if (uniqueTokens.length === 0) return []

  const staleTokens: string[] = []

  // FCM multicast supports up to 500 tokens per batch
  const chunkSize = 500
  for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
    const chunk = uniqueTokens.slice(i, i + chunkSize)

    const message: MulticastMessage = {
      tokens: chunk,
      notification: {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      data: {
        ...data,
        title,
        body,
        ...(imageUrl ? { imageUrl } : {}),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK',
          ...(imageUrl ? { imageUrl } : {}),
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
        ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
      },
    }

    try {
      const response = await getMessaging().sendEachForMulticast(message)

      response.responses.forEach((resp: SendResponse, idx: number) => {
        if (!resp.success && resp.error) {
          const errorCode = resp.error.code
          if (
            errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered'
          ) {
            const badToken = chunk[idx]
            if (badToken) staleTokens.push(badToken)
          }
        }
      })
    } catch (err) {
      logger.error('[Firebase] Failed to send multicast push notifications:', err)
    }
  }

  return staleTokens
}
