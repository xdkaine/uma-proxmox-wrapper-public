import { Client } from "ldapts";
import { filter as escapeLDAPFilter } from "ldap-escape";
import { logger } from "@/lib/logger";

/**
 * LDAP Service - Simplified and Reliable
 * 
 * Key principles:
 * - Create fresh connections for each operation
 * - Always cleanup connections in finally blocks
 * - Clear error handling and logging
 * - No connection pooling (keep it simple)
 */
export class LdapService {
    /**
     * Creates a new LDAP client connection.
     * Caller is responsible for calling client.unbind() after use.
     */
    private async createClient(): Promise<Client> {
        const LDAP_URL = process.env.LDAP_URL || "ldap://localhost:389";
        const isLdaps = LDAP_URL.startsWith("ldaps://");
        const allowInsecure = process.env.LDAP_ALLOW_INSECURE_TLS === 'true';

        const tlsOptions = isLdaps ? {
            rejectUnauthorized: !allowInsecure,
        } : undefined;

        logger.debug(`[LDAP] Creating client for ${LDAP_URL}`);

        const client = new Client({
            url: LDAP_URL,
            timeout: 5000,
            connectTimeout: 5000,
            tlsOptions,
        });

        return client;
    }

    /**
     * Authenticate user against LDAP/AD
     * 
     * Flow:
     * 1. Create client
     * 2. Bind as service account
     * 3. Search for user DN
     * 4. Re-bind as user to verify password
     * 5. Extract user details and groups
     * 
     * @param username - Username to authenticate
     * @param password - Password to verify
     * @returns Authentication result with user details or error
     */
    async authenticate(username: string, password: string): Promise<{
        success: boolean;
        user?: {
            dn: string;
            username: string;
            displayName: string;
            email: string;
            groups: string[];
        };
        error?: string;
    }> {
        const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
        const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;
        const LDAP_BASE_DN = process.env.LDAP_BASE_DN;
        const LDAP_USER_SEARCH_FILTER = process.env.LDAP_USER_SEARCH_FILTER || "(sAMAccountName={{username}})";
        const LDAP_SEARCH_ATTRIBUTES = (process.env.LDAP_SEARCH_ATTRIBUTES || "sAMAccountName,cn,memberOf,mail,displayName").split(',');

        // Validation
        if (!LDAP_BASE_DN) {
            logger.error("[LDAP] Configuration error: LDAP_BASE_DN is missing");
            return { success: false, error: "LDAP configuration error" };
        }

        if (!LDAP_BIND_DN || !LDAP_BIND_PASSWORD) {
            logger.error("[LDAP] Configuration error: LDAP_BIND_DN or LDAP_BIND_PASSWORD is missing");
            return { success: false, error: "LDAP configuration error" };
        }

        let client: Client | null = null;

        try {
            // 1. Create client
            client = await this.createClient();

            // 2. Bind as service account to search for user
            logger.debug(`[LDAP] Binding as service account: ${LDAP_BIND_DN}`);
            await client.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);

            // 3. Search for user
            const escapedUsername = (escapeLDAPFilter as any)`${username}`;
            const searchFilter = LDAP_USER_SEARCH_FILTER.replace("{{username}}", escapedUsername);

            logger.debug(`[LDAP] Searching for user: ${username} with filter: ${searchFilter}`);

            const { searchEntries } = await client.search(LDAP_BASE_DN, {
                scope: "sub",
                filter: searchFilter,
                attributes: LDAP_SEARCH_ATTRIBUTES,
            });

            if (searchEntries.length === 0) {
                logger.warn(`[LDAP] User not found: ${username}`);
                return { success: false, error: "Invalid credentials" };
            }

            const userEntry = searchEntries[0];
            const userDn = userEntry.dn;

            if (!userDn) {
                logger.error(`[LDAP] User entry missing DN: ${JSON.stringify(userEntry)}`);
                return { success: false, error: "LDAP data error" };
            }

            logger.debug(`[LDAP] Found user DN: ${userDn}`);

            // 4. Verify password by binding as the user
            try {
                await client.bind(userDn, password);
                logger.debug(`[LDAP] Password verified for: ${userDn}`);
            } catch (bindError: any) {
                logger.warn(`[LDAP] Invalid password for: ${username}`);
                return { success: false, error: "Invalid credentials" };
            }

            // 5. Extract user details and groups
            const rawGroups = userEntry.memberOf;

            const groups: string[] = [];

            if (Array.isArray(rawGroups)) {
                groups.push(...rawGroups.map(String));
            } else if (typeof rawGroups === 'string') {
                groups.push(rawGroups);
            }

            const user = {
                dn: userDn,
                username: (userEntry.sAMAccountName as string) || (userEntry.cn as string) || username,
                displayName: (userEntry.displayName as string) || (userEntry.cn as string) || "",
                email: (userEntry.mail as string) || "",
                groups: groups,
            };

            logger.debug(`[LDAP] Authentication successful for: ${user.username}`);
            return { success: true, user };

        } catch (error: any) {
            logger.error(`[LDAP] Authentication error for ${username}: ${error.message}`);
            return { success: false, error: "Authentication failed" };
        } finally {
            // Always cleanup connection
            if (client) {
                try {
                    await client.unbind();
                    logger.debug("[LDAP] Client connection closed");
                } catch (unbindError) {
                    logger.debug("[LDAP] Unbind error (ignoring)");
                }
            }
        }
    }

    /**
     * Search for users (for autocomplete or admin tools)
     * 
     * @param query - Search query string
     * @returns Array of matching users
     */
    async searchUsers(query: string): Promise<Array<{
        username: string;
        cn: string;
        mail: string;
    }>> {
        const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
        const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;
        const LDAP_BASE_DN = process.env.LDAP_BASE_DN;
        const LDAP_SEARCH_ATTRIBUTES = (process.env.LDAP_SEARCH_ATTRIBUTES || "sAMAccountName,cn,mail").split(',');

        if (!LDAP_BASE_DN || !query) {
            return [];
        }

        let client: Client | null = null;

        try {
            client = await this.createClient();

            if (LDAP_BIND_DN && LDAP_BIND_PASSWORD) {
                await client.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);
            }

            const escapedQuery = (escapeLDAPFilter as any)`${query}`;
            const searchFilter = `(|(sAMAccountName=*${escapedQuery}*)(cn=*${escapedQuery}*)(mail=*${escapedQuery}*))`;

            const { searchEntries } = await client.search(LDAP_BASE_DN, {
                scope: "sub",
                filter: searchFilter,
                attributes: LDAP_SEARCH_ATTRIBUTES,
                sizeLimit: 10,
            });

            return searchEntries.map(entry => ({
                username: (entry.sAMAccountName as string) || (entry.cn as string) || "",
                cn: (entry.cn as string) || "",
                mail: (entry.mail as string) || "",
            }));

        } catch (error: any) {
            logger.error(`[LDAP] User search error: ${error.message}`);
            return [];
        } finally {
            if (client) {
                try {
                    await client.unbind();
                } catch { }
            }
        }
    }

    /**
     * Search for groups
     * 
     * @param query - Search query string
     * @returns Array of matching groups
     */
    async searchGroups(query: string): Promise<Array<{
        cn: string;
        dn: string;
        description?: string;
    }>> {
        const LDAP_BIND_DN = process.env.LDAP_BIND_DN;
        const LDAP_BIND_PASSWORD = process.env.LDAP_BIND_PASSWORD;
        const LDAP_GROUPS_BASE_DN = process.env.LDAP_GROUPS_BASE_DN || process.env.LDAP_BASE_DN;

        if (!LDAP_GROUPS_BASE_DN || !query) {
            return [];
        }

        let client: Client | null = null;

        try {
            client = await this.createClient();

            if (LDAP_BIND_DN && LDAP_BIND_PASSWORD) {
                await client.bind(LDAP_BIND_DN, LDAP_BIND_PASSWORD);
            }

            const escapedQuery = (escapeLDAPFilter as any)`${query}`;
            const searchFilter = `(&(objectClass=group)(cn=*${escapedQuery}*))`;

            const { searchEntries } = await client.search(LDAP_GROUPS_BASE_DN, {
                scope: "sub",
                filter: searchFilter,
                attributes: ["cn", "dn", "description"],
                sizeLimit: 20,
            });

            return searchEntries.map(entry => ({
                cn: Array.isArray(entry.cn) ? String(entry.cn[0]) : String(entry.cn),
                dn: entry.dn,
                description: entry.description ? String(entry.description) : undefined,
            }));

        } catch (error: any) {
            logger.error(`[LDAP] Group search error: ${error.message}`);
            return [];
        } finally {
            if (client) {
                try {
                    await client.unbind();
                } catch { }
            }
        }
    }
}

// Export singleton instance
export const ldapService = new LdapService();
