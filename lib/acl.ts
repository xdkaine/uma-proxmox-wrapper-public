import { proxmox } from "@/lib/proxmox-api";

export type PermissionCheckResult = {
    hasAccess: boolean;
    allowManage: boolean;
};

const VM_ACTION_ROLES = new Set(['Administrator', 'PVEAdmin', 'PVEVMAdmin', 'PVEVMUser']);
const POOL_MANAGE_ROLES = new Set(['Administrator', 'PVEAdmin']);
const POOL_ACCESS_ROLES = new Set(['Administrator', 'PVEPoolUser', 'PVEAdmin', 'PVEVMUser', 'PVEVMAdmin']);
const NON_ACCESS_ROLE_PATTERNS = [/^NoAccess$/i, /no[_-]?access/i, /deny/i];

const extractGroupName = (group: string): string => {
    const match = group.match(/^CN=([^,]+)/i);
    return match ? match[1] : group;
};

export const buildUsernameVariants = (username: string): Set<string> => {
    const variants = new Set<string>();
    const raw = (username || '').trim();
    if (!raw) return variants;

    const addVariant = (value: string) => {
        const normalized = value.trim();
        if (!normalized) return;
        variants.add(normalized);
        variants.add(normalized.toLowerCase());
    };

    addVariant(raw);

    if (raw.includes('\\')) {
        const shortName = raw.split('\\').pop() || '';
        addVariant(shortName);
    }

    Array.from(variants).forEach((value) => {
        if (value.includes('@')) {
            const localPart = value.split('@')[0];
            addVariant(localPart);
        }
    });

    return variants;
};

export const isNonAccessRole = (roleId: string): boolean => {
    if (!roleId) return true;
    return NON_ACCESS_ROLE_PATTERNS.some((pattern) => pattern.test(roleId));
};

export const derivePoolAccessFromAclRoles = (roleIds: string[]): PermissionCheckResult => {
    const normalizedRoles = roleIds.filter(Boolean);
    if (normalizedRoles.length === 0) {
        return { hasAccess: false, allowManage: false };
    }

    const hasNonAccessRole = normalizedRoles.some(isNonAccessRole);
    if (hasNonAccessRole) {
        return { hasAccess: false, allowManage: false };
    }

    const hasAllowedAccessRole = normalizedRoles.some((roleId) => POOL_ACCESS_ROLES.has(roleId));
    if (!hasAllowedAccessRole) {
        return { hasAccess: false, allowManage: false };
    }

    const allowManage = normalizedRoles.some((roleId) => POOL_MANAGE_ROLES.has(roleId));
    return { hasAccess: true, allowManage };
};

export const buildGroupIdVariants = (userGroups: string[]): Set<string> => {
    const variants = new Set<string>();
    const envRealm = process.env.PROXMOX_USER_REALM;

    userGroups.forEach((group) => {
        if (!group) return;

        const raw = group.trim();
        if (raw) {
            variants.add(raw);
            variants.add(raw.toLowerCase());
        }

        const name = extractGroupName(group).trim();
        if (name) {
            variants.add(name);
            variants.add(name.toLowerCase());

            if (envRealm && !name.endsWith(`-${envRealm}`)) {
                const withRealm = `${name}-${envRealm}`;
                variants.add(withRealm);
                variants.add(withRealm.toLowerCase());
            }
        }
    });

    return variants;
};

export const getGroupNameCandidates = (userGroups: string[]): string[] => {
    const names = new Set<string>();
    const envRealm = process.env.PROXMOX_USER_REALM;

    userGroups.forEach((group) => {
        const name = extractGroupName(group).trim();
        if (!name) return;
        names.add(name);

        if (envRealm) {
            const realmSuffix = `-${envRealm}`;
            const realmSuffixLower = realmSuffix.toLowerCase();

            if (!name.toLowerCase().endsWith(realmSuffixLower)) {
                names.add(`${name}-${envRealm}`);
            } else {
                // Also add the version without the suffix so ownership check matches DEV_BASE_#
                const baseName = name.substring(0, name.length - realmSuffix.length);
                if (baseName) {
                    names.add(baseName);
                }
            }
        }
    });

    return Array.from(names);
};

/**
 * Lightweight ownership check — only checks pool naming convention.
 * Used for the pool LIST view to avoid over-exposure from broad Proxmox ACLs.
 *
 * Returns true if:
 * 1. User is admin
 * 2. Pool ID starts with DEV_username_
 * 3. Pool ID starts with DEV_groupname_ for any of the user's groups
 */
export function checkPoolOwnership(username: string, userGroups: string[], poolId: string, isAdmin: boolean = false): PermissionCheckResult {
    if (isAdmin) {
        return { hasAccess: true, allowManage: true };
    }

    // User owns the pool
    const usernameVariants = buildUsernameVariants(username);
    for (const usernameVariant of usernameVariants) {
        const sanitizedUsername = usernameVariant.replace(/[^a-zA-Z0-9\-_]/g, '_');
        if (poolId.startsWith(`DEV_${sanitizedUsername}_`)) {
            return { hasAccess: true, allowManage: true };
        }
    }

    // Group owns the pool
    const groupCandidates = getGroupNameCandidates(userGroups);
    for (const group of groupCandidates) {
        const sanitizedGroup = group.replace(/[^a-zA-Z0-9\-_]/g, '_');
        if (poolId.startsWith(`DEV_${sanitizedGroup}_`)) {
            return { hasAccess: true, allowManage: true };
        }
    }

    return { hasAccess: false, allowManage: false };
}

/**
 * Checks if a user has access to a specific Resource Pool.
 *
 * Access is granted if:
 * 1. The user owns the pool (Pool ID starts with DEV_username_).
 * 2. The user has a specific ACL on the pool path (/pool/{poolId}).
 *    - User ACL: exact username match.
 *    - Group ACL: user belongs to the group.
 *
 * Management rights (allowManage) are granted if:
 * 1. User owns the pool.
 * 2. User has 'Administrator' or 'PVEAdmin' role via ACL.
 */
export async function checkPoolAccess(username: string, userGroups: string[], poolId: string, isAdmin: boolean = false): Promise<PermissionCheckResult> {
    let hasAccess = false;
    let allowManage = false;
    const groupIdVariants = buildGroupIdVariants(userGroups);
    const usernameVariants = buildUsernameVariants(username);

    // 0. Check Admin Override
    if (isAdmin) {
        return { hasAccess: true, allowManage: true };
    }

    // 1. Check Ownership (DEV_username_* or DEV_groupname_*)
    // This is the strongest permission for our dev pools
    for (const usernameVariant of usernameVariants) {
        const sanitizedUsername = usernameVariant.replace(/[^a-zA-Z0-9\-_]/g, '_');
        if (poolId.startsWith(`DEV_${sanitizedUsername}_`)) {
            hasAccess = true;
            allowManage = true;
            break;
        }
    }

    // Check if user belongs to a group that owns this pool
    // Pool ID format: DEV_groupName_#
    if (!hasAccess) {
        const groupCandidates = getGroupNameCandidates(userGroups);
        for (const group of groupCandidates) {
            const sanitizedGroup = group.replace(/[^a-zA-Z0-9\-_]/g, '_');
            if (poolId.startsWith(`DEV_${sanitizedGroup}_`)) {
                hasAccess = true;
                allowManage = true;
                break;
            }
        }
    }

    // 2. Check ACLs if strict ownership doesn't cover everything 
    // (or if we want to allow shared access to non-owned pools)
    if (!hasAccess || !allowManage) {
        try {
            const acls = await proxmox.getACLs();
            const poolPath = `/pool/${poolId}`;

            const relevantAcls = acls.filter(acl => {
                if (acl.path !== poolPath) return false;

                if (acl.type === 'user') {
                    // Exact match: either "username" or "username@realm"
                    const [aclUser] = acl.ugid.split('@');
                    return usernameVariants.has(aclUser) || usernameVariants.has(acl.ugid);
                }

                if (acl.type === 'group') {
                    return groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase());
                }

                return false;
            });

            if (relevantAcls.length > 0) {
                const aclDerivedAccess = derivePoolAccessFromAclRoles(relevantAcls.map((acl) => acl.roleid));
                if (aclDerivedAccess.hasAccess) {
                    hasAccess = true;
                    if (aclDerivedAccess.allowManage) {
                        allowManage = true;
                    }
                }
            }
        } catch (error) {
            console.error("Error fetching ACLs during pool check:", error);
            // Fail safe: if we can't check ACLs, and ownership didn't grant access, deny.
        }
    }

    return { hasAccess, allowManage };
}

/**
 * Checks if a user has access to a specific Virtual Machine.
 * 
 * Access is granted if:
 * 1. The user has direct ACL access to the VM path (/vms/{vmid}).
 * 2. The VM belongs to a Resource Pool that the user has access to.
 */
export async function checkVMAccess(
    username: string,
    userGroups: string[],
    vmid: string,
    isAdmin: boolean = false,
    requireActionRole: boolean = false
): Promise<boolean> {
    // 0. Check Admin Override
    if (isAdmin) {
        return true;
    }

    try {
        const acls = await proxmox.getACLs();

        // 1. Check Direct VM ACLs
        const vmPath = `/vms/${vmid}`;
        const groupIdVariants = buildGroupIdVariants(userGroups);

        const hasDirectAccess = acls.some(acl => {
            if (acl.path !== vmPath) return false;

            if (requireActionRole && !VM_ACTION_ROLES.has(acl.roleid)) {
                return false;
            }

            if (acl.type === 'user') {
                const [aclUser] = acl.ugid.split('@');
                return aclUser === username || acl.ugid === username;
            }

            if (acl.type === 'group') {
                return groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase());
            }

            return false;
        });

        if (hasDirectAccess) return true;

        // 2. Check Pool Membership via resource mapping (resources include pool for VM/LXC)
        const resources = await proxmox.getResources('vm');
        const vmResource = resources.find(r => r.id === `qemu/${vmid}` || r.id === `lxc/${vmid}` || r.vmid?.toString() === vmid);

        if (vmResource && vmResource.pool) {
            const poolId = vmResource.pool as string;

            if (!requireActionRole) {
                const poolAccess = await checkPoolAccess(username, userGroups, poolId);
                if (poolAccess.hasAccess) {
                    return true;
                }
            } else {
                const poolPath = `/pool/${poolId}`;
                const groupIdVariants = buildGroupIdVariants(userGroups);

                const hasPoolActionAccess = acls.some(acl => {
                    if (acl.path !== poolPath) return false;
                    if (!VM_ACTION_ROLES.has(acl.roleid)) return false;

                    if (acl.type === 'user') {
                        const [aclUser] = acl.ugid.split('@');
                        return aclUser === username || acl.ugid === username;
                    }

                    if (acl.type === 'group') {
                        return groupIdVariants.has(acl.ugid) || groupIdVariants.has(acl.ugid.toLowerCase());
                    }

                    return false;
                });

                if (hasPoolActionAccess) {
                    return true;
                }

                const poolAccess = await checkPoolAccess(username, userGroups, poolId);
                if (poolAccess.allowManage) {
                    return true;
                }
            }
        }

        return false;

    } catch (error) {
        console.error(`Error checking VM access for ${vmid}:`, error);
        return false;
    }
}
