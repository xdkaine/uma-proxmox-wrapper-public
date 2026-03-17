/**
 * CSRF-aware fetch wrapper for mutating API calls.
 * Reads the CSRF token from response headers and attaches it to subsequent requests.
 */

let csrfToken: string | null = null;

/**
 * Initialize/refresh the CSRF token from any authenticated response.
 * Called automatically by safeFetch but can be used standalone.
 */
export function updateCSRFToken(response: Response): void {
    const token = response.headers.get('x-csrf-token');
    if (token) {
        csrfToken = token;
    }
}

/**
 * Get the current CSRF token. Returns null if not yet obtained.
 */
export function getCSRFToken(): string | null {
    return csrfToken;
}

/**
 * Fetch the CSRF token from the server by making a lightweight request.
 * Use this on app initialization to prime the token.
 */
export async function refreshCSRFToken(): Promise<string | null> {
    try {
        const res = await fetch('/api/user/me', { credentials: 'include' });
        updateCSRFToken(res);
        return csrfToken;
    } catch {
        return null;
    }
}

/**
 * CSRF-safe fetch wrapper.
 * For GET/HEAD requests, behaves like normal fetch.
 * For POST/PUT/PATCH/DELETE, automatically attaches the X-CSRF-Token header.
 * Also updates the stored CSRF token from response headers.
 */
export async function safeFetch(
    url: string,
    options: RequestInit = {}
): Promise<Response> {
    const method = (options.method || 'GET').toUpperCase();
    const headers = new Headers(options.headers || {});

    // Attach CSRF token for mutating requests
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && csrfToken) {
        headers.set('X-CSRF-Token', csrfToken);
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: options.credentials || 'include',
    });

    // Update CSRF token from response
    updateCSRFToken(response);

    return response;
}

/**
 * CSRF-safe JSON fetch wrapper.
 * Sets Content-Type to application/json, stringifies body, and attaches CSRF token.
 * Returns the parsed JSON response.
 *
 * @throws Error with status info on non-OK responses
 */
export async function safeFetchJSON<T = any>(
    url: string,
    options: RequestInit & { body?: any } = {}
): Promise<T> {
    const headers = new Headers(options.headers || {});

    // Set JSON content type for requests with a body
    if (options.body !== undefined && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
    }

    const response = await safeFetch(url, {
        ...options,
        headers,
        body: options.body !== undefined && typeof options.body !== 'string'
            ? JSON.stringify(options.body)
            : options.body,
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error: any = new Error(errorData.error || `Request failed with status ${response.status}`);
        error.status = response.status;
        error.info = errorData;
        throw error;
    }

    return response.json();
}
