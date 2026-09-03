/**
 * @file app/api/public/invoices/[token]/pdf/route.ts
 * @description Public Client Vector PDF Export API
 * 
 * Generates and streams vector A4 PDF invoice documents anonymously via `publicToken`.
 * Seamlessly resolves PostgreSQL business logo binary into base64 data for embedded rendering.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { generateInvoicePdf, getLogoBase64 } from '@/lib/pdf-generator';
import { getEffectiveStatus } from '@/lib/money';

interface RouteContext {
  params: Promise<{ token: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const invoice = await prisma.invoice.findUnique({
      where: { publicToken: token },
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
    console.error('Error generating public invoice PDF:', error);
    return NextResponse.json(
      { error: 'Unable to generate the invoice PDF.' },
      { status: 500 }
    );
  }
}
