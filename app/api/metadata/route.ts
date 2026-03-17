
import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, SessionData } from '@/lib/session';
import { cookies } from 'next/headers';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { getClientContext, logAudit } from '@/lib/audit';
import { checkRateLimitAsync, getRateLimitIdentifier, RATE_LIMITS } from '@/lib/rate-limit';

const metadataAllowedHosts = (process.env.METADATA_ALLOWED_HOSTS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const metadataAllowedDomains = (process.env.METADATA_ALLOWED_DOMAINS || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

/**
 * Validate that a URL is safe to fetch (no SSRF).
 * Blocks private IPs, link-local, loopback, and non-HTTP(S) schemes.
 */
function isUrlSafe(urlString: string): boolean {
    try {
        const parsed = new URL(urlString);

        // Only allow http/https
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            return false;
        }

        const hostname = parsed.hostname;

        // Block loopback
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
            return false;
        }

        // Block private IPv4 ranges
        const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (ipv4Match) {
            const [, a, b] = ipv4Match.map(Number);
            if (a === 10) return false;                          // 10.0.0.0/8
            if (a === 172 && b >= 16 && b <= 31) return false;   // 172.16.0.0/12
            if (a === 192 && b === 168) return false;            // 192.168.0.0/16
            if (a === 169 && b === 254) return false;            // 169.254.0.0/16 (link-local / cloud IMDS)
            if (a === 0) return false;                           // 0.0.0.0/8
            if (a === 127) return false;                         // 127.0.0.0/8
        }

        // Block common internal hostnames
        const lowerHost = hostname.toLowerCase();
        if (lowerHost.endsWith('.internal') || lowerHost.endsWith('.local') || lowerHost.endsWith('.corp')) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
}

function isPrivateOrLocalIp(address: string): boolean {
    const ipVersion = isIP(address);
    if (ipVersion === 4) {
        const parts = address.split('.').map(Number);
        const [a, b] = parts;
        if (a === 10) return true;
        if (a === 127) return true;
        if (a === 0) return true;
        if (a === 169 && b === 254) return true;
        if (a === 172 && b >= 16 && b <= 31) return true;
        if (a === 192 && b === 168) return true;
        return false;
    }

    if (ipVersion === 6) {
        const normalized = address.toLowerCase();
        if (normalized === '::1') return true;
        if (normalized.startsWith('fe80:')) return true;
        if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
        return false;
    }

    return true;
}

type ResolvedAddress = {
    address: string;
    family: 4 | 6;
};

async function resolvePinnedPublicAddress(hostname: string): Promise<ResolvedAddress | null> {
    try {
        const results = await lookup(hostname, { all: true, verbatim: true });
        if (!results.length) return null;

        const hasUnsafeAddress = results.some((entry) => isPrivateOrLocalIp(entry.address));
        if (hasUnsafeAddress) return null;

        const first = results[0];
        const family = first.family === 6 ? 6 : 4;

        return {
            address: first.address,
            family,
        };
    } catch {
        return null;
    }
}

type PinnedHttpResponse = {
    statusCode: number;
    headers: IncomingHttpHeaders;
    body: string;
};

async function fetchPinnedHtml(url: URL, pinnedAddress: ResolvedAddress): Promise<PinnedHttpResponse> {
    return await new Promise<PinnedHttpResponse>((resolve, reject) => {
        const timeoutMs = 5000;
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;
        const maxResponseBytes = 1024 * 1024;

        const request = client.request({
            protocol: url.protocol,
            hostname: url.hostname,
            port: url.port ? Number.parseInt(url.port, 10) : (isHttps ? 443 : 80),
            path: `${url.pathname}${url.search}`,
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; LinkPreview/1.0)',
                'Accept': 'text/html,application/xhtml+xml',
                'Host': url.host,
            },
            lookup: (hostname, options, callback) => {
                const cb = typeof options === 'function' ? options : callback;
                const opts = typeof options === 'object' && options !== null ? options : {};
                
                if (opts.all) {
                    cb(null, [{ address: pinnedAddress.address, family: pinnedAddress.family }]);
                } else {
                    cb(null, pinnedAddress.address, pinnedAddress.family);
                }
            },
            servername: url.hostname,
            rejectUnauthorized: true,
            timeout: timeoutMs,
        }, (response) => {
            const statusCode = response.statusCode ?? 500;
            const contentLengthHeader = response.headers['content-length'];
            const contentLength = typeof contentLengthHeader === 'string'
                ? Number.parseInt(contentLengthHeader, 10)
                : Number.NaN;

            if (Number.isFinite(contentLength) && contentLength > maxResponseBytes) {
                request.destroy();
                response.destroy();
                reject(new Error('response_too_large'));
                return;
            }

            const chunks: Buffer[] = [];
            let totalBytes = 0;

            response.on('data', (chunk: Buffer) => {
                totalBytes += chunk.length;
                if (totalBytes > maxResponseBytes) {
                    request.destroy();
                    response.destroy();
                    reject(new Error('response_too_large'));
                    return;
                }

                chunks.push(chunk);
            });

            response.on('end', () => {
                resolve({
                    statusCode,
                    headers: response.headers,
                    body: Buffer.concat(chunks).toString('utf8'),
                });
            });
        });

        request.on('timeout', () => {
            request.destroy(new Error('request_timeout'));
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.end();
    });
}

function isHostnameAllowlisted(hostname: string): boolean {
    if (!metadataAllowedHosts.length && !metadataAllowedDomains.length) {
        return true;
    }

    const normalizedHost = hostname.toLowerCase();

    if (metadataAllowedHosts.includes(normalizedHost)) {
        return true;
    }

    return metadataAllowedDomains.some((domain) =>
        normalizedHost === domain || normalizedHost.endsWith(`.${domain}`)
    );
}

export async function GET(req: NextRequest) {
    const client = getClientContext(req);
    // Require authentication
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: 'anonymous',
            action: 'METADATA_FETCH',
            resource: 'metadata',
            status: 'FAILURE',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: 'unauthorized' },
        });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'URL required' }, { status: 400 });
    }

    const rlKey = `metadata:${session.user.username}:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.SEARCH);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: 'Too many requests' },
            { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } }
        );
    }

    // SSRF protection: validate URL before fetching
    if (!isUrlSafe(url)) {
        await logAudit({
            username: session.user.username,
            action: 'METADATA_FETCH',
            resource: 'metadata',
            status: 'WARNING',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { url, reason: 'url_not_allowed' },
        });
        return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
    }

    const parsedUrl = new URL(url);
    if (!isHostnameAllowlisted(parsedUrl.hostname)) {
        await logAudit({
            username: session.user.username,
            action: 'METADATA_FETCH',
            resource: 'metadata',
            status: 'WARNING',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { url, host: parsedUrl.hostname, reason: 'host_not_allowlisted' },
        });
        return NextResponse.json({ error: 'URL host not allowlisted' }, { status: 403 });
    }

    const pinnedAddress = await resolvePinnedPublicAddress(parsedUrl.hostname);
    if (!pinnedAddress) {
        await logAudit({
            username: session.user.username,
            action: 'METADATA_FETCH',
            resource: 'metadata',
            status: 'WARNING',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { url, host: parsedUrl.hostname, reason: 'host_resolution_blocked' },
        });
        return NextResponse.json({ error: 'URL host not allowed' }, { status: 403 });
    }

    try {
        const response = await fetchPinnedHtml(parsedUrl, pinnedAddress);

        if (response.statusCode < 200 || response.statusCode >= 300) {
            return NextResponse.json({ error: 'Failed to fetch URL' }, { status: response.statusCode });
        }

        const contentLengthHeader = response.headers['content-length'];
        const contentLength = typeof contentLengthHeader === 'string' ? Number.parseInt(contentLengthHeader, 10) : Number.NaN;
        if (Number.isFinite(contentLength) && contentLength > 1024 * 1024) {
            return NextResponse.json({ error: 'Response too large' }, { status: 413 });
        }

        const html = response.body;

        // Robust parsing
        const getMetaTag = (property: string) => {
            const regex = new RegExp(
                `<meta[^>]*?property=["']${property}["'][^>]*?content=["']([^"']+)["']|` +
                `<meta[^>]*?content=["']([^"']+)["'][^>]*?property=["']${property}["']`,
                'i'
            );
            const match = html.match(regex);
            return match ? (match[1] || match[2]) : null;
        };

        const getMetaName = (name: string) => {
            const regex = new RegExp(
                `<meta[^>]*?name=["']${name}["'][^>]*?content=["']([^"']+)["']|` +
                `<meta[^>]*?content=["']([^"']+)["'][^>]*?name=["']${name}["']`,
                'i'
            );
            const match = html.match(regex);
            return match ? (match[1] || match[2]) : null;
        }

        const title = getMetaTag('og:title') || getMetaName('title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '';
        const description = getMetaTag('og:description') || getMetaName('description') || '';
        const image = getMetaTag('og:image') || '';
        const siteName = getMetaTag('og:site_name') || '';

        await logAudit({
            username: session.user.username,
            action: 'METADATA_FETCH',
            resource: 'metadata',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                url,
                host: parsedUrl.hostname,
                titlePresent: Boolean(title),
                descriptionPresent: Boolean(description),
                imagePresent: Boolean(image),
            },
        });

        return NextResponse.json({
            title,
            description,
            image,
            siteName,
            url
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'response_too_large') {
            await logAudit({
                username: session.user.username,
                action: 'METADATA_FETCH',
                resource: 'metadata',
                status: 'FAILURE',
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { url, reason: 'response_too_large' },
            });
            return NextResponse.json({ error: 'Response too large' }, { status: 413 });
        }

        console.error('Metadata fetch error:', error);
        await logAudit({
            username: session.user.username,
            action: 'METADATA_FETCH',
            resource: 'metadata',
            status: 'FAILURE',
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { url, error: error instanceof Error ? error.message : 'unknown_error' },
        });
        return NextResponse.json({ error: 'Failed to fetch metadata' }, { status: 500 });
    }
}
