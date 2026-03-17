export interface ProxmoxPool {
    poolid: string;
    comment?: string;
    allowManage?: boolean;
}


export interface ProxmoxZone {
    zone: string;
    type: string;
    mtu?: number;
    ipam?: string;
}

export interface ProxmoxVnet {
    vnet: string;
    zone: string;
    tag?: number;
    alias?: string;
    comment?: string;
    vlanaware?: boolean;
}


export interface ProxmoxDomain {
    realm: string;
    type: string;
    comment?: string;
    default?: number;
}

interface APIResponse<T> {

    data: T;
    errors?: any;
}

const API_URL = process.env.PROXMOX_URL;
const TOKEN_ID = process.env.PROXMOX_TOKEN_ID;
const SECRET = process.env.PROXMOX_TOKEN_SECRET;

const getAuthHeader = () => {
    return `PVEAPIToken=${TOKEN_ID}=${SECRET}`;
};

export class ProxmoxClient {
    private async request<T>(endpoint: string, method: string = 'GET', body?: any, silent: boolean = false): Promise<T> {
        if (!API_URL || !TOKEN_ID || !SECRET) {
            throw new Error("Proxmox environment variables not set");
        }

        const url = `${API_URL}/api2/json/${endpoint}`;
        const headers: HeadersInit = {
            'Authorization': getAuthHeader(),
        };

        let requestBody: any;
        if (body) {
            if (method === 'POST' || method === 'PUT') {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                const params = new URLSearchParams();
                for (const key in body) {
                    if (body[key] !== undefined && body[key] !== null) {
                        params.append(key, String(body[key]));
                    }
                }
                requestBody = params.toString();
            } else {
                headers['Content-Type'] = 'application/json';
                requestBody = JSON.stringify(body);
            }
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const config: RequestInit = {
            method,
            headers,
            body: requestBody,
            signal: controller.signal,
        };

        // Handle self-signed certs via explicit configuration
        // This avoids using the insecure NODE_TLS_REJECT_UNAUTHORIZED=0 global flag
        if (process.env.PROXMOX_SSL_INSECURE === 'true') {
            // We need to dynamically import https only on the server side
            const { Agent } = await import('https');
            // @ts-ignore - next.js RequestInit type mismatch with node-fetch agent but it works in Node env
            config.agent = new Agent({ rejectUnauthorized: false });
        }

        try {
            const res = await fetch(url, config);
            clearTimeout(timeoutId);

            if (!res.ok) {
                // MEDIUM-3 FIX: Log detailed error server-side, return generic message to client
                const text = await res.text();
                // Only log error if not silent
                if (!silent) {
                    console.error(`[Proxmox API] Error ${res.status} for ${endpoint}: ${text}`);
                }
                throw new Error(`Proxmox API failed: ${res.status} - ${text}`);
            }
            const json = await res.json() as APIResponse<T>;
            return json.data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (!silent) {
                console.error("Proxmox Request Failed:", error);
            }
            throw error;
        }
    }

    // Helper to prevent path traversal and injection
    private validateId(id: string | number, type: string = 'ID'): string {
        if (id === undefined || id === null || id === '') {
            throw new Error(`${type} cannot be empty`);
        }

        const idValue = String(id);
        if (idValue.includes('/') || idValue.includes('\\') || idValue.includes('..')) {
            throw new Error(`Invalid ${type}: contains illegal characters`);
        }
        // Allow alphanumeric, underscore, hyphen, dot, @ (for users)
        if (!/^[a-zA-Z0-9@\-_.]+$/.test(idValue)) {
            throw new Error(`Invalid ${type}: contains illegal characters`);
        }
        return idValue;
    }

    async getPools(): Promise<ProxmoxPool[]> {
        return this.request<ProxmoxPool[]>('pools');
    }

    async createPool(poolid: string, comment?: string): Promise<void> {
        this.validateId(poolid, 'Pool ID');
        return this.request('pools', 'POST', { poolid, comment });
    }

    async getZones(): Promise<ProxmoxZone[]> {
        // Note: SDN endpoints might differ based on version, assuming standard path
        return this.request<ProxmoxZone[]>('cluster/sdn/zones');
    }

    async createZone(data: { zone: string; type: string; mtu?: number }): Promise<void> {
        return this.request('cluster/sdn/zones', 'POST', data);
    }

    async getVnets(): Promise<ProxmoxVnet[]> {
        return this.request<ProxmoxVnet[]>('cluster/sdn/vnets');
    }

    async createVnet(data: { vnet: string; zone: string; tag?: number; alias?: string; vlanaware?: boolean }): Promise<void> {
        this.validateId(data.vnet, 'VNET Name');
        this.validateId(data.zone, 'Zone Name');
        // Convert boolean to 1/0 for PVE API
        const payload: any = { ...data };
        if (data.vlanaware !== undefined) {
            payload.vlanaware = data.vlanaware ? 1 : 0;
        }
        return this.request('cluster/sdn/vnets', 'POST', payload);
    }

    async applySDN(): Promise<string> {
        return this.request('cluster/sdn', 'PUT');
    }

    async deleteVnet(vnet: string): Promise<void> {
        this.validateId(vnet, 'VNET Name');
        return this.request(`cluster/sdn/vnets/${vnet}`, 'DELETE');
    }

    async getACLs(): Promise<ProxmoxACL[]> {
        return this.request<ProxmoxACL[]>('access/acl');
    }

    async addSimpleACL(path: string, roles: string, users?: string, groups?: string): Promise<void> {
        const body: any = { path, roles };
        if (users) body.users = users;
        if (groups) body.groups = groups;
        return this.request('access/acl', 'PUT', body);
    }

    async removeSimpleACL(path: string, roles: string, users?: string, groups?: string): Promise<void> {
        const body: any = { path, roles, delete: 1 };
        if (users) body.users = users;
        if (groups) body.groups = groups;
        return this.request('access/acl', 'PUT', body);
    }

    async getUsers(): Promise<ProxmoxUser[]> {
        return this.request<ProxmoxUser[]>('access/users');
    }

    async getGroups(): Promise<ProxmoxGroup[]> {
        return this.request<ProxmoxGroup[]>('access/groups');
    }

    async createGroup(groupid: string, comment?: string): Promise<void> {
        this.validateId(groupid, 'Group ID');
        const body: any = { groupid };
        if (comment) body.comment = comment;
        return this.request('access/groups', 'POST', body);
    }

    async getRoles(): Promise<any[]> {
        return this.request('access/roles');
    }

    async getDomains(): Promise<ProxmoxDomain[]> {
        return this.request<ProxmoxDomain[]>('access/domains');
    }

    async getPool(poolid: string): Promise<any> {
        this.validateId(poolid, 'Pool ID');
        return this.request<any>(`pools/${poolid}`);
    }

    async deletePool(poolid: string): Promise<void> {
        this.validateId(poolid, 'Pool ID');
        return this.request(`pools/${poolid}`, 'DELETE');
    }

    async getResources(type?: string): Promise<any[]> {
        const url = type ? `cluster/resources?type=${type}` : 'cluster/resources';
        return this.request(url);
    }

    async getNextId(): Promise<number> {
        const allResources = await this.getResources();
        const usedIds = new Set<number>();

        allResources.forEach((r: any) => {
            if (r.vmid && (r.type === 'qemu' || r.type === 'lxc')) {
                const id = typeof r.vmid === 'number' ? r.vmid : parseInt(r.vmid, 10);
                if (!isNaN(id)) {
                    usedIds.add(id);
                }
            }
        });

        let nextId = 100;
        while (usedIds.has(nextId)) {
            nextId++;
        }
        return nextId;
    }

    async getNodes(): Promise<any[]> {
        return this.request('nodes');
    }

    async cloneVM(node: string, vmid: string, newid: string, name?: string, pool?: string, full?: boolean, storage?: string, target?: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(newid, 'New VM ID');

        const body: any = { newid };
        if (name) body.name = name;
        if (pool) body.pool = pool;
        if (full) body.full = 1;
        if (storage) body.storage = storage;
        if (target) body.target = target;

        return this.request(`nodes/${node}/qemu/${vmid}/clone`, 'POST', body);
    }

    async createVM(node: string, vmid: string, params: {
        name?: string;
        pool?: string;
        storage?: string; // storage for disk
        iso?: string; // iso image path e.g. local:iso/alpine.iso
        cores?: number;
        memory?: number;
        net0?: string; // bridge e.g. vmbr0
        diskSize?: string; // e.g. 32G
        start?: boolean;
    }): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'New VM ID');

        const body: any = { vmid };
        if (params.name) body.name = params.name;
        if (params.pool) body.pool = params.pool;
        if (params.cores) body.cores = params.cores;
        if (params.memory) body.memory = params.memory;
        if (params.start) body.start = 1;

        // Networking
        if (params.net0) {
            if (params.net0.toString().includes('bridge=')) {
                body.net0 = params.net0;
            } else {
                body.net0 = `virtio,bridge=${params.net0}`;
            }
        } else {
            body.net0 = 'virtio,bridge=vmbr0';
        }

        // CDROM / ISO
        if (params.iso) {
            body.cdrom = params.iso;
        } else {
            body.cdrom = 'none';
        }

        // Hard Disk (scsi0)
        // Format: storage:size_in_gb (e.g. local-lvm:32)
        if (params.storage && params.diskSize) {
            const size = parseInt(params.diskSize);
            body.scsi0 = `${params.storage}:${size}`;
            body.boot = 'order=scsi0;ide2;net0'; // boot order: disk, cdrom, net
        }

        body.ostype = 'l26'; // Linux 2.6 - 6.x kernel default

        return this.request(`nodes/${node}/qemu`, 'POST', body);
    }

    async getTaskStatus(node: string, upid: string): Promise<any> {
        this.validateId(node, 'Node Name');

        if (!upid) throw new Error("UPID cannot be empty");
        return this.request(`nodes/${node}/tasks/${upid}/status`);
    }

    async getTaskLog(node: string, upid: string): Promise<any[]> {
        this.validateId(node, 'Node Name');
        if (!upid) throw new Error("UPID cannot be empty");
        return this.request(`nodes/${node}/tasks/${upid}/log`);
    }

    async getNodeTasks(node: string, vmid?: string, limit: number = 50): Promise<any[]> {
        this.validateId(node, 'Node Name');
        let url = `nodes/${node}/tasks?limit=${limit}`;
        if (vmid) {
            url += `&vmid=${vmid}`;
        }
        return this.request(url);
    }

    async getVMConfig(node: string, vmid: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/config`);
    }

    async updateVMConfig(node: string, vmid: string, options: any): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/config`, 'POST', options);
    }

    async getVMStatus(node: string, vmid: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/status/current`);
    }

    async vmPowerAction(node: string, vmid: string, action: 'start' | 'stop' | 'reset' | 'shutdown' | 'reboot' | 'suspend' | 'resume'): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // Returns UPID
        return this.request(`nodes/${node}/qemu/${vmid}/status/${action}`, 'POST');
    }

    async createVNCTicket(node: string, vmid: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/vncproxy`, 'POST', { websocket: 1 });
    }

    async deleteVM(node: string, vmid: string): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // purge=1 removes disk images as well
        return this.request(`nodes/${node}/qemu/${vmid}?purge=1`, 'DELETE');
    }

    async deleteLXC(node: string, vmid: string): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}`, 'DELETE');
    }

    async convertVMToTemplate(node: string, vmid: string): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/template`, 'POST');
    }

    // LXC Container methods
    async getLXCStatus(node: string, vmid: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}/status/current`);
    }

    async getLXCConfig(node: string, vmid: string): Promise<any> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}/config`);
    }

    async updateLXCConfig(node: string, vmid: string, options: any): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}/config`, 'PUT', options);
    }

    async lxcPowerAction(node: string, vmid: string, action: 'start' | 'stop' | 'shutdown' | 'reboot' | 'suspend' | 'resume'): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}/status/${action}`, 'POST');
    }

    // Node methods
    async getNodeStatus(node: string): Promise<any> {
        this.validateId(node, 'Node Name');
        return this.request(`nodes/${node}/status`);
    }

    async getNodeRRDData(node: string, timeframe: string = 'hour', cf: string = 'AVERAGE'): Promise<any[]> {
        this.validateId(node, 'Node Name');
        return this.request(`nodes/${node}/rrddata?timeframe=${timeframe}&cf=${cf}`, 'GET', undefined, true);
    }

    // RRD Data methods for performance graphs
    async getVMRRDData(node: string, vmid: string, timeframe: string = 'hour', cf: string = 'AVERAGE'): Promise<any[]> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // timeframe: hour, day, week, month, year
        // cf: AVERAGE, MAX
        return this.request(`nodes/${node}/qemu/${vmid}/rrddata?timeframe=${timeframe}&cf=${cf}`, 'GET', undefined, true);
    }

    async getLXCRRDData(node: string, vmid: string, timeframe: string = 'hour', cf: string = 'AVERAGE'): Promise<any[]> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'Container ID');
        return this.request(`nodes/${node}/lxc/${vmid}/rrddata?timeframe=${timeframe}&cf=${cf}`, 'GET', undefined, true);
    }

    async resizeVMDisk(node: string, vmid: string, disk: string, size: string): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // Size format: "+1G", "32G"
        return this.request(`nodes/${node}/qemu/${vmid}/resize`, 'PUT', { disk, size });
    }

    // Snapshot methods
    async getSnapshots(node: string, vmid: string): Promise<any[]> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/snapshot`);
    }

    async createSnapshot(node: string, vmid: string, snapname: string, description?: string, vmstate: boolean = false): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        this.validateId(snapname, 'Snapshot Name');
        const body: any = { snapname };
        if (description) body.description = description;
        if (vmstate) body.vmstate = 1;

        return this.request(`nodes/${node}/qemu/${vmid}/snapshot`, 'POST', body);
    }

    async rollbackSnapshot(node: string, vmid: string, snapname: string): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        this.validateId(snapname, 'Snapshot Name');
        return this.request(`nodes/${node}/qemu/${vmid}/snapshot/${snapname}/rollback`, 'POST');
    }

    async deleteSnapshot(node: string, vmid: string, snapname: string): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        this.validateId(snapname, 'Snapshot Name');
        return this.request(`nodes/${node}/qemu/${vmid}/snapshot/${snapname}`, 'DELETE');
    }

    async createBackup(node: string, vmid: string, storage: string, mode: 'snapshot' | 'suspend' | 'stop', compress: string = 'zstd', remove: boolean = false): Promise<string> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');


        const body: any = {
            vmid,
            mode,
            compress,
            remove: remove ? 1 : 0
        };
        if (storage) body.storage = storage;

        return this.request(`nodes/${node}/vzdump`, 'POST', body);
    }

    // Firewall methods
    async getFirewallRules(node: string, vmid: string): Promise<any[]> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        return this.request(`nodes/${node}/qemu/${vmid}/firewall/rules`);
    }

    async addFirewallRule(node: string, vmid: string, rule: any): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // rule object contains: type, action, enable, source, dest, proto, dport, sport, comment, macro
        return this.request(`nodes/${node}/qemu/${vmid}/firewall/rules`, 'POST', rule);
    }

    async deleteFirewallRule(node: string, vmid: string, pos: number): Promise<void> {
        this.validateId(node, 'Node Name');
        this.validateId(vmid, 'VM ID');
        // 'pos' is required to identify the rule to delete
        return this.request(`nodes/${node}/qemu/${vmid}/firewall/rules/${pos}`, 'DELETE');
    }

    // Replication methods
    async getReplicationJobs(vmid?: string): Promise<any[]> {

        const jobs = await this.request('cluster/replication') as any[];
        if (vmid && Array.isArray(jobs)) {
            return jobs.filter((job: any) => job.guest === parseInt(vmid) || job.guest === vmid);
        }
        return jobs || [];
    }

    async createReplicationJob(vmid: string, target: string, schedule: string = '*/15', rate: string = '10'): Promise<void> {
        this.validateId(vmid, 'VM ID');
        this.validateId(target, 'Target Node');


        const existing = await this.getReplicationJobs(vmid);
        let nextSuffix = 0;
        if (existing && existing.length > 0) {
            // IDs look like "100-0", "100-1"
            const suffixes = existing.map((j: any) => {
                const part = j.id.split('-')[1];
                return parseInt(part) || 0;
            });
            nextSuffix = Math.max(...suffixes) + 1;
        }
        const id = `${vmid}-${nextSuffix}`;

        const body = {
            id,
            type: 'local', // usually implied
            target,
            schedule,
            rate,
            guest: vmid
        };

        return this.request('cluster/replication', 'POST', body);
    }

    async deleteReplicationJob(id: string): Promise<void> {

        if (!id) throw new Error("Job ID required");
        return this.request(`cluster/replication/${id}`, 'DELETE');
    }

    async getNodeStorage(node: string): Promise<any[]> {
        this.validateId(node, 'Node Name');
        return this.request(`nodes/${node}/storage`);
    }

    async getClusterTasks(active: boolean = false): Promise<any[]> {
        let url = 'cluster/tasks';
        if (active) {
            url += '?active=1';
        }
        return this.request(url);
    }

    async checkNetworkTasksRunning(): Promise<any | null> {
        try {
            const tasks = await this.getClusterTasks(true);
            // Check for running tasks related to networking or SDN
            // Common types: 'srv' with id 'networking', 'sdnapply', 'sdn'
            const networkTask = tasks.find((task: any) => {
                const type = task.type;
                const id = task.id;

                // Check for 'srv' type tasks specifically for 'networking'
                if (type === 'srv' && (id === 'networking' || id?.includes('networking'))) {
                    return true;
                }

                // Check for explicit SDN tasks
                if (type === 'sdnapply' || type?.includes('sdn')) {
                    return true;
                }

                return false;
            });

            return networkTask || null;
        } catch (error) {
            console.error("Failed to check for running network tasks:", error);
            // Return false as default behavior if check fails.
            return null;
        }
    }

    async getStorageContent(node: string, storage: string, content?: string): Promise<any[]> {
        this.validateId(node, 'Node Name');
        this.validateId(storage, 'Storage ID');
        let url = `nodes/${node}/storage/${storage}/content`;
        if (content) {
            url += `?content=${content}`;
        }
        return this.request(url);
    }
}

export interface ProxmoxUser {
    userid: string;
    realm: string;
    email?: string;
    comment?: string;
    enable?: number;
    expire?: number;
    firstname?: string;
    lastname?: string;
}

export interface ProxmoxACL {
    path: string;
    type: 'user' | 'group' | 'token';
    ugid: string;
    roleid: string;
    propagate: number;
}

export interface ProxmoxGroup {
    groupid: string;
    comment?: string;
    users?: string;
}

export const proxmox = new ProxmoxClient();
