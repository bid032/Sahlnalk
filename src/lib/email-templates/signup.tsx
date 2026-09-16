import * as React from 'react'
import { Html, Preview, Link, Section, Button } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  lang?: 'ar' | 'en'
}

export const SignupEmail = ({
  siteName, siteUrl, recipient, confirmationUrl, lang = 'ar',
}: SignupEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? `تأكيد بريدك الإلكتروني في ${siteName}` : `Confirm your email for ${siteName}`,
    heading: isAr ? 'أكد بريدك الإلكتروني' : 'Confirm your email',
    thanks: isAr ? 'شكراً لتسجيلك في' : 'Thanks for signing up for',
    please: isAr ? 'يرجى تأكيد عنوان بريدك' : 'Please confirm your address',
    button: isAr ? 'تأكيد البريد' : 'Verify Email',
    ignore: isAr
      ? 'إذا لم تكن أنت من أنشأ الحساب، يمكنك تجاهل هذا الإيميل بأمان.'
      : "If you didn't create an account, you can safely ignore this email.",
  }
  return (
    <Html lang={lang} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.preview}</Preview>
      <BrandLayout preview={t.preview} lang={lang}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>
          {t.thanks}{' '}
          <Link href={siteUrl} style={styles.link}><strong>{siteName}</strong></Link>!
        </Text>
        <Text style={styles.text}>
          {t.please} (<span style={styles.mono}>{recipient}</span>)
        </Text>
        <Section style={{ textAlign: 'center', margin: '18px 0 8px' }}>
          <Button style={styles.button} href={confirmationUrl}>{t.button}</Button>
        </Section>
        <Text style={styles.muted}>{t.ignore}</Text>
      </BrandLayout>
    </Html>
  )
}

export default SignupEmail
