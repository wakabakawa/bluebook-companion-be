import { Client } from "pg";

try {
  process.loadEnvFile();
} catch {
  // no .env file - fine, DB_URL can still come from a real exported env var
}

export function connect(): Client {
  const connectionString = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  return new Client({ connectionString });
}
