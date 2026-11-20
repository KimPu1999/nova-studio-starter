import {loadEnvConfig} from '@next/env';

// `npm start` runs this standalone script before Next boots. Load the same
// .env/.env.local files that Next uses so production validation checks the
// actual application environment instead of only exported shell variables.
loadEnvConfig(process.cwd());

const production = process.env.NODE_ENV === 'production';

const errors: string[] = [];

if (production) {
  if (!process.env.DATABASE_URL) errors.push('DATABASE_URL is required.');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters.');
  }
  if (!process.env.PUBLIC_WEBSITE_URL) {
    errors.push('PUBLIC_WEBSITE_URL is required.');
  } else {
    try {
      const url = new URL(process.env.PUBLIC_WEBSITE_URL);
      const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
      if (url.protocol !== 'https:' && !localHost) errors.push('PUBLIC_WEBSITE_URL must use HTTPS in production.');
    } catch {
      errors.push('PUBLIC_WEBSITE_URL must be a valid URL.');
    }
  }
  if (!process.env.PRIVATE_STORAGE_DIR) {
    errors.push('PRIVATE_STORAGE_DIR is required by the current private filesystem adapter.');
  }
  if (process.env.BILLING_JOBS_TOKEN && process.env.BILLING_JOBS_TOKEN.length < 24) {
    errors.push('BILLING_JOBS_TOKEN must be at least 24 characters (or unset to disable the billing cron endpoint).');
  }
}

if (errors.length > 0) {
  console.error('Environment validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Environment validation passed (${production ? 'production' : 'non-production'}).`);
