import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { render } from '@react-email/render'
import { Webhook } from 'standardwebhooks'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'
import { sendSmtpEmail } from '@/lib/smtp'
import { getWebhookSecret } from '@/lib/resend'

const SITE_NAME = 'Sahlnalk'
const ROOT_DOMAIN = 'rapidkeyz.com'
const SITE_URL = process.env.SITE_URL || `https://${ROOT_DOMAIN}`

// The visible From: address. Defaults to the cPanel main account shown in the screenshot.
const DEFAULT_FROM_EMAIL = 'Sahlnalk <_mainaccount@rapidkeyz.com>'
function getFromEmail(): string {
  return process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL
}

interface AuthHookPayload {
  user: {
    id: string
    email: string
    user_metadata?: Record<string, any>
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to?: string
    email_action_type:
      | 'signup'
      | 'invite'
      | 'magiclink'
      | 'recovery'
      | 'email_change'
      | 'reauthentication'
    site_url?: string
    token_new?: string
    token_hash_new?: string
  }
}

export const Route = createFileRoute('/lovable/email/auth/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawSecret = process.env.SEND_EMAIL_HOOK_SECRET
        if (!rawSecret) {
          console.error('[auth-webhook] SEND_EMAIL_HOOK_SECRET is not configured')
          return Response.json(
            { error: 'Webhook secret not configured' },
            { status: 500 }
          )
        }

        const secret = getWebhookSecret(rawSecret)
        if (!secret) {
          console.error('[auth-webhook] SEND_EMAIL_HOOK_SECRET is empty')
          return Response.json(
            { error: 'Webhook secret not configured' },
            { status: 500 }
          )
        }

        const payload = await request.text()
        const wh = new Webhook(secret)

        let data: AuthHookPayload
        try {
          const verified = wh.verify(payload, Object.fromEntries(request.headers)) as AuthHookPayload
          data = verified
        } catch (err) {
          console.error('[auth-webhook] signature verification failed', err)
          return Response.json({ error: 'Invalid signature' }, { status: 401 })
        }

        const { user, email_data: emailData } = data
        const lang = pickLang(user?.user_metadata)
        const siteUrl = emailData.site_url || SITE_URL
        const action = emailData.email_action_type

        try {
          const { subject, html, to } = await renderAuthEmail({
            action,
            user,
            emailData,
            siteUrl,
            lang,
          })

          await sendSmtpEmail({
            to,
            from: getFromEmail(),
            subject,
            html,
          })

          return Response.json({ sent: true })
        } catch (err) {
          console.error('[auth-webhook] send failed', err)
          return Response.json(
            { error: err instanceof Error ? err.message : 'Send failed' },
            { status: 500 }
          )
        }
      },
    },
  },
})

interface RenderArgs {
  action: AuthHookPayload['email_data']['email_action_type']
  user: AuthHookPayload['user']
  emailData: AuthHookPayload['email_data']
  siteUrl: string
  lang: 'ar' | 'en'
}

async function renderAuthEmail({ action, user, emailData, siteUrl, lang }: RenderArgs) {
  const confirmationUrl = buildConfirmationUrl(siteUrl, emailData)

  switch (action) {
    case 'signup': {
      const html = await render(
        React.createElement(SignupEmail, {
          siteName: SITE_NAME,
          siteUrl,
          recipient: user.email,
          confirmationUrl,
          lang,
        })
      )
      return { subject: 'أكد بريدك الإلكتروني', html, to: user.email }
    }

    case 'invite': {
      const html = await render(
        React.createElement(InviteEmail, {
          siteName: SITE_NAME,
          siteUrl,
          confirmationUrl,
          lang,
        })
      )
      return { subject: 'تمت دعوتك', html, to: user.email }
    }

    case 'magiclink': {
      const html = await render(
        React.createElement(MagicLinkEmail, {
          siteName: SITE_NAME,
          confirmationUrl,
          lang,
        })
      )
      return { subject: 'رابط الدخول', html, to: user.email }
    }

    case 'recovery': {
      const html = await render(
        React.createElement(RecoveryEmail, {
          siteName: SITE_NAME,
          confirmationUrl,
          lang,
        })
      )
      return { subject: 'إعادة تعيين كلمة السر', html, to: user.email }
    }

    case 'email_change': {
      const html = await render(
        React.createElement(EmailChangeEmail, {
          siteName: SITE_NAME,
          oldEmail: user.email,
          email: user.email,
          newEmail: user.email,
          confirmationUrl,
          lang,
        })
      )
      return { subject: 'تأكيد البريد الجديد', html, to: user.email }
    }

    case 'reauthentication': {
      const html = await render(
        React.createElement(ReauthenticationEmail, { token: emailData.token, lang })
      )
      return { subject: 'رمز التحقق', html, to: user.email }
    }

    default: {
      const _exhaustive: never = action
      throw new Error(`Unsupported auth email action: ${_exhaustive}`)
    }
  }
}

function buildConfirmationUrl(
  siteUrl: string,
  emailData: AuthHookPayload['email_data']
): string {
  const base = siteUrl.replace(/\/$/, '')
  const params = new URLSearchParams({
    token_hash: emailData.token_hash,
    type: emailData.email_action_type,
  })
  if (emailData.redirect_to) {
    params.append('next', emailData.redirect_to)
  }
  return `${base}/auth/confirm?${params.toString()}`
}

function pickLang(metadata?: Record<string, any>): 'ar' | 'en' {
  const raw =
    metadata?.language ?? metadata?.locale ?? ''
  if (typeof raw === 'string' && raw.toLowerCase().startsWith('en')) return 'en'
  return 'ar'
}
