import { NextResponse } from "next/server";


import type { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { logger } from "@/lib/logger";


export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;


    const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-nonce', nonce);


    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });


    const session = await getIronSession<SessionData>(request, response, sessionOptions);

    const isLoggedIn = session.user?.isLoggedIn || false;
    logger.debug(`[Middleware] ${request.method} ${pathname} | Authenticated: ${isLoggedIn}`);


    const isProtectedRoute =
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/api/proxmox") ||
        pathname.startsWith("/settings");

    const isAdminRoute =
        pathname.startsWith("/admin") ||
        pathname.startsWith("/api/admin") ||
        pathname.startsWith("/api/settings");

    const isLoginRoute = pathname.startsWith("/login");
    const isApiRoute = pathname.startsWith("/api/");

    // Protect admin routes
    if (isAdminRoute) {
        if (!isLoggedIn) {
            logger.warn(`[Middleware] Blocking unauthenticated access to admin route: ${pathname}`);
            if (isApiRoute) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            return NextResponse.redirect(new URL("/login", request.url));
        }

        if (!session.user?.isAdmin) {
            logger.debug(`[Middleware] Blocking non-admin access to: ${pathname}`);
            if (isApiRoute) {
                return NextResponse.json({ error: "Forbidden - Admin access required" }, { status: 403 });
            }
            return NextResponse.redirect(new URL("/dashboard", request.url));
        }
    }

    // Protect authenticated routes
    if (isProtectedRoute && !isLoggedIn) {
        logger.debug(`[Middleware] Blocking unauthenticated access to: ${pathname}`);

        if (isApiRoute) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Redirect to login for page routes
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // Redirect authenticated users away from login
    if (isLoginRoute && isLoggedIn) {
        logger.debug(`[Middleware] Redirecting authenticated user from login to dashboard`);
        return NextResponse.redirect(new URL("/dashboard", request.url));
    }


    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), browsing-topics=()');

    // Content Security Policy — use nonce for scripts, restrict connect-src to app origin
    const host = request.headers.get('host') || 'localhost';
    const connectSrc = process.env.NODE_ENV === 'production'
        ? `'self' wss://${host}`
        : `'self' ws://${host} wss://${host}`;
    const csp = `
        default-src 'self';
        script-src 'self' 'nonce-${nonce}';
        style-src 'self' 'unsafe-inline';
        img-src 'self' data: https: blob:;
        font-src 'self' data: https://fonts.gstatic.com;
        connect-src ${connectSrc};
        worker-src 'self' blob:;
        frame-ancestors 'none';
        object-src 'none';
        base-uri 'self';
    `.replace(/\s{2,}/g, ' ').trim();

    response.headers.set('Content-Security-Policy', csp);

    // Expose nonce for client-side use
    response.headers.set('x-nonce', nonce);

    // Expose CSRF token if present (set by login route)
    if (session.csrfToken) {
        response.headers.set('x-csrf-token', session.csrfToken);
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - public assets (images, etc.)
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
};
