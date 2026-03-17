declare module 'ldap-escape' {
    export function filter(input: string): string;
    export function dn(input: string): string;
}
