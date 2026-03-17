const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const tls = require('tls');
const fs = require('fs');
const path = require('path');


const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3004', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            const { pathname } = parsedUrl;

            // Serve uploaded files from public/uploads/
            if (pathname && pathname.startsWith('/uploads/')) {
                const filePath = path.resolve(path.join(__dirname, 'public', pathname));
                const publicDir = path.resolve(path.join(__dirname, 'public'));

                // Path traversal protection
                if (!filePath.startsWith(publicDir + path.sep)) {
                    res.writeHead(403);
                    res.end('Forbidden');
                    return;
                }

                if (fs.existsSync(filePath)) {
                    const ext = path.extname(filePath).toLowerCase();
                    let contentType = 'application/octet-stream';

                    if (ext === '.png') contentType = 'image/png';
                    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
                    else if (ext === '.gif') contentType = 'image/gif';
                    else if (ext === '.webp') contentType = 'image/webp';
                    else if (ext === '.svg') contentType = 'image/svg+xml';

                    const stat = fs.statSync(filePath);
                    res.writeHead(200, {
                        'Content-Type': contentType,
                        'Content-Length': stat.size,
                        'X-Content-Type-Options': 'nosniff',
                        'Content-Security-Policy': "default-src 'none'",
                    });

                    const readStream = fs.createReadStream(filePath);
                    readStream.pipe(res);
                    return;
                }
            }

            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const { setupSocketServer } = require('./lib/socket-server-js');
    const io = setupSocketServer(server);
    console.log('> Socket.IO Server initialized');


    server.on('upgrade', (req, clientSocket, head) => {
        const { pathname } = parse(req.url || '', true);

        if (pathname?.startsWith('/api/socket/io')) {
            return;
        }

        console.log(`[Server] Upgrade request for: ${pathname}`);

        if (pathname === '/api/proxy/vnc') {
            handleVncProxy(req, clientSocket, head);
        } else {

            if (app.getUpgradeHandler) {
                app.getUpgradeHandler()(req, clientSocket, head);
            } else {
                clientSocket.destroy();
            }
        }
    });

    server.listen(port, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> WebSocket proxy enabled for /api/proxy/vnc`);
        console.log(`> Proxmox URL: ${process.env.PROXMOX_URL || '(not set)'}`);
    });
});

/**
 * Handle VNC WebSocket proxy using native TLS tunnel
 * This bypasses http-proxy's problematic HTTPS WebSocket handling
 */
async function handleVncProxy(req, clientSocket, head) {
    console.log('[VNC Proxy] Handling VNC WebSocket upgrade');

    const normalizeOrigin = (value) => {
        try {
            return new URL(value).origin;
        } catch {
            return null;
        }
    };


    try {
        const { getIronSession } = await import('iron-session');
        const cookiePassword = process.env.SECRET_COOKIE_PASSWORD;
        if (!cookiePassword || cookiePassword.length < 32) {
            console.error('[VNC Proxy] SECRET_COOKIE_PASSWORD not configured');
            clientSocket.destroy();
            return;
        }
        const sessionOpts = {
            password: cookiePassword,
            cookieName: 'proxmox-wrapper-session',
            cookieOptions: { secure: process.env.USE_SECURE_COOKIE !== 'false', httpOnly: true, sameSite: 'lax', path: '/' },
        };
        const res = { getHeader: () => {}, setHeader: () => {} };
        const session = await getIronSession(req, res, sessionOpts);
        if (!session?.user?.isLoggedIn) {
            console.error('[VNC Proxy] Unauthenticated WebSocket upgrade rejected');
            clientSocket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            clientSocket.destroy();
            return;
        }
        console.log(`[VNC Proxy] Authenticated user: ${session.user.username}`);


        const checkUrl = new URL(req.url || '', `http://${req.headers.host}`);
        const checkVmid = checkUrl.searchParams.get('vmid');

        if (checkVmid && !session.user.isAdmin) {
            try {
                const hasAccess = await checkVMAccessInline(
                    session.user.username,
                    session.user.groups || [],
                    checkVmid
                );
                if (!hasAccess) {
                    console.error(`[VNC Proxy] User ${session.user.username} denied access to VM ${checkVmid}`);
                    clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                    clientSocket.destroy();
                    return;
                }
                console.log(`[VNC Proxy] Access granted for user ${session.user.username} to VM ${checkVmid}`);
            } catch (accessErr) {
                console.error('[VNC Proxy] VM access check failed:', accessErr.message);
                clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                clientSocket.destroy();
                return;
            }
        }
    } catch (authErr) {
        console.error('[VNC Proxy] Auth check failed:', authErr.message);
        clientSocket.destroy();
        return;
    }


    const originHeader = req.headers['origin'];
    const host = req.headers['host'];
    const allowMissingOrigin = process.env.ALLOW_MISSING_WS_ORIGIN === 'true';
    const originCandidates = (process.env.ALLOWED_WS_ORIGINS || process.env.APP_ORIGIN || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => normalizeOrigin(entry))
        .filter(Boolean);

    if (!originHeader) {
        if (!allowMissingOrigin) {
            console.error('[VNC Proxy] Missing Origin header; rejecting by policy');
            clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            clientSocket.destroy();
            return;
        }
    } else {
        const requestOrigin = normalizeOrigin(originHeader);
        if (!requestOrigin) {
            console.error('[VNC Proxy] Invalid origin header');
            clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            clientSocket.destroy();
            return;
        }

        if (originCandidates.length > 0) {
            const isAllowedOrigin = originCandidates.includes(requestOrigin);
            if (!isAllowedOrigin) {
                console.error(`[VNC Proxy] Origin not in allowlist: ${requestOrigin}`);
                clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                clientSocket.destroy();
                return;
            }
        } else {
            const requestOriginHost = new URL(requestOrigin).host;
            if (requestOriginHost !== host) {
                console.error(`[VNC Proxy] Origin mismatch: ${requestOriginHost} !== ${host}`);
                clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
                clientSocket.destroy();
                return;
            }
        }
    }


    const urlObj = new URL(req.url || '', `http://${req.headers.host}`);
    const node = urlObj.searchParams.get('node');
    const type = urlObj.searchParams.get('type');
    const vmid = urlObj.searchParams.get('vmid');
    const portParam = urlObj.searchParams.get('port');
    const ticket = urlObj.searchParams.get('ticket');

    if (!node || !type || !vmid || !portParam || !ticket) {
        console.error("[VNC Proxy] Missing required VNC parameters");
        clientSocket.destroy();
        return;
    }


    const safeIdPattern = /^[a-zA-Z0-9@._-]+$/;
    if (!safeIdPattern.test(node) || !safeIdPattern.test(vmid)) {
        console.error('[VNC Proxy] Invalid node or vmid parameter');
        clientSocket.destroy();
        return;
    }
    if (!['qemu', 'lxc'].includes(type)) {
        console.error('[VNC Proxy] Invalid type parameter');
        clientSocket.destroy();
        return;
    }
    const portNum = parseInt(portParam, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        console.error('[VNC Proxy] Invalid port parameter');
        clientSocket.destroy();
        return;
    }


    const proxmoxUrl = new URL(process.env.PROXMOX_URL || '');
    const proxmoxHost = proxmoxUrl.hostname;
    const proxmoxPort = parseInt(proxmoxUrl.port || '8006', 10);

    // URL-encode the ticket (contains +, /, = chars)
    const wsPath = `/api2/json/nodes/${node}/${type}/${vmid}/vncwebsocket?port=${portParam}&vncticket=${encodeURIComponent(ticket)}`;

    console.log(`[VNC Proxy] Connecting to Proxmox at ${proxmoxHost}:${proxmoxPort}`);


    const rejectUnauthorized = process.env.PROXMOX_SSL_INSECURE !== 'true';
    const proxmoxSocket = tls.connect({
        host: proxmoxHost,
        port: proxmoxPort,
        rejectUnauthorized,
    }, () => {
        console.log('[VNC Proxy] TLS connection established to Proxmox');

        const tokenId = process.env.PROXMOX_TOKEN_ID || '';
        const tokenSecret = process.env.PROXMOX_TOKEN_SECRET || '';
        const authHeader = `PVEAPIToken=${tokenId}=${tokenSecret}`;


        const upgradeRequest = [
            `GET ${wsPath} HTTP/1.1`,
            `Host: ${proxmoxHost}:${proxmoxPort}`,
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Key: ${req.headers['sec-websocket-key']}`,
            `Sec-WebSocket-Version: ${req.headers['sec-websocket-version'] || '13'}`,
            `Authorization: ${authHeader}`,
            '', // Empty line to end headers
            '', // Extra empty line for HTTP/1.1
        ].join('\r\n');

        console.log('[VNC Proxy] Sending WebSocket upgrade request to Proxmox');


        proxmoxSocket.write(upgradeRequest);


        if (head && head.length > 0) {
            proxmoxSocket.write(head);
        }


        let responseBuffer = Buffer.alloc(0);
        let headersParsed = false;

        proxmoxSocket.on('data', (data) => {
            if (!headersParsed) {

                responseBuffer = Buffer.concat([responseBuffer, data]);
                const headerEnd = responseBuffer.indexOf('\r\n\r\n');

                if (headerEnd !== -1) {
                    headersParsed = true;
                    const headers = responseBuffer.slice(0, headerEnd).toString();
                    const body = responseBuffer.slice(headerEnd + 4);

                    console.log('[VNC Proxy] Received response from Proxmox:');
                    console.log(headers.split('\r\n')[0]); // Log status line


                    if (headers.includes('101') && headers.toLowerCase().includes('upgrade')) {
                        console.log('[VNC Proxy] WebSocket upgrade successful!');


                        clientSocket.write(`HTTP/1.1 101 Switching Protocols\r\n`);
                        clientSocket.write(`Upgrade: websocket\r\n`);
                        clientSocket.write(`Connection: Upgrade\r\n`);


                        const acceptMatch = headers.match(/Sec-WebSocket-Accept:\s*([^\r\n]+)/i);
                        if (acceptMatch) {
                            clientSocket.write(`Sec-WebSocket-Accept: ${acceptMatch[1]}\r\n`);
                        }
                        clientSocket.write(`\r\n`);


                        if (body.length > 0) {
                            clientSocket.write(body);
                        }


                        proxmoxSocket.pipe(clientSocket);
                        clientSocket.pipe(proxmoxSocket);

                        console.log('[VNC Proxy] WebSocket tunnel established');
                    } else {
                        console.error('[VNC Proxy] Proxmox rejected WebSocket upgrade:', headers.split('\r\n')[0]);
                        clientSocket.end();
                        proxmoxSocket.end();
                    }
                }
            }

        });
    });


    proxmoxSocket.on('error', (err) => {
        console.error('[VNC Proxy] TLS connection error:', err.message);
        if (!clientSocket.destroyed) {
            clientSocket.destroy();
        }
    });


    proxmoxSocket.on('close', () => {
        console.log('[VNC Proxy] Proxmox socket closed');
        if (!clientSocket.destroyed) {
            clientSocket.end();
        }
    });


    clientSocket.on('error', (err) => {
        console.error('[VNC Proxy] Client socket error:', err.message);
        if (!proxmoxSocket.destroyed) {
            proxmoxSocket.destroy();
        }
    });


    clientSocket.on('close', () => {
        console.log('[VNC Proxy] Client socket closed');
        if (!proxmoxSocket.destroyed) {
            proxmoxSocket.end();
        }
    });
}

/**
 * Lightweight VM access check for server.js (CJS context).
 * Mirrors the logic in lib/acl.ts checkVMAccess() but calls the Proxmox API directly.
 */
async function checkVMAccessInline(username, userGroups, vmid) {
    const proxmoxUrl = process.env.PROXMOX_URL;
    const tokenId = process.env.PROXMOX_TOKEN_ID;
    const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;

    if (!proxmoxUrl || !tokenId || !tokenSecret) {
        console.error('[VNC Access Check] Missing Proxmox credentials');
        return false;
    }

    const authHeader = `PVEAPIToken=${tokenId}=${tokenSecret}`;
    const actionRoles = new Set(['Administrator', 'PVEAdmin', 'PVEVMAdmin', 'PVEVMUser']);
    const fetchOpts = {
        headers: { 'Authorization': authHeader },
    };


    if (process.env.PROXMOX_SSL_INSECURE === 'true') {
        const https = require('https');
        fetchOpts.agent = new https.Agent({ rejectUnauthorized: false });
    }


    const groupVariants = new Set();
    const envRealm = process.env.PROXMOX_USER_REALM;
    for (const group of (userGroups || [])) {
        if (!group) continue;
        const raw = group.trim();
        if (raw) {
            groupVariants.add(raw);
            groupVariants.add(raw.toLowerCase());
        }

        const cnMatch = group.match(/^CN=([^,]+)/i);
        const name = cnMatch ? cnMatch[1].trim() : raw;
        if (name) {
            groupVariants.add(name);
            groupVariants.add(name.toLowerCase());
            if (envRealm && !name.endsWith(`-${envRealm}`)) {
                const withRealm = `${name}-${envRealm}`;
                groupVariants.add(withRealm);
                groupVariants.add(withRealm.toLowerCase());
            }
        }
    }


    const [aclRes, resourcesRes] = await Promise.all([
        fetch(`${proxmoxUrl}/api2/json/access/acl`, fetchOpts),
        fetch(`${proxmoxUrl}/api2/json/cluster/resources?type=vm`, fetchOpts),
    ]);

    if (!aclRes.ok || !resourcesRes.ok) {
        console.error('[VNC Access Check] Failed to fetch from Proxmox API');
        return false;
    }

    const aclData = await aclRes.json();
    const resourcesData = await resourcesRes.json();
    const acls = aclData.data || [];
    const resources = resourcesData.data || [];


    const vmPath = `/vms/${vmid}`;
    const hasDirectAccess = acls.some(acl => {
        if (acl.path !== vmPath) return false;
        if (!actionRoles.has(acl.roleid)) return false;
        if (acl.type === 'user') {
            const aclUser = acl.ugid.split('@')[0];
            return aclUser === username || acl.ugid === username;
        }
        if (acl.type === 'group') {
            return groupVariants.has(acl.ugid) || groupVariants.has(acl.ugid.toLowerCase());
        }
        return false;
    });

    if (hasDirectAccess) return true;


    const vmResource = resources.find(r =>
        r.id === `qemu/${vmid}` || r.id === `lxc/${vmid}` || String(r.vmid) === String(vmid)
    );

    if (vmResource && vmResource.pool) {
        const poolId = vmResource.pool;


        if (poolId.startsWith(`DEV_${username}_`)) return true;


        for (const group of (userGroups || [])) {
            if (!group) continue;
            const cnMatch = group.match(/^CN=([^,]+)/i);
            const name = (cnMatch ? cnMatch[1] : group).trim().replace(/[^a-zA-Z0-9\-_]/g, '_');
            if (name && poolId.startsWith(`DEV_${name}_`)) return true;
            if (envRealm && !name.endsWith(`-${envRealm}`)) {
                const withRealm = `${name}-${envRealm}`;
                if (poolId.startsWith(`DEV_${withRealm}_`)) return true;
            }
        }


        const poolPath = `/pool/${poolId}`;
        const hasPoolAccess = acls.some(acl => {
            if (acl.path !== poolPath) return false;
            if (!actionRoles.has(acl.roleid)) return false;
            if (acl.type === 'user') {
                const aclUser = acl.ugid.split('@')[0];
                return aclUser === username || acl.ugid === username;
            }
            if (acl.type === 'group') {
                return groupVariants.has(acl.ugid) || groupVariants.has(acl.ugid.toLowerCase());
            }
            return false;
        });

        if (hasPoolAccess) return true;
    }

    return false;
}
