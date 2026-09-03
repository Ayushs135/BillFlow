/**
 * @file app/api/auth/login/route.ts
 * @description User Authentication & Session Establishment API
 * 
 * Verifies user credentials using bcrypt, guards against user enumeration with generic
 * error responses, and issues an HTTP-only JWT session cookie upon successful verification.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import prisma from '@/lib/prisma';
import { loginSchema } from '@/lib/validations';
import { createSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = loginSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 400 }
      );
    }

    const { email, password } = result.data;

    // Look up user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Generic error to prevent user enumeration
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Compare password with bcrypt
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      );
    }

    // Create session cookie
    await createSession(user.id);

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        message: 'Logged in successfully',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    );
  }
}
