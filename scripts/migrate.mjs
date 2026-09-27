// Optional: the app creates its table on first request. Run this to create it up front:
//   DATABASE_URL=... npm run db:migrate
import postgres from "postgres";

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) {
  console.error("Set DATABASE_URL first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, prepare: false });
await sql.unsafe(`
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
`);
console.log("posts table is ready");
await sql.end();
