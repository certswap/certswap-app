export const config = { matcher: '/:path*' };

// Vercel Edge Middleware has no access to localStorage, so a first-visit
// language guess is set via cookie instead — only when the user hasn't
// already picked a language (no certswap_lang cookie yet).
function withLangCookie(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const hasLangCookie = new RegExp('(?:^|;\\s*)certswap_lang=').test(cookieHeader);
  if (hasLangCookie) return;

  const country = req.headers.get('x-vercel-ip-country');
  const lang = country === 'UA' ? 'ua' : 'en';
  return new Response(null, {
    headers: {
      'x-middleware-next': '1',
      'set-cookie': `certswap_lang=${lang}; Path=/; SameSite=Lax`,
    },
  });
}

export default function middleware(req) {
  const { pathname } = new URL(req.url);

  // Always accessible
  if (pathname === '/ping.html' || pathname === '/ping') return;

  const passwordEnabled = process.env.SITE_PASSWORD_ENABLED === 'true';
  if (!passwordEnabled) return withLangCookie(req);

  const basicAuth = req.headers.get('authorization');
  if (basicAuth) {
    const [user, pwd] = atob(basicAuth.split(' ')[1]).split(':');
    if (pwd === (process.env.SITE_PASSWORD || 'certswap2026')) return withLangCookie(req);
  }

  return new Response('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="CertSwap"' },
  });
}
