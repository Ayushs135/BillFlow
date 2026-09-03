/**
 * @file app/api/clients/[id]/route.ts
 * @description Single Client Detail, Update & Cascade Deletion API
 * 
 * Handlers:
 * - GET: Retrieves single client details with associated invoice count (404 if not owned).
 * - PUT: Validates and updates client details (404 if not owned).
 * - DELETE: Deletes client with cascade deletion warning/handling (404 if not owned).
 * 
 * Security: Multi-tenant scoping (`userId: user.id`) strictly enforced on all operations.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { clientSchema } from '@/lib/validations';

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

    // Strict multi-tenant verification
    const client = await prisma.client.findFirst({
      where: {
        id,
        userId: user.id,
      },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    return NextResponse.json({ client });
  } catch (error) {
    console.error('Error fetching client:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
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

    // Strict multi-tenant verification before update
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingClient) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    const body = await request.json();
    const result = clientSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid client data' },
        { status: 400 }
      );
    }

    const { name, email, company, address, phone } = result.data;

    const updatedClient = await prisma.client.update({
      where: {
        id,
      },
      data: {
        name,
        email: email || '',
        company: company || null,
        address: address || null,
        phone: phone || null,
      },
    });

    return NextResponse.json({
      client: updatedClient,
      message: 'Client updated successfully',
    });
  } catch (error) {
    console.error('Error updating client:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
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

    // Strict multi-tenant verification before deletion
    const existingClient = await prisma.client.findFirst({
      where: {
        id,
        userId: user.id,
      },
    });

    if (!existingClient) {
      return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
    }

    await prisma.client.delete({
      where: {
        id,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Client deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting client:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
