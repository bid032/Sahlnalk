import * as React from 'react'
import {
  Body, Container, Head, Heading, Section, Text, Hr, Img,
} from '@react-email/components'

const LOGO_URL = 'https://rapidkeyz.com/logo.png'

/**
 * Sahlnalk email brand - light fresh cyan.
 * Palette mirrors the light site (fresh cyan, deep link-blue) so
 * emails feel like a direct extension of the app UI.
 */
export const brand = {
  // Core brand
  cyan: '#00a9e0',        // --brand
  glow: '#4fd7f7',        // --brand-glow (lighter cyan)
  accent: '#bfe9fa',      // --accent (soft cyan highlight)
  deep: '#0b3fa0',        // --brand-deep (deep link-blue)

  // Surfaces (mirrors light theme)
  bg: '#f0f8fd',          // background
  surface: '#ffffff',     // --card
  surfaceSoft: '#e3f1fa', // muted

  // Ink
  ink: '#0a2a5e',         // foreground
  inkStrong: '#0a2a5e',
  inkMuted: '#47688f',    // muted-foreground

  // Structure
  border: 'rgba(0,169,224,0.25)',
  borderSoft: 'rgba(10,42,94,0.12)',
  bodyBg: '#e8f3fa',
}

const fontStack = '"Rubik", "IBM Plex Sans Arabic", "Space Grotesk", "Segoe UI", Tahoma, Arial, sans-serif'
const displayStack = '"Rubik", "Space Grotesk", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, Arial, sans-serif'

export const styles = {
  main: {
    backgroundColor: brand.bodyBg,
    // Subtle branded wash on the outer body -visible in clients that render
    // background images (Apple Mail, Gmail web). Gmail app falls back cleanly.
    backgroundImage:
      'radial-gradient(ellipse 60% 40% at 15% 0%, rgba(34,195,230,0.10), transparent 60%),' +
      'radial-gradient(ellipse 50% 40% at 85% 100%, rgba(48,64,200,0.10), transparent 60%)',
    fontFamily: fontStack,
    margin: 0,
    padding: '32px 12px',
  } as const,
  container: {
    maxWidth: '620px',
    margin: '0 auto',
    backgroundColor: brand.bg,
    backgroundImage:
      'radial-gradient(120% 60% at 0% 0%, rgba(34,195,230,0.14), transparent 55%),' +
      'radial-gradient(120% 60% at 100% 100%, rgba(48,64,200,0.18), transparent 55%)',
    borderRadius: '20px',
    overflow: 'hidden',
    border: `1px solid ${brand.border}`,
    boxShadow: '0 24px 60px -20px rgba(11,16,32,0.45), 0 0 0 1px rgba(127,220,240,0.06)',
  } as const,
  header: {
    background:
      `linear-gradient(135deg, ${brand.bg} 0%, ${brand.surface} 55%, ${brand.deep} 140%)`,
    padding: '32px 32px 26px',
    borderBottom: `1px solid ${brand.border}`,
    textAlign: 'center' as const,
    position: 'relative' as const,
  },
  logoWrap: {
    display: 'inline-block',
    padding: '10px 22px',
    borderRadius: '999px',
    border: `1px solid ${brand.border}`,
    background:
      'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(34,195,230,0.06) 100%)',
    boxShadow: '0 0 30px -10px rgba(34,195,230,0.55)',
  },
  logo: {
    fontFamily: displayStack,
    fontSize: '26px',
    fontWeight: 800 as const,
    letterSpacing: '-0.01em',
    margin: 0,
    // Gradient wordmark that mirrors the site's .brand-text utility.
    // Uses -webkit-background-clip so it renders in Apple Mail / Gmail web;
    // clients that don't support it fall back to solid cyan (still on-brand).
    background:
      `linear-gradient(100deg, ${brand.glow} 0%, ${brand.cyan} 30%, ${brand.accent} 55%, ${brand.cyan} 80%, ${brand.glow} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent',
    color: brand.cyan, // fallback
  } as const,
  tagline: {
    color: brand.inkMuted,
    fontSize: '11px',
    margin: '10px 0 0',
    letterSpacing: '3px',
    textTransform: 'uppercase' as const,
    fontFamily: displayStack,
  },
  body: { padding: '30px 32px 14px' },
  h1: {
    fontFamily: displayStack,
    fontSize: '24px',
    fontWeight: 800 as const,
    color: brand.inkStrong,
    margin: '0 0 18px',
    lineHeight: '1.35',
    letterSpacing: '-0.01em',
  },
  h2: {
    fontFamily: displayStack,
    fontSize: '13px',
    fontWeight: 700 as const,
    color: brand.cyan,
    margin: '24px 0 12px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
  },
  text: {
    fontSize: '15px',
    color: brand.ink,
    lineHeight: '1.85',
    margin: '0 0 14px',
    fontFamily: fontStack,
  },
  muted: {
    fontSize: '12.5px',
    color: brand.inkMuted,
    lineHeight: '1.7',
    margin: 0,
    fontFamily: fontStack,
  },
  card: {
    padding: '18px 20px',
    border: `1px solid ${brand.border}`,
    borderRadius: '14px',
    marginBottom: '12px',
    backgroundColor: 'rgba(34,195,230,0.06)',
    backgroundImage:
      'linear-gradient(180deg, rgba(127,220,240,0.05) 0%, rgba(48,64,200,0.05) 100%)',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 700 as const,
    color: brand.inkStrong,
    margin: '0 0 10px',
    fontFamily: displayStack,
  },
  line: {
    fontSize: '13.5px',
    color: brand.ink,
    margin: '6px 0',
    lineHeight: '1.75',
    fontFamily: fontStack,
  },
  mono: {
    fontFamily: '"Space Grotesk", ui-monospace, "SF Mono", Menlo, Consolas, monospace',
    backgroundColor: '#0a2a5e',
    color: brand.glow,
    padding: '3px 9px',
    borderRadius: '6px',
    fontSize: '12.5px',
    border: `1px solid ${brand.border}`,
    display: 'inline-block',
    direction: 'ltr' as const,
    unicodeBidi: 'isolate' as const,
  },
  button: {
    display: 'inline-block',
    // Gradient CTA mirrors the site's primary buttons.
    background: `linear-gradient(135deg, ${brand.cyan} 0%, ${brand.deep} 100%)`,
    backgroundColor: brand.cyan, // fallback
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 800 as const,
    borderRadius: '12px',
    padding: '14px 30px',
    textDecoration: 'none',
    letterSpacing: '0.02em',
    boxShadow: '0 12px 28px -10px rgba(34,195,230,0.6), 0 0 0 1px rgba(127,220,240,0.25) inset',
    fontFamily: displayStack,
  },
  hr: {
    borderColor: brand.borderSoft,
    margin: '24px 0',
  },
  footer: {
    padding: '22px 32px 28px',
    borderTop: `1px solid ${brand.borderSoft}`,
    textAlign: 'center' as const,
    background:
      `linear-gradient(180deg, ${brand.surfaceSoft} 0%, ${brand.bg} 100%)`,
  },
  footerBrand: {
    fontFamily: displayStack,
    fontSize: '13px',
    fontWeight: 800 as const,
    letterSpacing: '0.02em',
    margin: '0 0 6px',
    background:
      `linear-gradient(100deg, ${brand.glow} 0%, ${brand.cyan} 50%, ${brand.glow} 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text' as const,
    WebkitTextFillColor: 'transparent',
    color: brand.cyan,
  } as const,
  footerText: {
    fontSize: '11.5px',
    color: brand.inkMuted,
    margin: 0,
    lineHeight: '1.7',
    fontFamily: fontStack,
  },
  link: {
    color: brand.glow,
    textDecoration: 'underline',
  },
}

interface LayoutProps {
  preview: string
  lang?: 'ar' | 'en'
  children: React.ReactNode
}

export const BrandLayout = ({ lang = 'ar', children }: LayoutProps) => {
  const isAr = lang === 'ar'
  const dir = isAr ? 'rtl' : 'ltr'
  const dirStyle = {
    direction: dir as 'rtl' | 'ltr',
    textAlign: (isAr ? 'right' : 'left') as 'right' | 'left',
  }
  return (
    <Body style={{ ...styles.main, ...dirStyle }} dir={dir}>
      <Container style={{ ...styles.container, ...dirStyle }} dir={dir}>
        <Section style={{ ...styles.header, textAlign: 'center' }} dir={dir}>
          <table role="presentation" cellPadding={0} cellSpacing={0} border={0} align="center" style={{ margin: '0 auto', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ verticalAlign: 'middle', padding: '0 10px' }}>
                  <Img src={LOGO_URL} width="52" height="52" alt="Sahlnalk" style={{ display: 'block', borderRadius: '12px' }} />
                </td>
                <td style={{ verticalAlign: 'middle', padding: '0 10px', textAlign: isAr ? 'right' : 'left' }}>
                  <Heading style={{ ...styles.logo, display: 'block' }}>Sahlnalk</Heading>
                  <Text style={{ ...styles.tagline, margin: '4px 0 0' }}>
                    {isAr ? 'الاشتراكات الرقمية الأسرع' : 'Fastest Digital Subscriptions'}
                  </Text>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
        <Section style={{ ...styles.body, ...dirStyle }} dir={dir}>{children}</Section>
        <Section style={{ ...styles.footer, textAlign: 'center' }} dir={dir}>
          <Text style={styles.footerBrand}>Sahlnalk</Text>
          <Text style={styles.footerText}>
            © {new Date().getFullYear()} Sahlnalk ,{' '}
            {isAr ? 'جميع الحقوق محفوظة' : 'All rights reserved'}
          </Text>
          <Text style={{ ...styles.footerText, marginTop: '6px' }}>
            {isAr ? 'تصميم وبرمجة' : 'Designed & Developed by'}{' '}
            <a
              href="https://www.facebook.com/bid032"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: brand.glow, fontWeight: 700, textDecoration: 'none' }}
            >
              Bido
            </a>
          </Text>
        </Section>
      </Container>
    </Body>
  )
}

export { Head, Heading, Section, Text, Hr }
