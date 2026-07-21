import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'

export async function POST(req: Request) {
  try {
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_KEY_SECRET

    if (!keyId || !keySecret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay credentials missing in server environment.' },
        { status: 500 }
      )
    }

    const body = await req.json().catch(() => ({}))
    const amount = Number(body.amount) || 29900 // Default Pro plan: ₹299 (29900 paise)
    const currency = body.currency || 'INR'

    if (amount < 100) {
      return NextResponse.json(
        { success: false, error: 'Amount must be at least 100 paise (₹1).' },
        { status: 400 }
      )
    }

    const instance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    const options = {
      amount,
      currency,
      receipt: `receipt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      notes: {
        plan: 'Pro Plan',
      },
    }

    const order = await instance.orders.create(options)

    return NextResponse.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || keyId,
    })
  } catch (error: any) {
    console.error('[Razorpay Create Order Error]:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to create Razorpay order.' },
      { status: 500 }
    )
  }
}
