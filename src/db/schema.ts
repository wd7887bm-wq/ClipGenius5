import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  youtubeUrl: text("youtube_url").notNull(),
  videoTitle: text("video_title"),
  captionStyle: text("caption_style").notNull().default("oneword"),
  status: text("status").notNull().default("pending"),
  // pending | queued | downloading | processing | captioning | done | error
  progress: integer("progress").notNull().default(0),
  progressMessage: text("progress_message"),
  errorMessage: text("error_message"),
  clips: jsonb("clips").$type<ClipInfo[]>(),
  expiresAt: timestamp("expires_at"), // Auto-delete after this time
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ClipInfo = {
  index: number;
  filename: string;
  captionedFilename: string;
  startTime: number;
  endTime: number;
  duration: number;
};

export type Job = typeof jobs.$inferSelect;
export type NewJob = typeof jobs.$inferInsert;
