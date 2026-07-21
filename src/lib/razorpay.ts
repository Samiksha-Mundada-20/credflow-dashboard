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

    // 1. Create order on backend
    const res = await fetch('/api/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount }),
    })

    const orderData = await res.json()
    if (!res.ok || !orderData.success) {
      const err = orderData.error || 'Could not initiate Razorpay payment order.'
      if (onError) onError(err)
      else alert(err)
      return
    }

    // 2. Open Razorpay Standard Checkout modal
    const options = {
      key: orderData.key_id || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: orderData.amount,
      currency: orderData.currency,
      name: 'CredFlow',
      description: 'CredFlow Pro Plan Subscription',
      image: 'https://www.google.com/s2/favicons?sz=64&domain=claude.ai',
      order_id: orderData.order_id,
      prefill: {
        email: userEmail || '',
      },
      theme: {
        color: '#FFCC00',
      },
      handler: async function (response: {
        razorpay_payment_id: string
        razorpay_order_id: string
        razorpay_signature: string
      }) {
        try {
          // 3. Verify payment signature on backend
          const verifyRes = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              user_id: userId,
            }),
          })

          const verifyData = await verifyRes.json()
          if (verifyRes.ok && verifyData.success) {
            alert('🎉 Payment successful! Welcome to CredFlow Pro.')
            if (onSuccess) onSuccess()
          } else {
            const err = verifyData.error || 'Payment verification failed.'
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
