import fs from 'node:fs';

/**
 * TLS settings for the Postgres connection. DATABASE_SSL=true turns TLS on
 * with certificate verification; DATABASE_SSL_CA optionally names a CA
 * certificate file to trust (for providers with a private CA).
 */
export function databaseSsl(): false | { rejectUnauthorized: true; ca?: string } {
  if (process.env.DATABASE_SSL?.toLowerCase() !== 'true') return false;

  const caPath = process.env.DATABASE_SSL_CA;
  return {
    rejectUnauthorized: true,
    ...(caPath ? { ca: fs.readFileSync(caPath, 'utf8') } : {}),
  };
}
