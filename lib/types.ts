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

export type StatPoint = {
  date: string; // YYYY-MM-DD
  followers: number | null;
  following: number | null;
  likes: number | null;
  posts: number | null;
  source: "auto" | "manual";
};

export type Account = {
  id: string;
  platform: string;
  handle: string;
  name: string;
  url: string;
  avatarUrl: string | null;
  history: StatPoint[]; // oldest first
};

export type AccountInput = { platform: string; handle: string; name: string; url: string };
export type AccountStatInput = { date: string; followers: number | null; following: number | null; likes: number | null; posts: number | null };

export type Role = "admin" | "viewer";
