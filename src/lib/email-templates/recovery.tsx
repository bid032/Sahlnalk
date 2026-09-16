import * as React from 'react'
import { Html, Preview, Button, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  lang?: 'ar' | 'en'
}

export const RecoveryEmail = ({ siteName, confirmationUrl, lang = 'ar' }: RecoveryEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? `إعادة تعيين كلمة السر لـ ${siteName}` : `Reset your password for ${siteName}`,
    heading: isAr ? 'إعادة تعيين كلمة السر' : 'Reset your password',
    body: isAr
      ? 'استلمنا طلب لإعادة تعيين كلمة السر الخاصة بك. اضغط على الزر بالأسفل لاختيار كلمة سر جديدة.'
      : `We received a request to reset your password for ${siteName}. Click the button below to choose a new password.`,
    button: isAr ? 'إعادة تعيين كلمة السر' : 'Reset Password',
    ignore: isAr
      ? 'إذا لم تطلب إعادة التعيين، تجاهل هذا الإيميل.'
      : "If you didn't request a password reset, you can safely ignore this email.",
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

export default RecoveryEmail
