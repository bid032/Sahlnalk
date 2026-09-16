import * as React from 'react'
import { Html, Preview, Link, Button, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text } from './_brand'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  lang?: 'ar' | 'en'
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl, lang = 'ar' }: InviteEmailProps) => {
  const isAr = lang === 'ar'
  const t = {
    preview: isAr ? `تمت دعوتك للانضمام إلى ${siteName}` : `You've been invited to join ${siteName}`,
    heading: isAr ? 'تمت دعوتك' : "You've been invited",
    body: isAr ? 'تمت دعوتك للانضمام إلى' : "You've been invited to join",
    cta: isAr ? 'اضغط على الزر بالأسفل لقبول الدعوة وإنشاء حسابك.' : 'Click the button below to accept and create your account.',
    button: isAr ? 'قبول الدعوة' : 'Accept Invitation',
    ignore: isAr
      ? 'إذا لم تكن تنتظر هذه الدعوة، يمكنك تجاهل هذا الإيميل.'
      : "If you weren't expecting this invitation, you can safely ignore this email.",
  }
  return (
    <Html lang={lang} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.preview}</Preview>
      <BrandLayout preview={t.preview} lang={lang}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>
          {t.body}{' '}
          <Link href={siteUrl} style={styles.link}><strong>{siteName}</strong></Link>. {t.cta}
        </Text>
        <Section style={{ textAlign: 'center', margin: '18px 0 8px' }}>
          <Button style={styles.button} href={confirmationUrl}>{t.button}</Button>
        </Section>
        <Text style={styles.muted}>{t.ignore}</Text>
      </BrandLayout>
    </Html>
  )
}

export default InviteEmail
