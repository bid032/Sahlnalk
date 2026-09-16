/**
 * SMTP mailer -sends emails through the user's own SMTP server
 * (e.g. cPanel / etohost mail server).
 *
 * Server-only. Reads:
 *  - SMTP_HOST         e.g. mail.rapidkeyz.com
 *  - SMTP_PORT         e.g. 465 (SSL) or 587 (STARTTLS)
 *  - SMTP_USER         full email account, e.g. noreply@rapidkeyz.com
 *  - SMTP_PASSWORD     mailbox password
 *  - SMTP_FROM         optional visible From, defaults to SMTP_USER
 */

import nodemailer, { type Transporter } from 'nodemailer'

export interface SendSmtpEmailOptions {
  to: string | string[]
  from?: string
  subject: string
  html: string
  text?: string
  replyTo?: string | string[]
}

let cachedTransporter: Transporter | null = null

function getTransporter(): Transporter {
  if (cachedTransporter) return cachedTransporter

  const host = process.env.SMTP_HOST
  const portRaw = process.env.SMTP_PORT
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD

  if (!host) throw new Error('SMTP_HOST is not configured')
  if (!user) throw new Error('SMTP_USER is not configured')
  if (!pass) throw new Error('SMTP_PASSWORD is not configured')

  const port = portRaw ? parseInt(portRaw, 10) : 465
  const secure = port === 465

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  })

  return cachedTransporter
}

export async function sendSmtpEmail(options: SendSmtpEmailOptions): Promise<{ id: string }> {
  const from = options.from || process.env.SMTP_FROM || process.env.SMTP_USER!
  const mailPayload = {
    from,
    to: options.to,
    subject: options.subject,
    html: options.html,
    text: options.text,
    replyTo: options.replyTo,
  }

  try {
    const transporter = getTransporter()
    const info = await transporter.sendMail(mailPayload)
    return { id: info.messageId }
  } catch (err: any) {
    const isDnsErr = err?.code === 'EBUSY' || err?.code === 'ENOTFOUND' || (typeof err?.message === 'string' && err.message.includes('getaddrinfo'))
    if (isDnsErr) {
      console.warn(`[smtp] Primary host lookup failed (${err?.code || err?.message}). Retrying with direct server IP...`)
      const fallbackTransporter = nodemailer.createTransport({
        host: '37.27.228.109',
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 465,
        secure: (process.env.SMTP_PORT || '465') === '465',
        auth: {
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASSWORD!,
        },
        tls: {
          rejectUnauthorized: false,
          servername: 'mail.rapidkeyz.com',
        },
      })
      const info = await fallbackTransporter.sendMail(mailPayload)
      return { id: info.messageId }
    }
    throw err
  }
}
