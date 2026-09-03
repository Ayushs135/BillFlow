/**
 * @file app/api/public/invoices/[token]/pay/route.ts
 * @description Public Invoice Payment Simulation & Atomic Status Transition API
 * 
 * Features:
 * - Double-payment protection rejecting attempts on settled invoices.
 * - Concurrency protection via conditional `updateMany` (`status: { not: 'PAID' }`).
 * - Atomically transitions invoice status to `PAID`.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // 1. Check if invoice exists
    const invoice = await prisma.invoice.findUnique({
      where: { publicToken: token },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        total: true,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    // 2. Reject if already paid
    if (invoice.status === 'PAID') {
      return NextResponse.json(
        { error: 'This invoice has already been paid.' },
        { status: 400 }
      );
    }

    // 3. Atomically update status to PAID with concurrency protection
    // updateMany with status != PAID ensures that two simultaneous pay requests cannot both succeed
    const updateResult = await prisma.invoice.updateMany({
      where: {
        publicToken: token,
        status: { not: 'PAID' },
      },
      data: {
        status: 'PAID',
      },
    });

    if (updateResult.count === 0) {
      return NextResponse.json(
        { error: 'This invoice has already been paid.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Invoice ${invoice.invoiceNumber} has been successfully paid.`,
      status: 'PAID',
    });
  } catch (error) {
    console.error('Error processing simulated payment:', error);
    return NextResponse.json(
      { error: 'Unable to process payment. Please try again.' },
      { status: 500 }
    );
  }
}
