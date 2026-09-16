import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { Header } from '@/components/Header'

export const Route = createFileRoute('/auth/confirm')({
  head: () => ({
    meta: [
      { title: 'تأكيد البريد الإلكتروني، سهلنالك' },
      { name: 'robots', content: 'noindex, nofollow' },
    ],
  }),
  component: ConfirmEmailPage,
})

function ConfirmEmailPage() {
  const navigate = useNavigate()
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying')
  const [message, setMessage] = useState<string>('جاري التحقق من الرابط...')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token_hash = params.get('token_hash')
    const type = params.get('type') as
      | 'signup'
      | 'magiclink'
      | 'recovery'
      | 'invite'
      | 'email_change'
      | 'reauthentication'
      | null
    const next = params.get('next') || '/dashboard'

    if (!token_hash || !type) {
      setStatus('error')
      setMessage('الرابط غير مكتمل أو غير صالح.')
      return
    }

    let mounted = true

    supabase.auth
      .verifyOtp({ token_hash, type })
      .then(({ error }) => {
        if (!mounted) return
        if (error) {
          console.error('confirm error', error)
          setStatus('error')
          setMessage('الرابط منتهي الصلاحية أو غير صالح. اطلب رابط جديد.')
          return
        }

        setStatus('success')
        setMessage('تم التحقق بنجاح. جاري التحويل...')

        // Recovery needs to land on the reset-password page so the user
        // can set a new password. The other types can go to the requested next URL.
        const destination = type === 'recovery' ? '/reset-password' : next
        setTimeout(() => navigate({ to: destination }), 1200)
      })

    return () => {
      mounted = false
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <div className="max-w-md mx-auto px-6 py-16">
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
          <h1 className="text-2xl font-extrabold mb-4">تأكيد البريد الإلكتروني</h1>
          <div
            className={
              status === 'error'
                ? 'text-destructive'
                : status === 'success'
                  ? 'text-success'
                  : 'text-muted-foreground'
            }
          >
            {message}
          </div>
        </div>
      </div>
    </div>
  )
}
