import * as React from 'react'
import { Html, Preview } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface ReauthenticationEmailProps {
  token: string
  lang?: 'ar' | 'en'
}

export const ReauthenticationEmail = ({ token, lang = 'ar' }: ReauthenticationEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? 'رمز التحقق الخاص بك' : 'Your verification code',
    heading: isAr ? 'تأكيد إعادة المصادقة' : 'Confirm reauthentication',
    body: isAr ? 'استخدم الرمز التالي لتأكيد هويتك:' : 'Use the code below to confirm your identity:',
    ignore: isAr
      ? 'ينتهي هذا الرمز بعد فترة قصيرة. إذا لم تطلبه، تجاهل هذا الإيميل.'
      : "This code will expire shortly. If you didn't request this, you can safely ignore this email.",
  }
  return (
    <Html lang={lang} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.preview}</Preview>
      <BrandLayout preview={t.preview} lang={lang}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>{t.body}</Text>
        <Text style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: '28px',
          fontWeight: 800 as const,
          color: styles.h2.color,
          letterSpacing: '6px',
          textAlign: 'center' as const,
          padding: '18px',
          backgroundColor: '#020617',
          borderRadius: '12px',
          border: `1px solid ${styles.card.border}`,
          margin: '10px 0 20px',
        }}>{token}</Text>
        <Text style={styles.muted}>{t.ignore}</Text>
      </BrandLayout>
    </Html>
  )
}

export default ReauthenticationEmail
