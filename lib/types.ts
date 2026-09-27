export const PLATFORMS = ["LinkedIn", "Instagram", "Facebook", "TikTok", "X", "WhatsApp"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type Post = {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM or ""
  title: string;
  link: string;
  platforms: string[];
  comment: string;
  imageUrl: string | null; // screenshot the editor uploaded
  thumbUrl: string | null; // thumbnail fetched from the link
  previewTitle: string; // caption/title fetched from the link
  previewAuthor: string; // account name fetched from the link
  updatedAt: string;
};

export type PostInput = Pick<Post, "date" | "time" | "title" | "link" | "platforms" | "comment" | "imageUrl">;

export type Preview = { thumbUrl: string | null; title: string; author: string };

export type Role = "admin" | "viewer";
