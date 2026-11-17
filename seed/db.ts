import { Client } from "pg";

export function connect(): Client {
  const connectionString = process.env.DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  return new Client({ connectionString });
}
