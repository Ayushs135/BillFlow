/**
 * @file lib/auth.ts
 * @description Authentication and Stateless JWT Session Management
 * 
 * Provides cryptographic token generation and verification using `jose`,
 * secure HTTP-only cookie lifecycle management, and helper functions for
 * retrieving or enforcing authenticated user context across Server Actions and Route Handlers.
 * 
 * Security Features:
 * - Stateless HS256 JWT sessions (7-day duration).
 * - HTTP-only, Secure (in production), SameSite: 'lax' cookies.
 * - Password hashes are strictly excluded from all user query projections.
 */

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import prisma from './prisma';

const SESSION_COOKIE_NAME = 'billflow_session';
const JWT_SECRET = process.env.JWT_SECRET || 'billflow-default-secret-change-in-production-key-32chars';
const secretKey = new TextEncoder().encode(JWT_SECRET);
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

export interface SessionPayload {
  userId: string;
  [key: string]: unknown;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

/**
 * Signs a JWT with the given userId
 */
export async function signToken(payload: { userId: string }): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(secretKey);
}

/**
 * Verifies a JWT and returns the payload or null
 */
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (!payload.userId || typeof payload.userId !== 'string') {
      return null;
    }
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Creates an authenticated session for a user by generating a JWT and setting an HTTP-only cookie.
 */
export async function createSession(userId: string): Promise<string> {
  const token = await signToken({ userId });
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });

  return token;
}

/**
 * Reads and verifies the current session from the HTTP-only cookie.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

/**
 * Retrieves the currently authenticated user record from the database.
 * Explicitly excludes passwordHash for security.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    });

    return user;
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'digest' in error &&
      (error as { digest: string }).digest === 'DYNAMIC_SERVER_USAGE'
    ) {
      throw error;
    }
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}

/**
 * Requires authentication for server actions or route handlers.
 * Throws an Error if no authenticated session exists.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

/**
 * Destroys the current session by clearing the authentication cookie.
 */
export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}
