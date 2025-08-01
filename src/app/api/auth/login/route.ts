import { NextRequest, NextResponse } from 'next/server';
import { AuthDatabase } from '@/lib/auth-db';
import { JwtService } from '@/lib/jwt';

export async function POST(request: NextRequest) {
  try {
    const { username, password } = await request.json();
    
    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password cannot be empty' },
        { status: 400 }
      );
    }
    
    // Verify user credentials
    const user = await AuthDatabase.verifyPassword(username, password);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      );
    }
    
    // Create user session
    const { token, expiresAt } = await JwtService.createUserSession(user.id, user.username);
    
    // Return successful response without password
    const { password: _, ...userWithoutPassword } = user;
    
    const response = NextResponse.json({
      message: 'Login successful',
      user: userWithoutPassword,
      token,
      expiresAt
    });
    
    // Set HttpOnly cookie
    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      expires: expiresAt
    });
    
    return response;
    
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}