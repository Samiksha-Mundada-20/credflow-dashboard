// src/lib/razorpay.ts
// Helper utility to load Razorpay checkout script and trigger standard payment modal.

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(false)
      return
    }
    if ((window as any).Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export interface CheckoutOptions {
  userId?: string
  userEmail?: string
  amount?: number // in paise (e.g. 29900 = ₹299)
  onSuccess?: () => void
  onCancel?: () => void
  onError?: (msg: string) => void
}

export async function openRazorpayCheckout({
  userId,
  userEmail,
  amount = 29900,
  onSuccess,
  onCancel,
  onError,
}: CheckoutOptions) {
  try {
    const isLoaded = await loadRazorpayScript()
    if (!isLoaded) {
      const err = 'Failed to load Razorpay SDK. Please check your internet connection.'
      if (onError) onError(err)
      else alert(err)
      return
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      const err = 'Supabase environment variables are missing.'
      if (onError) onError(err)
      else alert(err)
      return
    }

    const headers = {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json',
    }

    // 1. Create order on Supabase Edge Function
    const res = await fetch(`${supabaseUrl}/functions/v1/create-order`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ user_id: userId }),
    })

    const orderData = await res.json().catch(() => ({}))
    if (!res.ok || !orderData.order_id) {
      const err = orderData.error || orderData.detail || 'Could not initiate Razorpay payment order via Edge Function.'
      if (onError) onError(err)
      else alert(err)
      return
    }

    const keyId = orderData.key_id || 'rzp_live_TG51Msj0Z1G5Ou'

    // 2. Open Razorpay Standard Checkout modal using values returned dynamically from create-order
    const options = {
      key: keyId, // Key returned from create-order Edge Function
      amount: orderData.amount, // Amount returned from create-order
      currency: orderData.currency || 'INR', // Currency returned from create-order
      name: 'CredFlow',
      description: 'CredFlow Pro Plan Subscription',
      image: 'https://www.google.com/s2/favicons?sz=64&domain=claude.ai',
      order_id: orderData.order_id,
      prefill: {
        email: userEmail || '',
      },
      theme: {
        color: '#4F46E5',
      },
      handler: async function (response: {
        razorpay_payment_id: string
        razorpay_order_id: string
        razorpay_signature: string
      }) {
        try {
          // 3. Verify payment signature on Supabase Edge Function
          const verifyRes = await fetch(`${supabaseUrl}/functions/v1/verify-payment`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              user_id: userId,
            }),
          })

          const verifyData = await verifyRes.json().catch(() => ({}))
          if (verifyRes.ok && verifyData.ok) {
            alert('🎉 Payment successful! Welcome to CredFlow Pro.')
            if (onSuccess) onSuccess()
          } else {
            const err = verifyData.error || verifyData.detail || 'Payment verification failed.'
            if (onError) onError(err)
            else alert(err)
          }
        } catch (e: any) {
          const err = e?.message || 'Error verifying payment signature.'
          if (onError) onError(err)
          else alert(err)
        }
      },
      modal: {
        ondismiss: function () {
          console.log('[Razorpay Modal Dismissed by user]')
          if (onCancel) onCancel()
        },
      },
    }

    const rzp = new (window as any).Razorpay(options)
    rzp.on('payment.failed', function (response: any) {
      console.error('[Razorpay Payment Failed]:', response.error)
      const msg = response.error?.description || 'Payment failed. Please try again.'
      if (onError) onError(msg)
      else alert(msg)
    })
    rzp.open()
  } catch (error: any) {
    console.error('[Razorpay Checkout Error]:', error)
    const err = error?.message || 'Failed to launch checkout.'
    if (onError) onError(err)
    else alert(err)
  }
}
