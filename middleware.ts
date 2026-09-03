/**
 * @file middleware.ts
 * @description Next.js Edge Middleware for Route Guarding & Navigation Redirection
 * 
 * Enforces authenticated routing at the network edge:
 * - Redirects unauthenticated visits to protected routes (`/dashboard`, `/clients`, `/settings`, `/invoices`) to `/login?redirect=...`.
 * - Redirects logged-in users visiting auth pages (`/login`, `/signup`) to `/dashboard`.
 * - Leaves public routes (`/`, `/invoice/[token]`) completely open for anonymous visitors.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const SESSION_COOKIE_NAME = 'billflow_session';
const JWT_SECRET = process.env.JWT_SECRET || 'billflow-default-secret-change-in-production-key-32chars';
const secretKey = new TextEncoder().encode(JWT_SECRET);

const PROTECTED_ROUTES = ['/dashboard', '/clients', '/settings', '/invoices'];
const AUTH_ROUTES = ['/login', '/signup'];

async function isValidSession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return !!payload.userId && typeof payload.userId === 'string';
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authenticated = await isValidSession(token);

  // 1. If accessing a protected route without a valid session, redirect to /login
  const isProtected = PROTECTED_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (isProtected && !authenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. If accessing auth pages (login/signup) with an active session, redirect to /dashboard
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
  if (isAuthRoute && authenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes handle their own 401s)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
