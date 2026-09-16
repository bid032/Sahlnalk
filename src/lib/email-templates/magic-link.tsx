import * as React from 'react'
import { Html, Preview, Button, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  lang?: 'ar' | 'en'
}

export const MagicLinkEmail = ({ siteName, confirmationUrl, lang = 'ar' }: MagicLinkEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? `رابط الدخول إلى ${siteName}` : `Your login link for ${siteName}`,
    heading: isAr ? 'رابط الدخول' : 'Your login link',
    body: isAr
      ? `اضغط على الزر بالأسفل للدخول إلى ${siteName}. الرابط ينتهي بعد فترة قصيرة.`
      : `Click the button below to log in to ${siteName}. This link will expire shortly.`,
    button: isAr ? 'تسجيل الدخول' : 'Log In',
    ignore: isAr
      ? 'إذا لم تطلب هذا الرابط، تجاهل هذا الإيميل.'
      : "If you didn't request this link, you can safely ignore this email.",
  }
  return (
    <Html lang={lang} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.preview}</Preview>
      <BrandLayout preview={t.preview} lang={lang}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>{t.body}</Text>
        <Section style={{ textAlign: 'center', margin: '18px 0 8px' }}>
          <Button style={styles.button} href={confirmationUrl}>{t.button}</Button>
        </Section>
        <Text style={styles.muted}>{t.ignore}</Text>
      </BrandLayout>
    </Html>
  )
}

export default MagicLinkEmail
