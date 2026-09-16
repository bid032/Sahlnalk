import * as React from 'react'
import { Html, Preview, Link, Button, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
  lang?: 'ar' | 'en'
}

export const EmailChangeEmail = ({
  siteName, oldEmail, newEmail, confirmationUrl, lang = 'ar',
}: EmailChangeEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? `تأكيد تغيير البريد لـ ${siteName}` : `Confirm your email change for ${siteName}`,
    heading: isAr ? 'تأكيد تغيير البريد' : 'Confirm your email change',
    body: isAr ? 'طلبت تغيير عنوان بريدك في' : 'You requested to change your email address for',
    from: isAr ? 'من' : 'from',
    to: isAr ? 'إلى' : 'to',
    click: isAr ? 'اضغط على الزر بالأسفل لتأكيد التغيير:' : 'Click the button below to confirm this change:',
    button: isAr ? 'تأكيد التغيير' : 'Confirm Change',
  }
  return (
    <Html lang={lang} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.preview}</Preview>
      <BrandLayout preview={t.preview} lang={lang}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>
          {t.body} <b style={{ color: '#0a2a5e' }}>{siteName}</b> {t.from}{' '}
          <Link href={`mailto:${oldEmail}`} style={styles.link}>{oldEmail}</Link>{' '}{t.to}{' '}
          <Link href={`mailto:${newEmail}`} style={styles.link}>{newEmail}</Link>.
        </Text>
        <Text style={styles.text}>{t.click}</Text>
        <Section style={{ textAlign: 'center', margin: '18px 0 8px' }}>
          <Button style={styles.button} href={confirmationUrl}>{t.button}</Button>
        </Section>
      </BrandLayout>
    </Html>
  )
}

export default EmailChangeEmail
