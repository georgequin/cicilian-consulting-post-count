# Cecilia Post Log

A simple, phone-friendly log of every social media post Cecilia Consulting publishes: what was posted, the link, a screenshot, the platforms, date and time, and a comment, grouped week by week so anyone can scroll back and see what was done.

- **Editor** (you): logs, edits and deletes posts.
- **Viewer** (your boss): scrolls the log, read-only.

Built with Next.js, Postgres (Neon) and Vercel Blob for screenshots.

## Deploy to Vercel (about 10 minutes)

1. **Put the code on GitHub.** Create an empty repository, then from this folder:
   ```bash
   git init && git add . && git commit -m "Post log"
   git branch -M main
   git remote add origin https://github.com/<you>/cecilia-post-log.git
   git push -u origin main
   ```
2. **Import it into Vercel.** On vercel.com, choose **Add New → Project**, pick the repository and keep the defaults (framework: Next.js). You can let the first deploy run. It will show an "Almost ready" page until the steps below are done.
3. **Add the database.** In the project, open **Storage → Create Database → Neon (Postgres)** and connect it to the project. Vercel adds `DATABASE_URL` for you. The app creates its table on first use.
4. **Add screenshot storage (optional).** In **Storage → Create → Blob**, create a store and connect it. Vercel adds `BLOB_READ_WRITE_TOKEN`. Without it the app works, just without screenshots.
5. **Set the passwords.** In **Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `ADMIN_PASSWORD` | Your editor password |
   | `VIEW_PASSWORD` | Password for your boss (view-only). Leave unset to let anyone with the link view. |
   | `SESSION_SECRET` | A long random string, e.g. the output of `openssl rand -hex 32` |

6. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables take effect.

Open the site, log in with `ADMIN_PASSWORD`, and tap **+ Log a post**.

### Put it on your phone's home screen

Open the site in Safari (iPhone) or Chrome (Android), then **Share → Add to Home Screen** (iPhone) or **⋮ → Add to Home screen** (Android). It opens full-screen like an app.

## Run it locally

```bash
npm install
cp .env.example .env.local   # fill in DATABASE_URL and ADMIN_PASSWORD
npm run dev                  # http://localhost:3000
```

`npm run db:migrate` creates the table up front if you prefer not to rely on the automatic setup.

## How it works

| Piece | Where |
| --- | --- |
| Feed and log-a-post sheet | `components/PostLog.tsx`, `app/globals.css` |
| API: list, create, edit, delete | `app/api/posts/…` |
| Screenshot upload (resized in the browser, max 4 MB) | `app/api/upload/route.ts` |
| Login (signed, HTTP-only cookie, 30 days) | `lib/auth.ts`, `app/api/login` |
| Database queries and table | `lib/db.ts` |

**Data:** one `posts` table (`post_date`, `post_time`, `title`, `link`, `platforms[]`, `comment`, `image_url`). Dates and times are stored as entered, in your local time.

**Screenshots:** stored in Vercel Blob at unguessable public URLs. Deleting a post, or replacing its screenshot, deletes the old image.

**Security notes:** passwords live only in Vercel's environment variables. Change `SESSION_SECRET` to log everyone out. Viewers can't create, edit or delete, and that is enforced on the server, not only hidden in the page.
