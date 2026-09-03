/**
 * @file app/api/invoices/route.ts
 * @description Multi-Tenant Invoice Listing & Atomic Invoice Creation API
 * 
 * Handlers:
 * - GET: Returns filtered, searched, sorted, and paginated invoice records for the current user tenant.
 * - POST: Atomically reserves consecutive invoice number, validates client ownership, calculates
 *   exact financials, and inserts invoice + line items inside a database `$transaction`.
 */

import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { createInvoiceSchema } from '@/lib/validations';
import { calculateInvoiceFinancials, getEffectiveStatus } from '@/lib/money';
import { reserveNextInvoiceNumber } from '@/lib/invoice-number';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const statusParam = searchParams.get('status')?.trim().toUpperCase();
    const clientId = searchParams.get('clientId')?.trim();
    const sortParam = searchParams.get('sort')?.trim() || 'newest';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10)));

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    // Multi-tenant scoped where clause
    const where: Prisma.InvoiceWhereInput = {
      userId: user.id,
    };

    // 1. Client filter (strictly validated for tenant)
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId, userId: user.id },
      });
      if (!client) {
        return NextResponse.json({
          invoices: [],
          pagination: { page: 1, pageSize, totalCount: 0, totalPages: 0 },
        });
      }
      where.clientId = clientId;
    }

    // 2. Search filter
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { client: { name: { contains: search, mode: 'insensitive' } } },
        { client: { company: { contains: search, mode: 'insensitive' } } },
        { client: { email: { contains: search, mode: 'insensitive' } } },
      ];
    }

    // 3. Status filter with real-time overdue handling
    if (statusParam && statusParam !== 'ALL') {
      if (statusParam === 'OVERDUE') {
        where.AND = [
          { status: { not: 'PAID' } },
          { dueDate: { lt: startOfToday } },
        ];
      } else if (statusParam === 'PAID') {
        where.status = 'PAID';
      } else if (statusParam === 'SENT') {
        where.AND = [
          { status: 'SENT' },
          { dueDate: { gte: startOfToday } },
        ];
      } else if (statusParam === 'DRAFT') {
        where.AND = [
          { status: 'DRAFT' },
          { dueDate: { gte: startOfToday } },
        ];
      }
    }

    // 4. Safe whitelist-based sorting
    let orderBy: Prisma.InvoiceOrderByWithRelationInput = { createdAt: 'desc' };
    switch (sortParam) {
      case 'oldest':
        orderBy = { createdAt: 'asc' };
        break;
      case 'dueDate':
        orderBy = { dueDate: 'asc' };
        break;
      case 'amountHigh':
        orderBy = { total: 'desc' };
        break;
      case 'amountLow':
        orderBy = { total: 'asc' };
        break;
      case 'newest':
      default:
        orderBy = { createdAt: 'desc' };
        break;
    }

    // 5. Total count and pagination queries
    const [totalCount, invoices] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: {
            select: {
              id: true,
              name: true,
              company: true,
              email: true,
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
        },
      }),
    ]);

    // 6. Map invoices with effective status computation
    const transformedInvoices = invoices.map((inv) => ({
      ...inv,
      subtotal: inv.subtotal.toNumber(),
      tax: inv.tax.toNumber(),
      discount: inv.discount.toNumber(),
      total: inv.total.toNumber(),
      effectiveStatus: getEffectiveStatus(inv.status, inv.dueDate),
      items: inv.items.map((item) => ({
        ...item,
        quantity: item.quantity.toNumber(),
        rate: item.rate.toNumber(),
        amount: item.amount.toNumber(),
      })),
    }));

    const totalPages = Math.ceil(totalCount / pageSize);

    return NextResponse.json({
      invoices: transformedInvoices,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
      },
    });
  } catch (error) {
    console.error('Error in GET /api/invoices:', error);
    return NextResponse.json(
      { error: 'Something went wrong while fetching invoices.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parseResult = createInvoiceSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: parseResult.error.issues[0]?.message || 'Invalid invoice data' },
        { status: 400 }
      );
    }

    const {
      clientId,
      invoiceNumber: providedNumber,
      issueDate,
      dueDate,
      items,
      tax,
      discount,
      notes,
      status,
    } = parseResult.data;

    // 1. Verify Client belongs to authenticated user
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

    // 2. Recalculate all monetary values on the server using exact Decimal logic
    const financials = calculateInvoiceFinancials(items, tax, discount);

    // 3. Atomic Transaction: Reserve Invoice Number, Create Invoice and Line Items
    const newInvoice = await prisma.$transaction(async (tx) => {
      let finalInvoiceNumber = providedNumber?.trim();

      if (!finalInvoiceNumber) {
        // Concurrency-safe atomic number reservation
        const reserved = await reserveNextInvoiceNumber(tx, user.id);
        finalInvoiceNumber = reserved.invoiceNumber;
      } else {
        // Verify custom number is not already taken by this user
        const existing = await tx.invoice.findFirst({
          where: {
            userId: user.id,
            invoiceNumber: finalInvoiceNumber,
          },
        });
        if (existing) {
          throw new Error(`Invoice number "${finalInvoiceNumber}" is already in use.`);
        }
      }

      const invoice = await tx.invoice.create({
        data: {
          userId: user.id,
          clientId: client.id,
          invoiceNumber: finalInvoiceNumber,
          issueDate,
          dueDate,
          status: status || 'DRAFT',
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

      return invoice;
    });

    return NextResponse.json(
      {
        invoice: {
          ...newInvoice,
          subtotal: newInvoice.subtotal.toNumber(),
          tax: newInvoice.tax.toNumber(),
          discount: newInvoice.discount.toNumber(),
          total: newInvoice.total.toNumber(),
          effectiveStatus: getEffectiveStatus(newInvoice.status, newInvoice.dueDate),
          items: newInvoice.items.map((i) => ({
            ...i,
            quantity: i.quantity.toNumber(),
            rate: i.rate.toNumber(),
            amount: i.amount.toNumber(),
          })),
        },
        message: 'Invoice created successfully',
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    console.error('Error creating invoice:', error);
    const message = error instanceof Error ? error.message : 'Something went wrong while creating the invoice.';
    const status = error instanceof Error && error.message.includes('already in use') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
