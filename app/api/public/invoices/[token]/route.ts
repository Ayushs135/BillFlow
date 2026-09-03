/**
 * @file app/api/public/invoices/[token]/route.ts
 * @description Public Client Invoice Portal API
 * 
 * Flow:
 * - Resolves invoice record anonymously by unique `publicToken`.
 * - Sanitizes payload to strictly exclude password hashes, internal user IDs, and unrelated tenant data.
 * - Formats PostgreSQL business logo binary into base64 data URL for client portal viewing.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
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
        client: {
          select: {
            name: true,
            company: true,
            email: true,
            address: true,
            phone: true,
          },
        },
        items: {
          select: {
            id: true,
            description: true,
            quantity: true,
            rate: true,
            amount: true,
          },
        },
        user: {
          select: {
            name: true,
            email: true,
            settings: {
              select: {
                businessName: true,
                logoUrl: true,
                logoData: true,
                logoMimeType: true,
                currency: true,
                invoicePrefix: true,
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const effectiveStatus = getEffectiveStatus(invoice.status, invoice.dueDate);

    const userSettings = invoice.user?.settings;
    const formattedLogoUrl =
      userSettings?.logoData && userSettings?.logoMimeType
        ? `data:${userSettings.logoMimeType};base64,${Buffer.from(userSettings.logoData).toString('base64')}`
        : userSettings?.logoUrl || null;

    // Sanitize response to strictly exclude internal user IDs, hashes, or unrelated data
    const sanitizedInvoice = {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      status: invoice.status,
      effectiveStatus,
      subtotal: invoice.subtotal.toNumber(),
      tax: invoice.tax.toNumber(),
      discount: invoice.discount.toNumber(),
      total: invoice.total.toNumber(),
      notes: invoice.notes,
      publicToken: invoice.publicToken,
      createdAt: invoice.createdAt.toISOString(),
      business: {
        name: userSettings?.businessName || invoice.user?.name || 'BillFlow Invoicing',
        email: invoice.user?.email,
        logoUrl: formattedLogoUrl,
        currency: userSettings?.currency || 'USD',
      },
      client: {
        name: invoice.client.name,
        company: invoice.client.company,
        email: invoice.client.email,
        address: invoice.client.address,
        phone: invoice.client.phone,
      },
      items: invoice.items.map((it) => ({
        id: it.id,
        description: it.description,
        quantity: it.quantity.toNumber(),
        rate: it.rate.toNumber(),
        amount: it.amount.toNumber(),
      })),
    };

    return NextResponse.json({ invoice: sanitizedInvoice });
  } catch (error) {
    console.error('Error fetching public invoice:', error);
    return NextResponse.json(
      { error: 'Unable to load invoice. Please try again.' },
      { status: 500 }
    );
  }
}
