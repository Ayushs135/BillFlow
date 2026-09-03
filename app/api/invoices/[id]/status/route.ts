/**
 * @file app/api/invoices/[id]/status/route.ts
 * @description Fast Invoice Status Transition API
 * 
 * Allows atomic status updates (e.g. DRAFT -> SENT, SENT -> PAID) with ownership verification.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { getEffectiveStatus } from '@/lib/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const statusUpdateSchema = z.object({
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE']),
});

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Verify invoice belongs to user
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const body = await request.json();
    const result = statusUpdateSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid status' },
        { status: 400 }
      );
    }

    const updated = await prisma.invoice.update({
      where: { id },
      data: {
        status: result.data.status,
      },
    });

    const effectiveStatus = getEffectiveStatus(updated.status, updated.dueDate);

    return NextResponse.json({
      invoice: {
        ...updated,
        subtotal: updated.subtotal.toNumber(),
        tax: updated.tax.toNumber(),
        discount: updated.discount.toNumber(),
        total: updated.total.toNumber(),
        effectiveStatus,
      },
      message: `Invoice status updated to ${result.data.status}`,
    });
  } catch (error) {
    console.error('Error updating invoice status:', error);
    return NextResponse.json(
      { error: 'Something went wrong while updating invoice status.' },
      { status: 500 }
    );
  }
}
