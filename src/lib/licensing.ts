import crypto from 'node:crypto';
export function generateLicenseKey(){return `NOVA-${crypto.randomBytes(5).toString('hex').toUpperCase()}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;}
