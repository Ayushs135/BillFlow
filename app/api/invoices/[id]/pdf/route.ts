/**
 * @file app/api/invoices/[id]/pdf/route.ts
 * @description Authenticated Vector Invoice PDF Export API
 * 
 * Generates and streams vector A4 PDF invoice documents directly to authenticated users.
 * Resolves PostgreSQL-backed business logo binary into base64 data for embedding.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { generateInvoicePdf, getLogoBase64 } from '@/lib/pdf-generator';
import { getEffectiveStatus } from '@/lib/money';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;

    // Multi-tenant scoped query
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        client: true,
        items: true,
        user: {
          include: {
            settings: true,
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const effectiveStatus = getEffectiveStatus(invoice.status, invoice.dueDate);
    const userSettings = invoice.user?.settings;
    let logoData: string | null = null;
    if (userSettings?.logoData && userSettings?.logoMimeType) {
      logoData = `data:${userSettings.logoMimeType};base64,${Buffer.from(userSettings.logoData).toString('base64')}`;
    } else if (userSettings?.logoUrl) {
      logoData = await getLogoBase64(userSettings.logoUrl);
    }

    const doc = generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      effectiveStatus,
      subtotal: invoice.subtotal.toNumber(),
      tax: invoice.tax.toNumber(),
      discount: invoice.discount.toNumber(),
      total: invoice.total.toNumber(),
      notes: invoice.notes,
      currency: invoice.user?.settings?.currency || 'USD',
      businessName: invoice.user?.settings?.businessName || invoice.user?.name || 'BillFlow Invoicing',
      businessEmail: invoice.user?.email,
      logoData,
      client: {
        name: invoice.client.name,
        company: invoice.client.company,
        email: invoice.client.email,
        address: invoice.client.address,
        phone: invoice.client.phone,
      },
      items: invoice.items.map((it) => ({
        description: it.description,
        quantity: it.quantity.toNumber(),
        rate: it.rate.toNumber(),
        amount: it.amount.toNumber(),
      })),
    });

    const pdfArrayBuffer = doc.output('arraybuffer');

    return new Response(pdfArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (error) {
    console.error('Error generating authenticated invoice PDF:', error);
    return NextResponse.json(
      { error: 'Unable to generate the invoice PDF.' },
      { status: 500 }
    );
  }
}
