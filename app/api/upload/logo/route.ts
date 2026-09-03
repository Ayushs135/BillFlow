/**
 * @file app/api/upload/logo/route.ts
 * @description Multi-Tenant Logo Upload & PostgreSQL Binary Storage API
 * 
 * Flow:
 * 1. Validates authenticated session (401 if unauthorized).
 * 2. Enforces maximum file size of 2 MB.
 * 3. Inspects binary magic bytes for PNG, JPEG, and WebP (rejects spoofed file extensions).
 * 4. Converts raw file bytes to Buffer and persists directly to PostgreSQL (`Settings.logoData` BYTEA).
 * 5. Reconstructs data URL for frontend live preview and returns success payload.
 * 
 * Security: Zero disk writes; tenant isolation strictly binds updates to `session.userId`.
 */

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

function detectImageType(buffer: Buffer): 'png' | 'jpeg' | 'webp' | null {
  if (buffer.length < 12) return null;

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  // JPEG magic bytes: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  // WebP magic bytes: RIFF....WEBP (0..3 is "RIFF", 8..11 is "WEBP")
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'webp';
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: 'No image file provided.' },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File size exceeds the 2MB limit. Please upload a smaller image.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const imageType = detectImageType(buffer);
    if (!imageType) {
      return NextResponse.json(
        { error: 'Unsupported file format. Only PNG, JPEG, and WebP images are allowed.' },
        { status: 400 }
      );
    }

    const mimeType =
      imageType === 'png'
        ? 'image/png'
        : imageType === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;

    // Persist directly to PostgreSQL settings table for authenticated user
    await prisma.settings.upsert({
      where: { userId: user.id },
      update: {
        logoData: buffer,
        logoMimeType: mimeType,
        logoUrl: dataUrl,
      },
      create: {
        userId: user.id,
        logoData: buffer,
        logoMimeType: mimeType,
        logoUrl: dataUrl,
      },
    });

    return NextResponse.json({
      url: dataUrl,
      message: 'Logo uploaded and saved to PostgreSQL successfully',
    });
  } catch (error) {
    console.error('Error uploading logo to PostgreSQL:', error);
    return NextResponse.json(
      { error: 'Failed to upload logo image. Please try again.' },
      { status: 500 }
    );
  }
}
