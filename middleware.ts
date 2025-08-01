import { NextRequest, NextResponse } from 'next/server';
import { JwtService } from '@/lib/jwt';

export async function middleware(request: NextRequest) {
  // 获取当前路径
  const { pathname } = request.nextUrl;
  
  // 不需要认证的路径
  const publicPaths = ['/login', '/api/auth/login'];
  
  // 如果是公开路径，直接放行
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }
  
  // 如果是API路径（除了认证相关的），检查token
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth/')) {
    const authHeader = request.headers.get('authorization');
    const token = JwtService.extractTokenFromHeader(authHeader);
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication token not provided' },
        { status: 401 }
      );
    }
    
    const session = await JwtService.validateSession(token);
    if (!session) {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }
    
    // 在请求头中添加用户信息，供后续API使用
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', session.user.id.toString());
    requestHeaders.set('x-user-username', session.user.username);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }
  
  // 如果是页面路径，检查cookie中的token
  if (!pathname.startsWith('/api/')) {
    const token = request.cookies.get('auth-token')?.value;
    
    // 如果没有token且不是登录页面，重定向到登录页面
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    
    // 验证token
    const session = await JwtService.validateSession(token);
    if (!session) {
      // 删除无效的cookie
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth-token');
      return response;
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径除了:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};