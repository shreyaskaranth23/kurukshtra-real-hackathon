import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    db.prepare('SELECT 1 AS ok').get();
    const hasTestStripeKey = Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') && !/YOUR_|replace_with|your_test_key/i.test(process.env.STRIPE_SECRET_KEY));
    const hasWebhookSecret = Boolean(process.env.STRIPE_WEBHOOK_SECRET?.startsWith('whsec_') && !/YOUR_|replace_with|your_webhook_secret/i.test(process.env.STRIPE_WEBHOOK_SECRET));
    return NextResponse.json({
      status: 'ok',
      app: 'pay-per-call-agent',
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      database: 'ok',
      stripeTestCheckout: hasTestStripeKey && hasWebhookSecret ? 'configured' : 'not-configured',
      payments: 'test-mode-only',
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ status: 'error', app: 'pay-per-call-agent' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
