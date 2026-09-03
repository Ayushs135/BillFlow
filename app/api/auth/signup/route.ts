/**
 * @file app/api/auth/signup/route.ts
 * @description Tenant Registration & Initial Provisioning API
 * 
 * Flow:
 * 1. Validates registration data against `signupSchema`.
 * 2. Checks for unique email collisions.
 * 3. Hashes password using `bcryptjs` (cost factor 10).
 * 4. Atomically creates user record and provisions isolated default settings in a `$transaction`.
 * 5. Establishes session cookie and returns sanitized user profile.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { signupSchema } from '@/lib/validations';
import { createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = signupSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error.issues[0]?.message || 'Invalid input data' },
        { status: 400 }
      );
    }

    const { name, email, password } = result.data;

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 400 }
      );
    }

    // Hash password with bcrypt
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user and default settings in transaction
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
        },
      });

      await tx.settings.create({
        data: {
          userId: user.id,
          businessName: null,
          currency: 'USD',
          invoicePrefix: 'INV-',
        },
      });

      return user;
    });

    // Create session cookie
    await createSession(newUser.id);

    return NextResponse.json(
      {
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
        },
        message: 'Account created successfully',
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
