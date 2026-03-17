import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, SessionData } from "@/lib/session";
import { cookies } from "next/headers";
import { promises as fs } from 'fs';
import path from 'path';
import { validateCSRFToken } from "@/lib/csrf";
import { getClientContext, logAudit } from "@/lib/audit";
import { checkRateLimitAsync, RATE_LIMITS, getRateLimitIdentifier } from "@/lib/rate-limit";

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'hardware-templates');

// Validate template ID to prevent path traversal
function isValidTemplateId(id: string): boolean {
    return /^[a-zA-Z0-9_-]+$/.test(id);
}

// GET - Get specific template
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "HW_TEMPLATE_VIEW",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!isValidTemplateId(id)) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }
        const filePath = path.join(TEMPLATES_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const template = JSON.parse(content);

        // Permission check
        if (template.owner !== session.user.username && !template.shared) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 });
        }

        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_VIEW",
            resource: `hardware-template:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { owner: template.owner, shared: !!template.shared },
        });

        return NextResponse.json({ template });
    } catch (error: any) {
        console.error('Error getting template:', error);
        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_VIEW",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
}

// DELETE - Delete template
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `hw-template-delete:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { id } = await params;
        if (!isValidTemplateId(id)) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }
        const filePath = path.join(TEMPLATES_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const template = JSON.parse(content);

        // Permission check - only owner or admin can delete
        if (template.owner !== session.user.username && !session.user.isAdmin) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 });
        }

        await fs.unlink(filePath);

        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_DELETE",
            resource: `hardware-template:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { before: { name: template.name, owner: template.owner, shared: !!template.shared } },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting template:', error);
        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_DELETE",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
}

// PATCH - Update template (toggle shared status or update config)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `hw-template-update:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { id } = await params;
        if (!isValidTemplateId(id)) {
            return NextResponse.json({ error: "Invalid template ID" }, { status: 400 });
        }
        const { shared, name, description, config } = await req.json();

        const filePath = path.join(TEMPLATES_DIR, `${id}.json`);
        const content = await fs.readFile(filePath, 'utf-8');
        const template = JSON.parse(content);
        const before = {
            name: template.name,
            description: template.description,
            shared: template.shared,
            category: template.category,
        };

        // Permission check
        if (template.owner !== session.user.username && !session.user.isAdmin) {
            return NextResponse.json({ error: "Permission denied" }, { status: 403 });
        }

        // Update fields
        if (typeof shared === 'boolean') template.shared = shared;
        if (name) template.name = name;
        if (description !== undefined) template.description = description;
        if (config) template.config = config;
        template.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(template, null, 2));

        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_UPDATE",
            resource: `hardware-template:${id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: {
                before,
                after: {
                    name: template.name,
                    description: template.description,
                    shared: template.shared,
                    category: template.category,
                },
            },
        });

        return NextResponse.json({ success: true, template });
    } catch (error: any) {
        console.error('Error updating template:', error);
        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_UPDATE",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
}
