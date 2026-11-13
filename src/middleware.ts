import { NextResponse,type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const isDev = process.env.NODE_ENV!=='production';
  const csp = ["default-src 'self'",`script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com","font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https:",`connect-src 'self'${isDev ? ' ws: wss:' : ''}`,"object-src 'none'","base-uri 'self'","form-action 'self'","frame-ancestors 'none'"].join('; ');
  const headers = new Headers(request.headers);
  headers.set('x-nonce',nonce); headers.set('Content-Security-Policy',csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set('Content-Security-Policy',csp);
  response.headers.set('X-Content-Type-Options','nosniff');
  const isRecovery = request.nextUrl.pathname==='/forgot-password' || request.nextUrl.pathname.startsWith('/reset-password');
  response.headers.set('Referrer-Policy',isRecovery ? 'no-referrer' : 'strict-origin-when-cross-origin');
  if (isRecovery) response.headers.set('Cache-Control','no-store');
  response.headers.set('Permissions-Policy','geolocation=(), camera=(), microphone=()');
  if (!isDev) response.headers.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  return response;
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };