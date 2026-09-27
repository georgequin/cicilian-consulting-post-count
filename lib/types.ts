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
  imageUrl: string | null;
  updatedAt: string;
};

export type PostInput = Omit<Post, "id" | "updatedAt">;

export type Role = "admin" | "viewer";
