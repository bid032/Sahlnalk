import * as React from 'react'
import { Html, Preview, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text, Hr } from './_brand'

interface Item {
  product_name: string
  plan_label: string
  quantity: number
  unit_price: number
}

export interface OrderConfirmationEmailProps {
  orderNumber: string
  subtotal?: number | null
  discountAmount?: number | null
  couponCode?: string | null
  total: number
  currency: string
  customerPhone?: string | null
  paymentGateway?: string | null
  items: Item[]
  lang?: 'ar' | 'en'
}

export const OrderConfirmationEmail = ({
  orderNumber, subtotal, discountAmount, couponCode, total, currency,
  customerPhone, paymentGateway, items, lang = 'ar',
}: OrderConfirmationEmailProps) => {
  const isAr = lang === 'ar'
  const hasCoupon = Number(discountAmount ?? 0) > 0
  const t = {
    heading: isAr ? `تم استلام طلبك #${orderNumber}` : `We received your order #${orderNumber}`,
    intro: isAr
      ? 'شكراً لثقتك في سهلنالك. استلمنا طلبك وبنجهّزه دلوقتي - أول ما يخلص، بيانات الحساب هتوصلك على نفس الإيميل ده.'
      : 'Thanks for choosing Sahlnalk. We got your order and we are preparing it now - your login details will arrive in this same inbox once ready.',
    order: isAr ? 'ملخص الطلب' : 'Order summary',
    before: isAr ? 'قبل الخصم' : 'Before discount',
    coupon: isAr ? 'كوبون' : 'Coupon',
    discount: isAr ? 'الخصم' : 'Discount',
    total: isAr ? 'الإجمالي' : 'Total',
    phone: isAr ? 'رقم التواصل' : 'Contact number',
    payment: isAr ? 'طريقة الدفع' : 'Payment method',
    qty: isAr ? 'الكمية' : 'Qty',
    footer: isAr ? 'عندك أي سؤال؟ رد على الإيميل ده وهنرد عليك.' : 'Any question? Just reply to this email.',
  }

  return (
    <Html lang={isAr ? 'ar' : 'en'} dir={isAr ? 'rtl' : 'ltr'}>
      <Head />
      <Preview>{t.heading}</Preview>
      <BrandLayout preview={t.heading} lang={isAr ? 'ar' : 'en'}>
        <Heading style={styles.h1}>{t.heading}</Heading>
        <Text style={styles.text}>{t.intro}</Text>

        <Section style={styles.card}>
          <Text style={styles.h2}>{t.order}</Text>
          {items.map((it, i) => (
            <Text key={i} style={styles.line}>
              {it.product_name} {it.plan_label ? `(${it.plan_label})` : ''} · {t.qty}: {it.quantity} ·{' '}
              <span style={styles.mono}>{it.unit_price} {currency}</span>
            </Text>
          ))}
          <Hr style={styles.hr} />
          {hasCoupon && subtotal != null && (
            <>
              <Text style={styles.line}>{t.before}: <span style={styles.mono}>{subtotal} {currency}</span></Text>
              {couponCode && (
                <Text style={styles.line}>{t.coupon}: <span style={styles.mono}>{couponCode}</span></Text>
              )}
              <Text style={styles.line}>{t.discount}: <span style={styles.mono}>-{discountAmount} {currency}</span></Text>
            </>
          )}
          <Text style={styles.line}>{t.total}: <span style={styles.mono}>{total} {currency}</span></Text>
          {customerPhone && (
            <Text style={styles.line}>{t.phone}: <span style={styles.mono}>{customerPhone}</span></Text>
          )}
          {paymentGateway && (
            <Text style={styles.line}>{t.payment}: <span style={styles.mono}>{paymentGateway}</span></Text>
          )}
        </Section>

        <Text style={{ ...styles.muted, textAlign: 'center', marginTop: '12px' }}>{t.footer}</Text>
      </BrandLayout>
    </Html>
  )
}

export default OrderConfirmationEmail

export const template = {
  component: OrderConfirmationEmail,
  subject: (d: Record<string, any>) => `طلبك #${d.orderNumber} اتسجّل | سهلنالك`,
  displayName: 'Order confirmation (customer)',
  previewData: {
    orderNumber: 'ABC12345',
    subtotal: 1700,
    discountAmount: 200,
    couponCode: 'SAVE200',
    total: 1500,
    currency: 'EGP',
    customerPhone: '01000000000',
    paymentGateway: 'wallet_instapay',
    items: [{ product_name: 'Netflix', plan_label: '1 Month', quantity: 1, unit_price: 1500 }],
    lang: 'ar',
  },
}
