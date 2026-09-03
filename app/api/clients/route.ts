/**
 * @file app/api/clients/route.ts
 * @description Multi-Tenant Client Directory & Creation API
 * 
 * Handlers:
 * - GET: Returns the user's client list with server-side case-insensitive searching across name, company, and email.
 * - POST: Validates and creates a new client strictly scoped to the authenticated `session.userId`.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { clientSchema } from '@/lib/validations';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const searchQuery = searchParams.get('search')?.trim();

    // Multi-tenant scoped query
    const whereClause: {
      userId: string;
      OR?: Array<{
        name?: { contains: string; mode: 'insensitive' };
        email?: { contains: string; mode: 'insensitive' };
        company?: { contains: string; mode: 'insensitive' };
      }>;
    } = {
      userId: user.id,
    };

    if (searchQuery) {
      whereClause.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { email: { contains: searchQuery, mode: 'insensitive' } },
        { company: { contains: searchQuery, mode: 'insensitive' } },
      ];
    }

    const clients = await prisma.client.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        address: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { invoices: true },
        },
      },
    });

    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
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
    const result = clientSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid client data' },
        { status: 400 }
      );
    }

    const { name, email, company, address, phone } = result.data;

    // Multi-tenant creation: userId strictly enforced from session
    const client = await prisma.client.create({
      data: {
        userId: user.id,
        name,
        email: email || '',
        company: company || null,
        address: address || null,
        phone: phone || null,
      },
    });

    return NextResponse.json(
      { client, message: 'Client created successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating client:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
