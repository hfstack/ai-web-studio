import { NextRequest, NextResponse } from 'next/server';
import { JwtService } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = JwtService.extractTokenFromHeader(authHeader || undefined);
    
    if (!token) {
      // If no Authorization header, try to get from cookie
      const cookieToken = request.cookies.get('auth-token')?.value;
      if (!cookieToken) {
        return NextResponse.json(
          { error: 'Authentication token not provided' },
          { status: 401 }
        );
      }
      
      // Delete token from cookie
      const success = await JwtService.logout(cookieToken);
      if (!success) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 400 }
        );
      }
      
      // Clear cookie
      const response = NextResponse.json({ message: 'Logout successful' });
      response.cookies.delete('auth-token');
      return response;
    }
    
    // Delete session
    const success = await JwtService.logout(token);
    if (!success) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 400 }
      );
    }
    
    // Clear cookie
    const response = NextResponse.json({ message: 'Logout successful' });
    response.cookies.delete('auth-token');
    return response;
    
  } catch (error) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}