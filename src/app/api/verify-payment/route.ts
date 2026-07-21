import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, user_id } = body

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { success: false, error: 'Missing required Razorpay payment verification fields.' },
        { status: 400 }
      )
    }

    const keySecret = process.env.RAZORPAY_KEY_SECRET
    if (!keySecret) {
      return NextResponse.json(
        { success: false, error: 'RAZORPAY_KEY_SECRET is missing on server.' },
        { status: 500 }
      )
    }

    // Algorithm: HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET)
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex')

    const isSignatureValid = generatedSignature === razorpay_signature

    if (!isSignatureValid) {
      return NextResponse.json(
        { success: false, error: 'Payment signature mismatch. Payment verification failed.' },
        { status: 400 }
      )
    }

    // Payment Verified! Upgrade user plan in Supabase user_settings
    if (user_id) {
      const { error: dbError } = await supabase
        .from('user_settings')
        .upsert(
          {
            user_id: user_id,
            plan: 'pro',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (dbError) {
        console.error('[Supabase Upgrade Error]:', dbError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Payment verified successfully. Account upgraded to Pro!',
      payment_id: razorpay_payment_id,
    })
  } catch (error: any) {
    console.error('[Razorpay Verify Payment Error]:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error during payment verification.' },
      { status: 500 }
    )
  }
}
