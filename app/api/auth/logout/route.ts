/**
 * @file app/api/auth/logout/route.ts
 * @description Session Termination API
 * 
 * Clears the `billflow_session` cookie to invalidate the client's authenticated session.
 */

import { NextResponse } from 'next/server';
import { destroySession } from '@/lib/auth';

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json({ error: 'Failed to logout' }, { status: 500 });
  }
}
