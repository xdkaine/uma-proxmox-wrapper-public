'use client';

import { safeFetch } from '@/lib/safe-fetch';

/**
 * Client-side logout button
 * Uses POST to prevent CSRF-based forced logout
 */
export function LogoutButton() {
    const handleLogout = async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        try {
            await safeFetch('/api/logout', { method: 'POST' });
        } catch {
            // Logout regardless
        }
        window.location.href = '/login';
    };

    return (
        <button
            className="text-sm font-medium transition-colors hover:text-destructive cursor-pointer"
            onClick={handleLogout}
        >
            Logout
        </button>
    );
}
