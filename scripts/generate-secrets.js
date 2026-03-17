#!/usr/bin/env node

/**
 * Generate Secure Secrets
 * 
 * This script generates cryptographically secure random secrets
 * for use in the Proxmox Wrapper application.
 */

const crypto = require('crypto');

function generateSecret(bytes = 32) {
    return crypto.randomBytes(bytes).toString('hex');
}

console.log('=== Proxmox Wrapper - Secret Generator ===\n');

console.log('Cookie Secret (SECRET_COOKIE_PASSWORD):');
console.log(generateSecret(32));
console.log('\nUsage: Copy the above value and set it in your .env.local file');
console.log('Example: SECRET_COOKIE_PASSWORD=' + generateSecret(32));
console.log('\n=== Security Recommendations ===');
console.log('- Use different secrets for development and production');
console.log('- Never commit secrets to version control');
console.log('- Rotate secrets periodically (e.g., every 90 days)');
console.log('- Keep secrets in a secure password manager');
