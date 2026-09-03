/**
 * @file app/api/invoices/next-number/route.ts
 * @description Next Invoice Number Preview API
 * 
 * Peeks the upcoming sequential invoice number for the authenticated tenant without consuming/incrementing the counter.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { peekNextInvoiceNumber } from '@/lib/invoice-number';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const nextInvoiceNumber = await peekNextInvoiceNumber(user.id);
    return NextResponse.json({ nextInvoiceNumber });
  } catch (error) {
    console.error('Error getting next invoice number:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
