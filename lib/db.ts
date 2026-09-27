import postgres from "postgres";
import type { Post, PostInput, Preview } from "./types";

type Sql = ReturnType<typeof postgres>;

declare global {
  // Reused across hot reloads in dev and across invocations in a warm serverless instance.
  var __cplSql: Sql | undefined;
  var __cplSchema: Promise<void> | undefined;
}

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

function client(): Sql {
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!globalThis.__cplSql) {
    globalThis.__cplSql = postgres(url, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      // Neon's pooled connections (PgBouncer) don't support prepared statements.
      prepare: false,
    });
  }
  return globalThis.__cplSql;
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS posts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_date   date NOT NULL,
  post_time   time,
  title       text NOT NULL DEFAULT '',
  link        text NOT NULL DEFAULT '',
  platforms   text[] NOT NULL DEFAULT '{}',
  comment     text NOT NULL DEFAULT '',
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS posts_when_idx ON posts (post_date DESC, post_time DESC NULLS LAST);
ALTER TABLE posts ADD COLUMN IF NOT EXISTS thumb_url text;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS preview_title text NOT NULL DEFAULT '';
ALTER TABLE posts ADD COLUMN IF NOT EXISTS preview_author text NOT NULL DEFAULT '';
`;

/** Creates the table on first use, so a fresh deploy works with no manual migration step. */
async function ready(): Promise<Sql> {
  const sql = client();
  if (!globalThis.__cplSchema) {
    globalThis.__cplSchema = sql.unsafe(SCHEMA_SQL).then(() => undefined);
    globalThis.__cplSchema.catch(() => {
      globalThis.__cplSchema = undefined; // retry on the next request
    });
  }
  await globalThis.__cplSchema;
  return sql;
}

const COLUMNS = `
  id::text            AS id,
  post_date::text     AS date,
  COALESCE(to_char(post_time, 'HH24:MI'), '') AS time,
  title, link, platforms, comment,
  image_url           AS "imageUrl",
  thumb_url           AS "thumbUrl",
  preview_title       AS "previewTitle",
  preview_author      AS "previewAuthor",
  updated_at          AS "updatedAt"
`;

function toPost(row: Record<string, unknown>): Post {
  return {
    id: String(row.id),
    date: String(row.date),
    time: String(row.time ?? ""),
    title: String(row.title ?? ""),
    link: String(row.link ?? ""),
    platforms: (row.platforms as string[]) ?? [],
    comment: String(row.comment ?? ""),
    imageUrl: (row.imageUrl as string | null) ?? null,
    thumbUrl: (row.thumbUrl as string | null) ?? null,
    previewTitle: String(row.previewTitle ?? ""),
    previewAuthor: String(row.previewAuthor ?? ""),
    updatedAt: new Date(row.updatedAt as string).toISOString(),
  };
}

export async function listPosts(): Promise<Post[]> {
  const sql = await ready();
  const rows = await sql.unsafe(
    `SELECT ${COLUMNS} FROM posts ORDER BY post_date DESC, post_time DESC NULLS LAST, created_at DESC LIMIT 2000`
  );
  return rows.map(toPost);
}

export async function getPost(id: string): Promise<Post | null> {
  const sql = await ready();
  const rows = await sql.unsafe(`SELECT ${COLUMNS} FROM posts WHERE id = $1`, [id]);
  return rows[0] ? toPost(rows[0]) : null;
}

export async function createPost(p: PostInput): Promise<Post> {
  const sql = await ready();
  const rows = await sql.unsafe(
    `INSERT INTO posts (post_date, post_time, title, link, platforms, comment, image_url)
     VALUES ($1, NULLIF($2, '')::time, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [p.date, p.time, p.title, p.link, p.platforms, p.comment, p.imageUrl] as never[]
  );
  return toPost(rows[0]);
}

export async function updatePost(id: string, p: PostInput): Promise<Post | null> {
  const sql = await ready();
  const rows = await sql.unsafe(
    `UPDATE posts SET post_date = $2, post_time = NULLIF($3, '')::time, title = $4, link = $5,
       platforms = $6, comment = $7, image_url = $8, updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, p.date, p.time, p.title, p.link, p.platforms, p.comment, p.imageUrl] as never[]
  );
  return rows[0] ? toPost(rows[0]) : null;
}

export async function deletePost(id: string): Promise<Post | null> {
  const existing = await getPost(id);
  if (!existing) return null;
  const sql = await ready();
  await sql.unsafe(`DELETE FROM posts WHERE id = $1`, [id]);
  return existing;
}

export async function setPreview(id: string, p: Preview): Promise<Post | null> {
  const sql = await ready();
  const rows = await sql.unsafe(
    `UPDATE posts SET thumb_url = $2, preview_title = $3, preview_author = $4 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, p.thumbUrl, p.title, p.author] as never[]
  );
  return rows[0] ? toPost(rows[0]) : null;
}
