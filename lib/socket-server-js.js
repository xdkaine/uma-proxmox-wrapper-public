const { Server: SocketIOServer } = require("socket.io");
// const { getIronSession } = require("iron-session"); // ESM - moved to dynamic import
// const { sessionOptions } = require("./session"); // TS - moved to inline config
const crypto = require("crypto");

const { PrismaClient } = require("@prisma/client");

// Use singleton pattern to avoid connection pool exhaustion
const globalForPrisma = globalThis;
const prisma = globalForPrisma.__prisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;

// Map to track online users: username -> Set of socket IDs
const onlineUsers = new Map();

// --- INLINE SESSION CONFIG (Duplicate of lib/session.ts logic) ---
// We duplicate this because this file is CJS running in Node, and cannot import .ts files directly.
const cookiePassword = process.env.SECRET_COOKIE_PASSWORD;
const rawTTL = process.env.SESSION_TTL;
const sessionTTL = rawTTL ? parseInt(rawTTL, 10) : 28800;
const useSecureCookie = process.env.USE_SECURE_COOKIE === 'false' ? false : true;
const cookieDomain = process.env.COOKIE_DOMAIN !== undefined
    ? (process.env.COOKIE_DOMAIN === '' ? undefined : process.env.COOKIE_DOMAIN)
    : undefined;

const sessionOptions = {
    password: cookiePassword,
    cookieName: "proxmox-wrapper-session",
    ttl: sessionTTL,
    cookieOptions: {
        secure: useSecureCookie,
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        domain: cookieDomain,
    },
};
// -------------------------------------------------------------

const { z } = require("zod");
const DOMPurify = require("isomorphic-dompurify");

// Validation Schemas
const SendMessageSchema = z.object({
    to: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    content: z.string().min(1).max(5000),
}).refine(data => data.to || data.groupId, {
    message: "Either 'to' or 'groupId' must be provided",
});

const EditMessageSchema = z.object({
    messageId: z.string().min(1),
    content: z.string().min(1).max(5000),
});

const DeleteMessageSchema = z.object({
    messageId: z.string().min(1),
});

const ReactionSchema = z.object({
    messageId: z.string().min(1),
    emoji: z.string().emoji(), // Ensure it's an emoji
});

const MAX_WHITEBOARD_STATE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_SOCKET_EVENT_PAYLOAD_BYTES = 128 * 1024; // 128KB

const SOCKET_RATE_LIMITS = {
    draw_stroke: { max: 1000, windowMs: 10 * 1000 },
    send_message: { max: 40, windowMs: 60 * 1000 },
    edit_message: { max: 30, windowMs: 60 * 1000 },
    delete_message: { max: 30, windowMs: 60 * 1000 },
    add_reaction: { max: 80, windowMs: 60 * 1000 },
    typing: { max: 120, windowMs: 10 * 1000 },
    mark_read: { max: 120, windowMs: 60 * 1000 },
    join_group: { max: 30, windowMs: 60 * 1000 },
    draw_save: { max: 20, windowMs: 60 * 1000 },
    draw_clear: { max: 20, windowMs: 60 * 1000 },
};

function getPayloadSize(data) {
    try {
        return Buffer.byteLength(JSON.stringify(data ?? null), "utf8");
    } catch {
        return MAX_SOCKET_EVENT_PAYLOAD_BYTES + 1;
    }
}

function getSocketClientContext(socket) {
    const headers = socket?.handshake?.headers || {};
    const xForwardedFor = typeof headers["x-forwarded-for"] === "string" ? headers["x-forwarded-for"] : "";
    const ipAddress = xForwardedFor.split(",")[0]?.trim() || headers["x-real-ip"] || socket?.handshake?.address || "unknown";
    const userAgent = headers["user-agent"] || "unknown";
    return { ipAddress, userAgent };
}

function payloadHash(payload) {
    try {
        return crypto.createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
    } catch {
        return "hash_error";
    }
}

function toFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function summarizeStrokeSegment(data) {
    const points = Array.isArray(data?.points) ? data.points : [];
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const normalizedPoints = points
        .map((point) => ({ x: toFiniteNumber(point?.x), y: toFiniteNumber(point?.y) }))
        .filter((point) => point.x !== null && point.y !== null);

    for (const point of normalizedPoints) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    }

    const bounds = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
        ? { minX, minY, maxX, maxY }
        : null;

    return {
        pointCount: normalizedPoints.length,
        color: typeof data?.color === "string" ? data.color : null,
        width: toFiniteNumber(data?.width),
        start: normalizedPoints.length > 0 ? normalizedPoints[0] : null,
        end: normalizedPoints.length > 0 ? normalizedPoints[normalizedPoints.length - 1] : null,
        bounds,
        payloadSize: getPayloadSize(data),
        payloadHash: payloadHash(data),
    };
}

function summarizeStrokeState(strokes) {
    const normalized = Array.isArray(strokes) ? strokes : [];
    let pointCount = 0;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    const sample = normalized.slice(0, 20).map((stroke, index) => {
        const points = Array.isArray(stroke?.points) ? stroke.points : [];
        const validPoints = points
            .map((point) => ({ x: toFiniteNumber(point?.x), y: toFiniteNumber(point?.y) }))
            .filter((point) => point.x !== null && point.y !== null);

        pointCount += validPoints.length;
        for (const point of validPoints) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
        }

        return {
            index,
            pointCount: validPoints.length,
            color: typeof stroke?.color === "string" ? stroke.color : null,
            width: toFiniteNumber(stroke?.width),
            start: validPoints.length > 0 ? validPoints[0] : null,
            end: validPoints.length > 0 ? validPoints[validPoints.length - 1] : null,
        };
    });

    const bounds = Number.isFinite(minX) && Number.isFinite(minY) && Number.isFinite(maxX) && Number.isFinite(maxY)
        ? { minX, minY, maxX, maxY }
        : null;

    return {
        strokeCount: normalized.length,
        pointCount,
        bounds,
        sample,
        payloadSize: getPayloadSize(normalized),
        payloadHash: payloadHash(normalized),
    };
}

async function logSocketAudit(data) {
    try {
        await prisma.auditLog.create({
            data: {
                userId: data.userId || null,
                username: data.username,
                action: data.action,
                resource: data.resource,
                details: data.details,
                ipAddress: data.ipAddress,
                userAgent: data.userAgent,
                status: data.status || "SUCCESS",
            },
        });
    } catch (error) {
        console.error("[Audit] Socket audit logging failed:", error);
    }
}

function setupSocketServer(server) {
    const io = new SocketIOServer(server, {
        path: "/api/socket/io",
        addTrailingSlash: false,
        cors: {
            origin: process.env.APP_ORIGIN || false,
            methods: ["GET", "POST"],
            credentials: true,
        },
    });

    // Authentication Middleware
    io.use(async (socket, next) => {
        try {
            const req = socket.request;
            const res = {
                getHeader: () => { },
                setHeader: () => { },
            };

            const { getIronSession } = await import("iron-session");
            const session = await getIronSession(req, res, sessionOptions);

            if (session && session.user && session.user.isLoggedIn && session.user.username) {
                socket.user = session.user;
                next();
            } else {
                next(new Error("Unauthorized"));
            }
        } catch (error) {
            console.error("Socket Auth Error:", error);
            next(new Error("Authentication error"));
        }
    });

    io.on("connection", async (socket) => {
        const user = socket.user;
        const username = user.username;
        const eventCounters = new Map();
        const clientContext = getSocketClientContext(socket);

        const auditSocketEvent = (action, resource, details, status = "SUCCESS") => {
            void logSocketAudit({
                userId: user?.id || null,
                username,
                action,
                resource,
                details,
                ipAddress: clientContext.ipAddress,
                userAgent: clientContext.userAgent,
                status,
            });
        };

        const isRateLimited = (eventName) => {
            const limit = SOCKET_RATE_LIMITS[eventName];
            if (!limit) return false;

            const now = Date.now();
            const current = eventCounters.get(eventName);

            if (!current || current.resetAt <= now) {
                eventCounters.set(eventName, { count: 1, resetAt: now + limit.windowMs });
                return false;
            }

            current.count += 1;
            if (current.count > limit.max) {
                return true;
            }

            return false;
        };

        const rejectIfAbusive = (eventName, payload, maxPayloadBytes = MAX_SOCKET_EVENT_PAYLOAD_BYTES) => {
            if (isRateLimited(eventName)) {
                socket.emit("error", { message: `${eventName} rate limit exceeded.` });
                auditSocketEvent("SOCKET_EVENT_REJECTED", `socket:${eventName}`, {
                    reason: "rate_limited",
                    payloadSize: getPayloadSize(payload),
                    maxPayloadBytes,
                }, "WARNING");
                return true;
            }

            const payloadSize = getPayloadSize(payload);
            if (payloadSize > maxPayloadBytes) {
                socket.emit("error", { message: `${eventName} payload too large.` });
                auditSocketEvent("SOCKET_EVENT_REJECTED", `socket:${eventName}`, {
                    reason: "payload_too_large",
                    payloadSize,
                    maxPayloadBytes,
                }, "WARNING");
                return true;
            }

            return false;
        };

        // Join user's own room for personal notifications
        socket.join(`user:${username}`);

        auditSocketEvent("SOCKET_CONNECT", "socket:session", {
            socketId: socket.id,
        });

        // Update online status
        if (!onlineUsers.has(username)) {
            onlineUsers.set(username, new Set());
        }
        onlineUsers.get(username).add(socket.id);

        // Sync User Profile/Settings on connection
        try {
            let dbUser = await prisma.user.findUnique({ where: { username } });
            if (!dbUser) {
                // Create user if they don't exist
                dbUser = await prisma.user.create({
                    data: {
                        username,
                        displayName: user.displayName || username,
                        settings: {
                            dnd: false,
                            allowMessagesFrom: "everyone",
                            showOnlineStatus: true
                        }
                    }
                });
            }

            const settings = dbUser.settings || {};
            if (settings.showOnlineStatus !== false) {
                io.emit("presence", { username, status: "online" });
            }

        } catch (e) {
            console.error("Error syncing user on connection:", e);
        }

        // Auto-join the public "General" channel
        try {
            let generalGroup = await prisma.group.findFirst({ where: { name: "General" } });
            if (!generalGroup) {
                const dbUser = await prisma.user.findUnique({ where: { username } });
                if (dbUser) {
                    generalGroup = await prisma.group.create({
                        data: {
                            name: "General",
                            admins: { connect: { id: dbUser.id } },
                            members: { connect: { id: dbUser.id } },
                        },
                    });
                }
            } else {
                const dbUser = await prisma.user.findUnique({ where: { username } });
                if (dbUser) {
                    const isMember = await prisma.group.count({
                        where: { id: generalGroup.id, members: { some: { id: dbUser.id } } },
                    });
                    if (!isMember) {
                        await prisma.group.update({
                            where: { id: generalGroup.id },
                            data: { members: { connect: { id: dbUser.id } } },
                        });
                    }
                }
            }
            if (generalGroup) {
                socket.join(`group_${generalGroup.id}`);
            }
        } catch (e) {
            console.error("Error auto-joining General channel:", e);
        }

        // Join whiteboard room for real-time collaboration
        socket.join('whiteboard');
        auditSocketEvent("WHITEBOARD_JOIN", "whiteboard:room", {
            socketId: socket.id,
            room: "whiteboard",
        });

        // --- EVENTS ---

        // Whiteboard: broadcast individual stroke segments to other users
        socket.on('draw_stroke', (data) => {
            if (rejectIfAbusive('draw_stroke', data, 16 * 1024)) {
                return;
            }

            auditSocketEvent("WHITEBOARD_STROKE", "whiteboard:stroke", summarizeStrokeSegment(data));
            socket.to('whiteboard').emit('draw_stroke', data);
        });

        // Whiteboard: save full stroke history to database (debounced from client)
        socket.on('draw_save', async (data) => {
            if (rejectIfAbusive('draw_save', data, MAX_WHITEBOARD_STATE_BYTES)) {
                return;
            }

            if (!user?.isAdmin) {
                socket.emit("error", { message: "Only admins can save whiteboard state." });
                auditSocketEvent("WHITEBOARD_SAVE", "whiteboard:state", {
                    reason: "forbidden_non_admin",
                }, "FAILURE");
                return;
            }

            try {
                const { strokes } = data;
                if (strokes !== undefined && !Array.isArray(strokes)) {
                    socket.emit("error", { message: "Invalid whiteboard payload." });
                    auditSocketEvent("WHITEBOARD_SAVE", "whiteboard:state", {
                        reason: "invalid_payload",
                        strokesType: typeof strokes,
                    }, "FAILURE");
                    return;
                }

                const payloadSize = Buffer.byteLength(JSON.stringify(strokes ?? []), "utf8");
                if (payloadSize > MAX_WHITEBOARD_STATE_BYTES) {
                    socket.emit("error", { message: "Whiteboard payload too large." });
                    auditSocketEvent("WHITEBOARD_SAVE", "whiteboard:state", {
                        reason: "payload_too_large",
                        payloadSize,
                        maxPayloadSize: MAX_WHITEBOARD_STATE_BYTES,
                    }, "FAILURE");
                    return;
                }

                const summary = summarizeStrokeState(strokes ?? []);

                await prisma.whiteboardState.upsert({
                    where: { id: 'default' },
                    update: { elements: strokes ?? [] },
                    create: { id: 'default', elements: strokes ?? [] },
                });

                auditSocketEvent("WHITEBOARD_SAVE", "whiteboard:state", {
                    ...summary,
                    payloadSize,
                });
            } catch (e) {
                console.error('Error saving whiteboard state:', e);
                auditSocketEvent("WHITEBOARD_SAVE", "whiteboard:state", {
                    error: e instanceof Error ? e.message : "unknown_error",
                }, "FAILURE");
            }
        });

        // Whiteboard: clear canvas for everyone
        socket.on('draw_clear', async () => {
            if (rejectIfAbusive('draw_clear', null)) {
                return;
            }

            if (!user?.isAdmin) {
                socket.emit("error", { message: "Only admins can clear whiteboard state." });
                auditSocketEvent("WHITEBOARD_CLEAR", "whiteboard:state", {
                    reason: "forbidden_non_admin",
                }, "FAILURE");
                return;
            }

            socket.to('whiteboard').emit('draw_clear');
            try {
                await prisma.whiteboardState.upsert({
                    where: { id: 'default' },
                    update: { elements: [] },
                    create: { id: 'default', elements: [] },
                });
                auditSocketEvent("WHITEBOARD_CLEAR", "whiteboard:state", {
                    strokeCount: 0,
                    pointCount: 0,
                });
            } catch (e) {
                console.error('Error clearing whiteboard state:', e);
                auditSocketEvent("WHITEBOARD_CLEAR", "whiteboard:state", {
                    error: e instanceof Error ? e.message : "unknown_error",
                }, "FAILURE");
            }
        });

        socket.on("get_online_users", () => {
            const users = Array.from(onlineUsers.keys());
            socket.emit("online_users_list", users);
            auditSocketEvent("CHAT_ONLINE_USERS_VIEW", "chat:presence", {
                onlineUsersCount: users.length,
            });
        });

        // Allow client to manually join a group room (e.g. after creation or being added)
        socket.on('join_group', async (groupId) => {
            if (rejectIfAbusive('join_group', groupId, 256)) {
                return;
            }

            if (!groupId || typeof groupId !== 'string') {
                auditSocketEvent("CHAT_GROUP_JOIN", "chat:group", {
                    reason: "invalid_group_id",
                    groupIdType: typeof groupId,
                }, "FAILURE");
                return;
            }

            try {
                const dbUser = await prisma.user.findUnique({
                    where: { username },
                    select: { id: true },
                });

                if (!dbUser) {
                    socket.emit("error", { message: "User not found." });
                    auditSocketEvent("CHAT_GROUP_JOIN", `chat:group:${groupId}`, {
                        reason: "user_not_found",
                    }, "FAILURE");
                    return;
                }

                const isMember = await prisma.group.count({
                    where: {
                        id: groupId,
                        members: { some: { id: dbUser.id } },
                    },
                });

                if (!isMember) {
                    socket.emit("error", { message: "Not authorized to join this group." });
                    auditSocketEvent("CHAT_GROUP_JOIN", `chat:group:${groupId}`, {
                        reason: "not_group_member",
                    }, "FAILURE");
                    return;
                }

                socket.join(`group_${groupId}`);
                console.log(`User ${username} joined group room: group_${groupId}`);
                auditSocketEvent("CHAT_GROUP_JOIN", `chat:group:${groupId}`, {
                    room: `group_${groupId}`,
                });
            } catch (err) {
                console.error("join_group error:", err);
                socket.emit("error", { message: "Failed to join group." });
                auditSocketEvent("CHAT_GROUP_JOIN", `chat:group:${groupId}`, {
                    error: err instanceof Error ? err.message : "unknown_error",
                }, "FAILURE");
            }
        });

        socket.on("send_message", async (data) => {
            if (rejectIfAbusive('send_message', data)) {
                return;
            }

            const result = SendMessageSchema.safeParse(data);
            if (!result.success) {
                socket.emit("error", { message: "Invalid message data", details: result.error.issues });
                auditSocketEvent("CHAT_MESSAGE_SEND", "chat:message", {
                    reason: "validation_failed",
                    issues: result.error.issues,
                }, "FAILURE");
                return;
            }

            const { to, groupId, content: rawContent } = result.data;
            const content = DOMPurify.sanitize(rawContent);

            try {
                const sender = await prisma.user.findUnique({ where: { username: username } });
                if (!sender) {
                    socket.emit("error", { message: "Sender user not found" });
                    auditSocketEvent("CHAT_MESSAGE_SEND", "chat:message", {
                        reason: "sender_not_found",
                    }, "FAILURE");
                    return;
                }

                let message;
                if (groupId) {
                    // Verify sender is a member of the group
                    const isMember = await prisma.group.count({
                        where: { id: groupId, members: { some: { id: sender.id } } }
                    });

                    if (!isMember) {
                        socket.emit("error", { message: "You are not a member of this group." });
                        auditSocketEvent("CHAT_MESSAGE_SEND", `chat:group:${groupId}`, {
                            reason: "not_group_member",
                            contentLength: content.length,
                            contentHash: payloadHash(content),
                        }, "FAILURE");
                        return;
                    }

                    message = await prisma.message.create({
                        data: {
                            content,
                            senderId: sender.id,
                            groupId: groupId,
                            read: false
                        },
                        include: {
                            sender: { select: { id: true, username: true, displayName: true, avatar: true } },
                            group: { select: { id: true, name: true } }
                        }
                    });

                    // Emit to group room
                    io.to(`group_${groupId}`).emit("new_message", message);
                    socket.emit("message_sent", message); // Acknowledge to sender
                    auditSocketEvent("CHAT_MESSAGE_SEND", `chat:group:${groupId}`, {
                        messageId: message.id,
                        contentLength: content.length,
                        contentHash: payloadHash(content),
                    });

                } else if (to) {
                    // Direct Message
                    const receiver = await prisma.user.findUnique({
                        where: { username: to },
                        include: { blockedUsers: true }
                    });

                    if (!receiver) {
                        socket.emit("error", { message: "User not found" });
                        auditSocketEvent("CHAT_MESSAGE_SEND", `chat:user:${to}`, {
                            reason: "receiver_not_found",
                            contentLength: content.length,
                            contentHash: payloadHash(content),
                        }, "FAILURE");
                        return;
                    }

                    // CHECK: Blocking
                    const isBlocked = receiver.blockedUsers.some(b => b.blockedId === sender.id);
                    if (isBlocked) {
                        socket.emit("error", { message: "You cannot message this user." });
                        auditSocketEvent("CHAT_MESSAGE_SEND", `chat:user:${receiver.username}`, {
                            reason: "blocked_by_receiver",
                            contentLength: content.length,
                            contentHash: payloadHash(content),
                        }, "FAILURE");
                        return;
                    }

                    // CHECK: Privacy Settings
                    const receiverSettings = receiver.settings || {};
                    if (receiverSettings.allowMessagesFrom === 'none') {
                        socket.emit("error", { message: "User is not accepting messages." });
                        auditSocketEvent("CHAT_MESSAGE_SEND", `chat:user:${receiver.username}`, {
                            reason: "receiver_privacy_settings",
                            contentLength: content.length,
                            contentHash: payloadHash(content),
                        }, "FAILURE");
                        return;
                    }

                    // Save Message
                    message = await prisma.message.create({
                        data: {
                            content,
                            senderId: sender.id,
                            receiverId: receiver.id,
                            read: false
                        },
                        include: { sender: true, receiver: true, reactions: true }
                    });

                    // Emit to Receiver's personal room (using username)
                    io.to(`user:${receiver.username}`).emit("new_message", message);

                    // Ack to Sender
                    socket.emit("message_sent", message);
                    auditSocketEvent("CHAT_MESSAGE_SEND", `chat:user:${receiver.username}`, {
                        messageId: message.id,
                        receiverId: receiver.id,
                        contentLength: content.length,
                        contentHash: payloadHash(content),
                    });
                } else {
                    socket.emit("error", { message: "Invalid message recipient (neither 'to' nor 'groupId' provided)." });
                    auditSocketEvent("CHAT_MESSAGE_SEND", "chat:message", {
                        reason: "missing_recipient",
                        contentLength: content.length,
                        contentHash: payloadHash(content),
                    }, "FAILURE");
                }

            } catch (err) {
                console.error("Message error:", err);
                socket.emit("error", { message: "Failed to send message" });
                auditSocketEvent("CHAT_MESSAGE_SEND", "chat:message", {
                    error: err instanceof Error ? err.message : "unknown_error",
                }, "FAILURE");
            }
        });

        socket.on("edit_message", async (data) => {
            if (rejectIfAbusive('edit_message', data)) {
                return;
            }

            const result = EditMessageSchema.safeParse(data);
            if (!result.success) {
                auditSocketEvent("CHAT_MESSAGE_EDIT", "chat:message", {
                    reason: "validation_failed",
                    issues: result.error.issues,
                }, "FAILURE");
                return;
            }

            const { messageId, content: rawContent } = result.data;
            const content = DOMPurify.sanitize(rawContent);

            try {
                const message = await prisma.message.findUnique({
                    where: { id: messageId },
                    include: { sender: true, receiver: true }
                });

                if (!message) {
                    auditSocketEvent("CHAT_MESSAGE_EDIT", `chat:message:${messageId}`, {
                        reason: "message_not_found",
                    }, "FAILURE");
                    return;
                }
                if (message.sender.username !== username) {
                    socket.emit("error", { message: "Unauthorized edit" });
                    auditSocketEvent("CHAT_MESSAGE_EDIT", `chat:message:${messageId}`, {
                        reason: "unauthorized",
                    }, "FAILURE");
                    return;
                }

                const updated = await prisma.message.update({
                    where: { id: messageId },
                    data: {
                        content,
                        editedAt: new Date()
                    },
                    include: { sender: true, receiver: true, reactions: true }
                });

                // Emit update to both parties
                io.to(`user:${message.receiver.username}`).emit("message_updated", updated);
                io.to(`user:${message.sender.username}`).emit("message_updated", updated);
                auditSocketEvent("CHAT_MESSAGE_EDIT", `chat:message:${messageId}`, {
                    contentLength: content.length,
                    contentHash: payloadHash(content),
                });
            } catch (err) {
                console.error("Edit error:", err);
                auditSocketEvent("CHAT_MESSAGE_EDIT", `chat:message:${messageId}`, {
                    error: err instanceof Error ? err.message : "unknown_error",
                }, "FAILURE");
            }
        });

        socket.on("delete_message", async (data) => {
            if (rejectIfAbusive('delete_message', data, 1024)) {
                return;
            }

            const result = DeleteMessageSchema.safeParse(data);
            if (!result.success) {
                auditSocketEvent("CHAT_MESSAGE_DELETE", "chat:message", {
                    reason: "validation_failed",
                    issues: result.error.issues,
                }, "FAILURE");
                return;
            }

            const { messageId } = result.data;

            try {
                const message = await prisma.message.findUnique({
                    where: { id: messageId },
                    include: { sender: true, receiver: true }
                });

                if (!message) {
                    auditSocketEvent("CHAT_MESSAGE_DELETE", `chat:message:${messageId}`, {
                        reason: "message_not_found",
                    }, "FAILURE");
                    return;
                }
                // Allow sender to delete generally. Receiver deleting for themselves is harder in this schema (soft delete hides for both usually, or needs 'deletedBySender'/'deletedByReceiver' flags)
                if (message.sender.username !== username) {
                    socket.emit("error", { message: "Unauthorized delete" });
                    auditSocketEvent("CHAT_MESSAGE_DELETE", `chat:message:${messageId}`, {
                        reason: "unauthorized",
                    }, "FAILURE");
                    return;
                }

                const updated = await prisma.message.update({
                    where: { id: messageId },
                    data: {
                        deletedAt: new Date(),
                        content: "This message was deleted." // Optional: obscure content
                    },
                    include: { sender: true, receiver: true, reactions: true }
                });

                io.to(`user:${message.receiver.username}`).emit("message_updated", updated);
                io.to(`user:${message.sender.username}`).emit("message_updated", updated);
                auditSocketEvent("CHAT_MESSAGE_DELETE", `chat:message:${messageId}`, {
                    deletedAt: updated.deletedAt,
                });

            } catch (err) {
                console.error("Delete error:", err);
                auditSocketEvent("CHAT_MESSAGE_DELETE", `chat:message:${messageId}`, {
                    error: err instanceof Error ? err.message : "unknown_error",
                }, "FAILURE");
            }
        });

        socket.on("add_reaction", async (data) => {
            if (rejectIfAbusive('add_reaction', data, 1024)) {
                return;
            }

            const result = ReactionSchema.safeParse(data);
            if (!result.success) {
                auditSocketEvent("CHAT_MESSAGE_REACTION", "chat:message", {
                    reason: "validation_failed",
                    issues: result.error.issues,
                }, "FAILURE");
                return;
            }

            const { messageId, emoji } = result.data;

            try {
                const message = await prisma.message.findUnique({
                    where: { id: messageId },
                    include: { sender: true, receiver: true }
                });

                if (!message) {
                    auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                        reason: "message_not_found",
                        emoji,
                    }, "FAILURE");
                    return;
                }

                if (message.sender.username !== username && message.receiver.username !== username) {
                    auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                        reason: "unauthorized",
                        emoji,
                    }, "FAILURE");
                    return;
                }

                const dbUser = await prisma.user.findUnique({ where: { username } });
                if (!dbUser) {
                    auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                        reason: "user_not_found",
                        emoji,
                    }, "FAILURE");
                    return;
                }

                // Let's toggle: Check if exists first
                const existing = await prisma.reaction.findUnique({
                    where: {
                        userId_messageId_emoji: {
                            userId: dbUser.id,
                            messageId,
                            emoji
                        }
                    }
                });

                if (existing) {
                    // Remove (Toggle Off)
                    await prisma.reaction.delete({ where: { id: existing.id } });
                    auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                        emoji,
                        operation: "remove",
                    });
                } else {
                    // Add
                    await prisma.reaction.create({
                        data: {
                            userId: dbUser.id,
                            messageId,
                            emoji
                        }
                    });
                    auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                        emoji,
                        operation: "add",
                    });
                }

                // Fetch updated message to broadcast
                const updated = await prisma.message.findUnique({
                    where: { id: messageId },
                    include: { sender: true, receiver: true, reactions: true }
                });

                io.to(`user:${message.receiver.username}`).emit("message_updated", updated);
                io.to(`user:${message.sender.username}`).emit("message_updated", updated);

            } catch (err) {
                console.error("Reaction error:", err);
                auditSocketEvent("CHAT_MESSAGE_REACTION", `chat:message:${messageId}`, {
                    error: err instanceof Error ? err.message : "unknown_error",
                    emoji,
                }, "FAILURE");
            }
        });

        socket.on("typing", (data) => {
            if (rejectIfAbusive('typing', data, 512)) {
                return;
            }

            const { to, isTyping } = data;
            io.to(`user:${to}`).emit("user_typing", { from: username, isTyping });
            auditSocketEvent("CHAT_TYPING", `chat:user:${to || "unknown"}`, {
                isTyping: Boolean(isTyping),
            });
        });

        socket.on("mark_read", async (data) => {
            if (rejectIfAbusive('mark_read', data, 1024)) {
                return;
            }

            const { senderId } = data;
            if (!senderId) {
                auditSocketEvent("CHAT_MARK_READ", "chat:message", {
                    reason: "missing_sender_id",
                }, "FAILURE");
                return;
            }

            try {
                const currentUser = await prisma.user.findUnique({ where: { username } });
                if (!currentUser) {
                    auditSocketEvent("CHAT_MARK_READ", `chat:user:${senderId}`, {
                        reason: "current_user_not_found",
                    }, "FAILURE");
                    return;
                }

                const updateResult = await prisma.message.updateMany({
                    where: {
                        senderId: senderId,
                        receiverId: currentUser.id, // Current user is the receiver
                        read: false
                    },
                    data: {
                        read: true
                    }
                });
                auditSocketEvent("CHAT_MARK_READ", `chat:user:${senderId}`, {
                    markedCount: updateResult.count,
                });
            } catch (err) {
                console.error("Error marking messages as read:", err);
                auditSocketEvent("CHAT_MARK_READ", `chat:user:${senderId}`, {
                    error: err instanceof Error ? err.message : "unknown_error",
                }, "FAILURE");
            }
        });

        // Disconnect
        socket.on("disconnect", () => {
            const userSockets = onlineUsers.get(username);
            if (userSockets) {
                userSockets.delete(socket.id);
                if (userSockets.size === 0) {
                    onlineUsers.delete(username);
                    io.emit("presence", { username, status: "offline" });
                }
            }

            auditSocketEvent("SOCKET_DISCONNECT", "socket:session", {
                socketId: socket.id,
            });
        });
    });

    return io;
}

module.exports = { setupSocketServer };
