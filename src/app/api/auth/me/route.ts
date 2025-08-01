import { NextRequest, NextResponse } from 'next/server';
import { JwtService } from '@/lib/jwt';

export async function GET(request: NextRequest) {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    const token = JwtService.extractTokenFromHeader(authHeader);
    
    if (!token) {
      // If no Authorization header, try to get from cookie
      const cookieToken = request.cookies.get('auth-token')?.value;
      if (!cookieToken) {
        return NextResponse.json(
          { error: 'Authentication token not provided' },
          { status: 401 }
        );
      }
      
      const session = await JwtService.validateSession(cookieToken);
      if (!session) {
        return NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        );
      }
      
      const { password: _, ...userWithoutPassword } = session.user;
      return NextResponse.json({
        authenticated: true,
        user: userWithoutPassword
      });
    }
    
    const session = await JwtService.validateSession(token);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    const { password: _, ...userWithoutPassword } = session.user;
    return NextResponse.json({
      authenticated: true,
      user: userWithoutPassword
    });
    
  } catch (error) {
    console.error('Auth validation error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}