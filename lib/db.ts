import postgres from "postgres";
import type { Account, AccountInput, AccountStatInput, Post, PostInput, Preview } from "./types";

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
CREATE TABLE IF NOT EXISTS accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    text NOT NULL,
  handle      text NOT NULL DEFAULT '',
  name        text NOT NULL DEFAULT '',
  url         text NOT NULL DEFAULT '',
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS account_stats (
  account_id  uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  captured_on date NOT NULL,
  followers   integer,
  following   integer,
  likes       bigint,
  posts       integer,
  source      text NOT NULL DEFAULT 'manual',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, captured_on)
);
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

/* ---------------- social accounts ---------------- */

const ACCOUNT_COLUMNS = `
  a.id::text AS id, a.platform, a.handle, a.name, a.url, a.avatar_url AS "avatarUrl",
  COALESCE((
    SELECT json_agg(json_build_object(
      'date', s.captured_on::text, 'followers', s.followers, 'following', s.following,
      'likes', s.likes, 'posts', s.posts, 'source', s.source
    ) ORDER BY s.captured_on)
    FROM account_stats s WHERE s.account_id = a.id AND s.captured_on > current_date - 400
  ), '[]'::json) AS history
`;

function toAccount(row: Record<string, unknown>): Account {
  const history = (row.history as Account["history"]) ?? [];
  return {
    id: String(row.id),
    platform: String(row.platform),
    handle: String(row.handle ?? ""),
    name: String(row.name ?? ""),
    url: String(row.url ?? ""),
    avatarUrl: (row.avatarUrl as string | null) ?? null,
    history: history.map((h) => ({
      date: h.date,
      followers: h.followers == null ? null : Number(h.followers),
      following: h.following == null ? null : Number(h.following),
      likes: h.likes == null ? null : Number(h.likes),
      posts: h.posts == null ? null : Number(h.posts),
      source: h.source,
    })),
  };
}

export async function listAccounts(): Promise<Account[]> {
  const sql = await ready();
  const rows = await sql.unsafe(`SELECT ${ACCOUNT_COLUMNS} FROM accounts a ORDER BY a.created_at`);
  return rows.map(toAccount);
}

export async function getAccount(id: string): Promise<Account | null> {
  const sql = await ready();
  const rows = await sql.unsafe(`SELECT ${ACCOUNT_COLUMNS} FROM accounts a WHERE a.id = $1`, [id]);
  return rows[0] ? toAccount(rows[0]) : null;
}

export async function createAccount(a: AccountInput): Promise<Account> {
  const sql = await ready();
  const rows = await sql.unsafe(
    `INSERT INTO accounts (platform, handle, name, url) VALUES ($1, $2, $3, $4) RETURNING id::text AS id`,
    [a.platform, a.handle, a.name, a.url]
  );
  return (await getAccount(String(rows[0].id)))!;
}

export async function updateAccount(id: string, a: Partial<AccountInput> & { avatarUrl?: string | null }): Promise<Account | null> {
  const sql = await ready();
  await sql.unsafe(
    `UPDATE accounts SET
       platform = COALESCE($2, platform), handle = COALESCE($3, handle), name = COALESCE($4, name),
       url = COALESCE($5, url), avatar_url = CASE WHEN $6::boolean THEN $7 ELSE avatar_url END
     WHERE id = $1`,
    [id, a.platform ?? null, a.handle ?? null, a.name ?? null, a.url ?? null, "avatarUrl" in a, a.avatarUrl ?? null] as never[]
  );
  return getAccount(id);
}

export async function deleteAccount(id: string): Promise<Account | null> {
  const existing = await getAccount(id);
  if (!existing) return null;
  const sql = await ready();
  await sql.unsafe(`DELETE FROM accounts WHERE id = $1`, [id]);
  return existing;
}

/** One snapshot per account per day. Manual numbers win over automatic ones on the same day. */
export async function saveStat(id: string, s: AccountStatInput, source: "auto" | "manual"): Promise<void> {
  const sql = await ready();
  await sql.unsafe(
    `INSERT INTO account_stats (account_id, captured_on, followers, following, likes, posts, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (account_id, captured_on) DO UPDATE SET
       followers = CASE WHEN account_stats.source = 'manual' AND $7 = 'auto' THEN account_stats.followers ELSE COALESCE(EXCLUDED.followers, account_stats.followers) END,
       following = CASE WHEN account_stats.source = 'manual' AND $7 = 'auto' THEN account_stats.following ELSE COALESCE(EXCLUDED.following, account_stats.following) END,
       likes     = CASE WHEN account_stats.source = 'manual' AND $7 = 'auto' THEN account_stats.likes     ELSE COALESCE(EXCLUDED.likes, account_stats.likes) END,
       posts     = CASE WHEN account_stats.source = 'manual' AND $7 = 'auto' THEN account_stats.posts     ELSE COALESCE(EXCLUDED.posts, account_stats.posts) END,
       source    = CASE WHEN account_stats.source = 'manual' THEN 'manual' ELSE EXCLUDED.source END,
       updated_at = now()`,
    [id, s.date, s.followers, s.following, s.likes, s.posts, source] as never[]
  );
}

export async function autoStatExists(id: string, date: string): Promise<boolean> {
  const sql = await ready();
  const rows = await sql.unsafe(`SELECT 1 FROM account_stats WHERE account_id = $1 AND captured_on = $2`, [id, date]);
  return rows.length > 0;
}
