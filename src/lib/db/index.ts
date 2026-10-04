import pg from "pg";
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";

export interface DbQueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

export interface DbClient {
  query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>>;
  transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isPglite: boolean;
}

let globalClient: DbClient | null = null;

export async function getDb(): Promise<DbClient> {
  if (globalClient) return globalClient;

  const dbUrl = process.env["DATABASE_URL"] || process.env["POSTGRES_URL"];

  if (dbUrl) {
    const pool = new pg.Pool({
      connectionString: dbUrl,
      ssl: process.env["NODE_ENV"] === "production" ? { rejectUnauthorized: false } : undefined,
    });

    const client: DbClient = {
      isPglite: false,
      async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
        const res = await pool.query(text, params);
        return {
          rows: res.rows as T[],
          rowCount: res.rowCount ?? res.rows.length,
        };
      },
      async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
        const pooledClient = await pool.connect();
        try {
          await pooledClient.query("BEGIN");
          const txClient: DbClient = {
            isPglite: false,
            async query<R = any>(text: string, params?: any[]): Promise<DbQueryResult<R>> {
              const res = await pooledClient.query(text, params);
              return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
            },
            async transaction() {
              throw new Error("Nested transactions not supported");
            },
            async close() { /* noop */ },
          };
          const result = await fn(txClient);
          await pooledClient.query("COMMIT");
          return result;
        } catch (err) {
          await pooledClient.query("ROLLBACK");
          throw err;
        } finally {
          pooledClient.release();
        }
      },
      async close() {
        await pool.end();
      },
    };

    globalClient = client;
    return client;
  }

  // Fallback to embedded Postgres 16 WASM (PGlite) with local file storage
  const dataDir = process.env["NERVE_PG_DIR"] || "./nerve-pgdata";
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch { /* exists */ }

  const pglite = new PGlite(dataDir);
  await pglite.waitReady;

  const client: DbClient = {
    isPglite: true,
    async query<T = any>(text: string, params?: any[]): Promise<DbQueryResult<T>> {
      const res = await pglite.query(text, params);
      return {
        rows: (res.rows || []) as T[],
        rowCount: res.rows ? res.rows.length : 0,
      };
    },
    async transaction<T>(fn: (tx: DbClient) => Promise<T>): Promise<T> {
      return (await pglite.transaction(async (tx) => {
        const txClient: DbClient = {
          isPglite: true,
          async query<R = any>(text: string, params?: any[]): Promise<DbQueryResult<R>> {
            const res = await tx.query(text, params);
            return { rows: (res.rows || []) as R[], rowCount: res.rows ? res.rows.length : 0 };
          },
          async transaction() {
            throw new Error("Nested transactions not supported");
          },
          async close() { /* noop */ },
        };
        return await fn(txClient);
      })) as T;
    },
    async close() {
      await pglite.close();
    },
  };

  globalClient = client;
  return client;
}
