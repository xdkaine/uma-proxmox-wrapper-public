import { NextRequest, NextResponse } from "next/server";
import { writeFile } from "fs/promises";
import path from "path";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

// Allowed file types for upload
const ALLOWED_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf']);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
    const client = getClientContext(request);
    try {
        const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
        if (!session.user?.isLoggedIn || !session.user.isAdmin) {
            await logAudit({
                username: session.user?.username || "anonymous",
                action: "UPLOAD_FILE",
                resource: "upload",
                status: "FAILURE",
                ipAddress: client.ipAddress,
                userAgent: client.userAgent,
                details: { reason: "unauthorized" },
            });
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        if (!validateCSRFToken(request, session.csrfToken)) {
            return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
        }

        const rlKey = `upload:${getRateLimitIdentifier(request)}`;
        const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.UPLOAD);
        if (!rl.allowed) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
        }

        const formData = await request.formData();
        const file = formData.get("file") as File;
        const docId = formData.get("docId") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` }, { status: 413 });
        }

        // Validate file extension
        const ext = path.extname(file.name).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            return NextResponse.json({ error: `File type '${ext}' not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}` }, { status: 400 });
        }

        // Validate docId to prevent path traversal
        if (docId && !/^[a-zA-Z0-9_-]+$/.test(docId)) {
            return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Sanitize filename
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const finalFilename = `${uniqueSuffix}-${filename}`;

        let uploadDir = path.join(process.cwd(), "public", "uploads");
        let publicUrlPath = "/uploads";

        if (docId) {
            uploadDir = path.join(uploadDir, "docs", docId);
            publicUrlPath = `/uploads/docs/${docId}`;
        }

        // Ensure directory exists
        const fs = require('fs');
        if (!fs.existsSync(uploadDir)) {
            await fs.promises.mkdir(uploadDir, { recursive: true });
        }

        const filePath = path.join(uploadDir, finalFilename);

        await writeFile(filePath, buffer);

        // Return the public URL
        const publicUrl = `${publicUrlPath}/${finalFilename}`;

        await logAudit({
            username: session.user.username,
            action: "UPLOAD_FILE",
            resource: docId ? `doc:${docId}` : "upload:general",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                originalName: file.name,
                savedName: finalFilename,
                fileSize: file.size,
                extension: ext,
                publicUrl,
            },
        });

        return NextResponse.json({ url: publicUrl });

    } catch (error) {
        console.error("Upload error:", (error as Error).message);
        await logAudit({
            username: "unknown",
            action: "UPLOAD_FILE",
            resource: "upload",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }
}
