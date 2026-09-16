/**
 * Resend gateway client for Lovable projects.
 *
 * Calls Resend through the Lovable connector gateway so credentials are
 * managed by the workspace connector and never shipped to the browser.
 *
 * Required env vars (injected by Lovable):
 * - LOVABLE_API_KEY   (gateway authentication)
 * - RESEND_API_KEY    (connector-specific key)
 */

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/resend'

export interface SendResendEmailOptions {
  to: string | string[]
  from: string
  subject: string
  html: string
  text?: string
  replyTo?: string | string[]
  idempotencyKey?: string
}

export interface ResendSendSuccess {
  id: string
  object: 'email'
}

export async function sendResendEmail(
  options: SendResendEmailOptions
): Promise<ResendSendSuccess> {
  const lovableApiKey = process.env.LOVABLE_API_KEY
  const resendApiKey = process.env.RESEND_API_KEY

  if (!lovableApiKey) {
    throw new Error('LOVABLE_API_KEY is not configured')
  }
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is not configured')
  }

  const to = Array.isArray(options.to) ? options.to : [options.to]
  if (to.length === 0) {
    throw new Error('At least one recipient is required')
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${lovableApiKey}`,
    'X-Connection-Api-Key': resendApiKey,
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey
  }

  const body: Record<string, unknown> = {
    from: options.from,
    to,
    subject: options.subject,
    html: options.html,
  }

  if (options.text) body.text = options.text
  if (options.replyTo) body.reply_to = options.replyTo

  const response = await fetch(`${GATEWAY_URL}/emails`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    console.error(`[resend] send failed [${response.status}]: ${errorBody}`)
    throw new Error(`Resend send failed [${response.status}]: ${errorBody}`)
  }

  return (await response.json()) as ResendSendSuccess
}

/**
 * Verify a Supabase auth-hook signature using Standard Webhooks.
 * The secret configured in Supabase is prefixed with `v1,whsec_`.
 */
export function getWebhookSecret(raw?: string): string | undefined {
  if (!raw) return undefined
  return raw.replace(/^v1,whsec_/, '')
}
