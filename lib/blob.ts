import { del } from "@vercel/blob";

export function uploadsEnabled(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

/** Best-effort removal of a screenshot we stored; never throws. */
export async function removeBlob(url: string | null | undefined): Promise<void> {
  if (!url || !uploadsEnabled()) return;
  if (!/\.blob\.vercel-storage\.com\//.test(url)) return;
  try {
    await del(url);
  } catch {
    /* an orphaned image is harmless */
  }
}
