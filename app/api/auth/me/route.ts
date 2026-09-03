/**
 * @file app/api/auth/me/route.ts
 * @description Current User Profile API
 * 
 * Returns the sanitized identity profile (id, name, email, createdAt) of the currently authenticated user.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error('Error in /api/auth/me:', error);
    return NextResponse.json({ error: 'Something went wrong.' }, { status: 500 });
  }
}
