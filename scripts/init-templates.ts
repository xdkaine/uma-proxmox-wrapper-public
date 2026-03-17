import { promises as fs } from 'fs';
import path from 'path';

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'hardware-templates');

// Pre-built template configurations
const prebuiltTemplates = [
    {
        id: 'template-webserver-default',
        name: 'Web Server',
        description: 'Optimized for web servers: 2 vCPU, 4GB RAM, virtio network',
        category: 'prebuilt',
        config: {
            cores: 2,
            sockets: 1,
            memory: 4096,
            cpu: 'host',
            net0: 'virtio,bridge=vmbr0',
            bios: 'seabios',
        },
        owner: 'system',
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'template-database-default',
        name: 'Database Server',
        description: 'High-performance database: 4 vCPU, 16GB RAM, multiple disks',
        category: 'prebuilt',
        config: {
            cores: 4,
            sockets: 1,
            memory: 16384,
            cpu: 'host,flags=+pcid;+spec-ctrl',
            numa: '0',
            numa0: 'cpus=0-3,memory=16384',
            bios: 'ovmf',
        },
        owner: 'system',
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'template-development-default',
        name: 'Development Workstation',
        description: 'For development: 2 vCPU, 8GB RAM, desktop GPU passthrough ready',
        category: 'prebuilt',
        config: {
            cores: 2,
            sockets: 1,
            memory: 8192,
            cpu: 'host',
            vga: 'std',
            bios: 'ovmf',
        },
        owner: 'system',
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'template-minimal-default',
        name: 'Minimal VM',
        description: 'Lightweight: 1 vCPU, 512MB RAM for minimal services',
        category: 'prebuilt',
        config: {
            cores: 1,
            sockets: 1,
            memory: 512,
            cpu: 'kvm64',
            bios: 'seabios',
        },
        owner: 'system',
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    },
    {
        id: 'template-gaming-default',
        name: 'Gaming VM',
        description: 'High-end gaming: 8 vCPU, 32GB RAM, optimized for GPU passthrough',
        category: 'prebuilt',
        config: {
            cores: 8,
            sockets: 1,
            memory: 32768,
            cpu: 'host,flags=+pcid;+spec-ctrl;+aes',
            vga: 'none',
            bios: 'ovmf',
            machine: 'q35',
        },
        owner: 'system',
        shared: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];

async function initializeTemplates() {
    try {
        // Create templates directory
        await fs.mkdir(TEMPLATES_DIR, { recursive: true });

        // Write each pre-built template
        for (const template of prebuiltTemplates) {
            const filePath = path.join(TEMPLATES_DIR, `${template.id}.json`);

            // Check if file already exists
            try {
                await fs.access(filePath);
                console.log(`Template ${template.name} already exists, skipping...`);
            } catch {
                // File doesn't exist, create it
                await fs.writeFile(filePath, JSON.stringify(template, null, 2));
                console.log(`✓ Created template: ${template.name}`);
            }
        }

        console.log('Template initialization complete!');
    } catch (error) {
        console.error('Error initializing templates:', error);
    }
}

// Run if executed directly
if (require.main === module) {
    initializeTemplates();
}

export { initializeTemplates, prebuiltTemplates };
