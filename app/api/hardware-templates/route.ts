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

// Ensure templates directory exists
async function ensureTemplatesDir() {
    try {
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });
    } catch (e) {
        // Directory already exists
    }
}

// GET - List all templates
export async function GET(req: NextRequest) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "HW_TEMPLATE_LIST",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        await ensureTemplatesDir();
        const files = await fs.readdir(TEMPLATES_DIR);
        const templates = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                const content = await fs.readFile(path.join(TEMPLATES_DIR, file), 'utf-8');
                const template = JSON.parse(content);

                // Only show user's own templates or shared templates
                if (template.owner === session.user.username || template.shared) {
                    templates.push(template);
                }
            }
        }

        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_LIST",
            resource: "hardware-templates",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { resultCount: templates.length },
        });

        return NextResponse.json({ templates });
    } catch (error: any) {
        console.error('Error listing templates:', error);
        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_LIST",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// POST - Create new template
export async function POST(req: NextRequest) {
    const client = getClientContext(req);
    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
    if (!session.user?.isLoggedIn) {
        await logAudit({
            username: "anonymous",
            action: "HW_TEMPLATE_CREATE",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { reason: "unauthorized" },
        });
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFToken(req, session.csrfToken)) {
        return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const rlKey = `hw-template-create:${getRateLimitIdentifier(req)}`;
    const rl = await checkRateLimitAsync(rlKey, RATE_LIMITS.VM_CONFIG);
    if (!rl.allowed) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { 'Retry-After': String(rl.retryAfter || 60) } });
    }

    try {
        const { name, description, config, category } = await req.json();

        if (!name || !config) {
            return NextResponse.json({ error: "Name and config  are required" }, { status: 400 });
        }

        const template = {
            id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name,
            description: description || '',
            category: category || 'custom',
            config,
            owner: session.user.username,
            shared: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await ensureTemplatesDir();
        await fs.writeFile(
            path.join(TEMPLATES_DIR, `${template.id}.json`),
            JSON.stringify(template, null, 2)
        );

        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_CREATE",
            resource: `hardware-template:${template.id}`,
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { after: { id: template.id, name: template.name, category: template.category } },
        });

        return NextResponse.json({ success: true, template });
    } catch (error: any) {
        console.error('Error creating template:', error);
        await logAudit({
            username: session.user.username,
            action: "HW_TEMPLATE_CREATE",
            resource: "hardware-templates",
            status: "FAILURE",
            ipAddress: client.ipAddress,
            userAgent: client.userAgent,
            details: { error: error instanceof Error ? error.message : "unknown_error" },
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
