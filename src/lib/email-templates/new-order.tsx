import * as React from 'react'
import { Html, Preview, Link, Section } from '@react-email/components'
import { BrandLayout, styles, Head, Heading, Text, Hr } from './_brand'

interface Item {
  product_name: string
  plan_label: string
  quantity: number
  unit_price: number
  delivery_type: string
  subscription_email?: string | null
}

export interface NewOrderEmailProps {
  orderNumber: string
  subtotal?: number | null
  discountAmount?: number | null
  couponCode?: string | null
  couponDiscountType?: string | null
  couponDiscountValue?: number | null
  total: number
  currency: string
  customerEmail: string
  customerPhone?: string | null
  paymentGateway: string
  paymentSenderPhone?: string | null
  paymentProofUrl?: string | null
  items: Item[]
  adminUrl: string
}

export const NewOrderEmail = ({
  orderNumber, subtotal, discountAmount, couponCode, couponDiscountType, couponDiscountValue,
  total, currency, customerEmail, customerPhone,
  paymentGateway, paymentSenderPhone, paymentProofUrl, items, adminUrl,
}: NewOrderEmailProps) => {
  const hasCoupon = Number(discountAmount ?? 0) > 0
  return (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`طلب جديد #${orderNumber} ، ${total} ${currency}`}</Preview>
    <BrandLayout preview={`طلب جديد #${orderNumber}`} lang="ar">
      <Heading style={styles.h1}>طلب جديد #{orderNumber}</Heading>
      <Text style={styles.text}>
        وصل طلب جديد ينتظر المراجعة والتنفيذ.
      </Text>

      <Section style={styles.card}>
        {hasCoupon && subtotal != null && (
          <Text style={styles.line}>
            <b style={{ color: '#0a2a5e' }}>قبل الخصم:</b>{' '}
            <span style={{ ...styles.mono, textDecoration: 'line-through', opacity: 0.7 }}>{subtotal} {currency}</span>
          </Text>
        )}
        {hasCoupon && (
          <Text style={styles.line}>
            <b style={{ color: '#0a2a5e' }}>🎟️ كوبون خصم:</b>{' '}
            {couponCode && <span style={styles.mono}>{couponCode}</span>}{' '}
            <span style={{ color: '#22c55e', fontWeight: 700 }}>−{discountAmount} {currency}</span>
            {couponDiscountType === 'percent' && couponDiscountValue != null && (
              <span style={{ opacity: 0.7 }}> ({couponDiscountValue}%)</span>
            )}
          </Text>
        )}
        <Text style={styles.line}><b style={{ color: '#0a2a5e' }}>{hasCoupon ? 'المبلغ بعد الخصم:' : 'المبلغ:'}</b> <span style={styles.mono}>{total} {currency}</span></Text>
        <Text style={styles.line}><b style={{ color: '#0a2a5e' }}>طريقة الدفع:</b> {paymentGateway}</Text>
        <Text style={styles.line}><b style={{ color: '#0a2a5e' }}>العميل:</b> {customerEmail}{customerPhone ? ` , ${customerPhone}` : ''}</Text>
        {paymentSenderPhone && (
          <Text style={styles.line}><b style={{ color: '#0a2a5e' }}>رقم المحفظة:</b> <span style={styles.mono}>{paymentSenderPhone}</span></Text>
        )}
        {paymentProofUrl && (
          <Text style={styles.line}><b style={{ color: '#0a2a5e' }}>إثبات الدفع:</b> <Link href={paymentProofUrl} style={styles.link}>عرض الصورة</Link></Text>
        )}
      </Section>

      <Heading as="h2" style={styles.h2}>تفاصيل الطلب</Heading>
      {items.map((it, i) => (
        <Section key={i} style={styles.card}>
          <Text style={styles.cardTitle}>{it.product_name}</Text>
          <Text style={styles.line}>{it.plan_label} × {it.quantity} , {it.unit_price} {currency}</Text>
          <Text style={styles.line}><span style={{ color: styles.h2.color }}>{it.delivery_type}</span></Text>
          {it.subscription_email && (
            <Text style={styles.line}>تفعيل على: <span style={styles.mono}>{it.subscription_email}</span></Text>
          )}
        </Section>
      ))}

      <Hr style={styles.hr} />
      <Section style={{ textAlign: 'center', margin: '10px 0 4px' }}>
        <Link href={adminUrl} style={styles.button}>فتح لوحة الطلبات</Link>
      </Section>
      <Text style={{ ...styles.muted, textAlign: 'center', marginTop: '12px' }}>
        Sahlnalk Admin Panel
      </Text>
    </BrandLayout>
  </Html>
  )
}

export default NewOrderEmail

export const template = {
  component: NewOrderEmail,
  subject: (d: Record<string, any>) => `طلب جديد #${d.orderNumber} ، ${d.total} ${d.currency}`,
  previewData: {
    orderNumber: 'ABC12345',
    total: 1500,
    currency: 'EGP',
    customerEmail: 'customer@example.com',
    customerPhone: '01000000000',
    paymentGateway: 'wallet_instapay',
    paymentSenderPhone: '01111111111',
    paymentProofUrl: 'https://example.com/proof.jpg',
    items: [
      { product_name: 'Netflix', plan_label: '1 Month', quantity: 1, unit_price: 1500, delivery_type: 'manual', subscription_email: 'user@gmail.com' },
    ],
    adminUrl: 'https://example.com/admin/orders',
  },
}
