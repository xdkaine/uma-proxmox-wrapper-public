
import fs from 'fs';
import path from 'path';

// Load env FIRST
try {
    const envPath = path.join(process.cwd(), '.env.local');
    if (fs.existsSync(envPath)) {
        const envFile = fs.readFileSync(envPath, 'utf8');
        envFile.split('\n').forEach(line => {
            const [key, ...vals] = line.split('=');
            if (key && vals.length > 0) {
                const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
                process.env[key.trim()] = val;
            }
        });
    } else {
        console.warn(".env.local not found");
    }
} catch (e) {
    console.error("Could not read .env.local", e);
}

// Then import
async function main() {
    try {
        const { proxmox } = await import('../lib/proxmox-api');

        console.log("Fetching realms from Proxmox...");
        console.log("Using URL:", process.env.PROXMOX_URL);

        const domains = await proxmox.getDomains();
        console.log("Realms found:");
        console.table(domains);
    } catch (e) {
        console.error("Error fetching domains:", e);
    }
}

main();
