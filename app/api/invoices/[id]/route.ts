/**
 * @file app/api/invoices/[id]/route.ts
 * @description Single Invoice Detail, Full Edit & Atomic Deletion API
 * 
 * Handlers:
 * - GET: Retrieves full invoice details with client, line items, and reconstructed PostgreSQL logo data URL.
 * - PUT: Atomically replaces line items, recalculates financials, and updates dates/client inside a `$transaction`.
 * - DELETE: Safely deletes invoice and line items (scoped to `userId: user.id`).
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { updateInvoiceSchema } from '@/lib/validations';
import { calculateInvoiceFinancials, getEffectiveStatus } from '@/lib/money';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Strict multi-tenant query
    const invoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        client: true,
        items: {
          orderBy: { createdAt: 'asc' },
        },
        user: {
          select: {
            name: true,
            email: true,
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
    const formattedLogoUrl =
      userSettings?.logoData && userSettings?.logoMimeType
        ? `data:${userSettings.logoMimeType};base64,${Buffer.from(userSettings.logoData).toString('base64')}`
        : userSettings?.logoUrl || null;

    return NextResponse.json({
      invoice: {
        ...invoice,
        subtotal: invoice.subtotal.toNumber(),
        tax: invoice.tax.toNumber(),
        discount: invoice.discount.toNumber(),
        total: invoice.total.toNumber(),
        effectiveStatus,
        user: invoice.user
          ? {
              ...invoice.user,
              settings: userSettings
                ? {
                    id: userSettings.id,
                    userId: userSettings.userId,
                    businessName: userSettings.businessName,
                    currency: userSettings.currency,
                    invoicePrefix: userSettings.invoicePrefix,
                    logoUrl: formattedLogoUrl,
                    createdAt: userSettings.createdAt,
                    updatedAt: userSettings.updatedAt,
                  }
                : null,
            }
          : null,
        items: invoice.items.map((item) => ({
          ...item,
          quantity: item.quantity.toNumber(),
          rate: item.rate.toNumber(),
          amount: item.amount.toNumber(),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching invoice:', error);
    return NextResponse.json(
      { error: 'Something went wrong while fetching the invoice.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // 1. Verify existence and ownership
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingInvoice) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    const body = await request.json();
    const parseResult = updateInvoiceSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid invoice data' },
        { status: 400 }
      );
    }

    const {
      clientId,
      invoiceNumber,
      issueDate,
      dueDate,
      items,
      tax,
      discount,
      notes,
      status,
    } = parseResult.data;

    // 2. Verify selected client belongs to authenticated user
    const client = await prisma.client.findFirst({
      where: {
        id: clientId,
        userId: user.id,
      },
    });

    if (!client) {
      return NextResponse.json(
        { error: 'Selected client does not exist or does not belong to your account.' },
        { status: 400 }
      );
    }

    // 3. Check for invoice number collision with another invoice of the user
    if (invoiceNumber !== existingInvoice.invoiceNumber) {
      const collision = await prisma.invoice.findFirst({
        where: {
          userId: user.id,
          invoiceNumber,
          NOT: { id },
        },
      });
      if (collision) {
        return NextResponse.json(
          { error: `Invoice number "${invoiceNumber}" is already in use by another invoice.` },
          { status: 400 }
        );
      }
    }

    // 4. Recalculate financials on server
    const financials = calculateInvoiceFinancials(items, tax, discount);

    // 5. Atomic Update Transaction
    const updatedInvoice = await prisma.$transaction(async (tx) => {
      // Delete old line items
      await tx.invoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      // Update invoice and re-create line items
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          clientId,
          invoiceNumber,
          issueDate,
          dueDate,
          status: status || existingInvoice.status,
          subtotal: financials.subtotal,
          tax: financials.tax,
          discount: financials.discount,
          total: financials.total,
          notes: notes || null,
          items: {
            create: financials.items.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              rate: item.rate,
              amount: item.amount,
            })),
          },
        },
        include: {
          client: true,
          items: true,
        },
      });

      return updated;
    });

    return NextResponse.json({
      invoice: {
        ...updatedInvoice,
        subtotal: updatedInvoice.subtotal.toNumber(),
        tax: updatedInvoice.tax.toNumber(),
        discount: updatedInvoice.discount.toNumber(),
        total: updatedInvoice.total.toNumber(),
        effectiveStatus: getEffectiveStatus(updatedInvoice.status, updatedInvoice.dueDate),
        items: updatedInvoice.items.map((i) => ({
          ...i,
          quantity: i.quantity.toNumber(),
          rate: i.rate.toNumber(),
          amount: i.amount.toNumber(),
        })),
      },
      message: 'Invoice updated successfully',
    });
  } catch (error) {
    console.error('Error updating invoice:', error);
    return NextResponse.json(
      { error: 'Something went wrong while updating the invoice.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Strict multi-tenant verification before delete
    const existing = await prisma.invoice.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 });
    }

    await prisma.invoice.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: 'Invoice deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting invoice:', error);
    return NextResponse.json(
      { error: 'Something went wrong while deleting the invoice.' },
      { status: 500 }
    );
  }
}
