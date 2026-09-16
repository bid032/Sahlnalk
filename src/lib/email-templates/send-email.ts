import * as React from 'react'
import { render } from '@react-email/render'
import { TEMPLATES } from './registry'
import { sendSmtpEmail } from '@/lib/smtp'

// Server-only: sends through the project's own SMTP server (nodemailer).

const DEFAULT_FROM_EMAIL = 'Sahlnalk <noreply@rapidkeyz.com>'

function getFromEmail(): string {
  return process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || DEFAULT_FROM_EMAIL
}

export type SendTemplateEmailResult = { sent: true }

export interface SendTemplateEmailOptions {
  templateData?: Record<string, any>
  /** Kept for API compatibility; SMTP has no idempotency header. */
  idempotencyKey?: string
  replyTo?: string
}

/**
 * Renders a registered template and sends it through the project's SMTP server.
 * Throws on failure; a successful send resolves { sent: true }.
 */
export async function sendTemplateEmail(
  templateName: string,
  to: string,
  options: SendTemplateEmailOptions = {}
): Promise<SendTemplateEmailResult> {
  const template = TEMPLATES[templateName]
  if (!template) {
    throw new Error(
      `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`
    )
  }

  // The explicit recipient always wins; template.to is only a fallback.
  // (A hardcoded template.to silently redirected every admin notification to
  // one mailbox, so real admins never received the new-order email.)
  const recipient = to || template.to
  if (!recipient) {
    throw new Error('Recipient is required (the template defines no fixed recipient)')
  }

  const templateData = options.templateData ?? {}
  const element = React.createElement(template.component, templateData)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  await sendSmtpEmail({
    to: recipient,
    from: getFromEmail(),
    subject,
    html,
    text,
    replyTo: options.replyTo,
  })

  return { sent: true }
}

