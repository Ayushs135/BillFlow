/**
 * @file app/api/settings/route.ts
 * @description Business Settings & Branding Preferences API
 * 
 * Handlers:
 * - GET: Retrieves the authenticated tenant's business profile, currency, prefix, and converts
 *   PostgreSQL `logoData` binary into a browser-ready base64 data URL.
 * - PUT: Validates and updates business name, currency code, invoice prefix, and manages logo binary data.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { settingsSchema } from '@/lib/validations';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find or create settings for user
    let settings = await prisma.settings.findUnique({
      where: { userId: user.id },
    });

    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          userId: user.id,
          businessName: null,
          currency: 'USD',
          invoicePrefix: 'INV-',
          logoUrl: null,
        },
      });
    }

    const formattedLogoUrl =
      settings.logoData && settings.logoMimeType
        ? `data:${settings.logoMimeType};base64,${Buffer.from(settings.logoData).toString('base64')}`
        : settings.logoUrl;

    return NextResponse.json({
      settings: {
        id: settings.id,
        userId: settings.userId,
        businessName: settings.businessName,
        currency: settings.currency,
        invoicePrefix: settings.invoicePrefix,
        logoUrl: formattedLogoUrl,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const result = settingsSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid settings data' },
        { status: 400 }
      );
    }

    const { businessName, currency, invoicePrefix, logoUrl } = result.data;

    const updateData: {
      businessName: string | null;
      currency: string;
      invoicePrefix: string;
      logoUrl: string | null;
      logoData?: Buffer | null;
      logoMimeType?: string | null;
    } = {
      businessName: businessName || null,
      currency: currency.toUpperCase(),
      invoicePrefix: invoicePrefix || 'INV-',
      logoUrl: logoUrl || null,
    };

    if (!logoUrl) {
      updateData.logoData = null;
      updateData.logoMimeType = null;
    } else if (logoUrl.startsWith('data:image/')) {
      const matches = logoUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
      if (matches) {
        updateData.logoMimeType = matches[1];
        updateData.logoData = Buffer.from(matches[2], 'base64');
      }
    }

    // Upsert settings strictly for the authenticated user
    const settings = await prisma.settings.upsert({
      where: { userId: user.id },
      update: updateData,
      create: {
        userId: user.id,
        businessName: businessName || null,
        currency: currency.toUpperCase(),
        invoicePrefix: invoicePrefix || 'INV-',
        logoUrl: logoUrl || null,
        logoData: updateData.logoData || null,
        logoMimeType: updateData.logoMimeType || null,
      },
    });

    const formattedLogoUrl =
      settings.logoData && settings.logoMimeType
        ? `data:${settings.logoMimeType};base64,${Buffer.from(settings.logoData).toString('base64')}`
        : settings.logoUrl;

    return NextResponse.json({
      settings: {
        id: settings.id,
        userId: settings.userId,
        businessName: settings.businessName,
        currency: settings.currency,
        invoicePrefix: settings.invoicePrefix,
        logoUrl: formattedLogoUrl,
        createdAt: settings.createdAt,
        updatedAt: settings.updatedAt,
      },
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
