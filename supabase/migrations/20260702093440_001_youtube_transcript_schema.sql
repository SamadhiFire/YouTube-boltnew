/*
# YouTube Transcript Service Schema

1. Purpose
   - Track processing jobs (single video extraction and daily collection)
   - Store video metadata and transcript information
   - Persist job artifacts and status for GitHub Action integration

2. New Tables
   - `jobs` - Processing jobs (media-extract and daily-collect)
   - `videos` - YouTube video metadata
   - `transcripts` - Transcript data with quality metrics
   - `daily_collections` - Daily batch collection records
   
3. Security
   - Single-tenant, no auth: all tables use `TO anon, authenticated`
   - RLS enabled on all tables
   - Data is intentionally public/shared for API access

4. Notes
   - Jobs support both single video extraction and daily batch collection
   - Videos table stores YouTube video metadata
   - Transcripts track quality metrics: coverage_ratio, text_chars, sha256
*/

-- Jobs table for tracking processing status
CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY,
  job_type text NOT NULL CHECK (job_type IN ('media-extract', 'daily-collect')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'failed', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  request_data jsonb NOT NULL,
  result_data jsonb,
  error_type text,
  error_message text
);

-- Videos table for YouTube video metadata
CREATE TABLE IF NOT EXISTS videos (
  id text PRIMARY KEY, -- YouTube video ID
  title text NOT NULL,
  original_title text,
  description text,
  channel_id text,
  channel_name text,
  published_at timestamptz,
  duration_seconds int,
  thumbnail_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Transcripts table with quality metrics
CREATE TABLE IF NOT EXISTS transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_id text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('official_caption', 'auto_caption', 'asr', 'failed')),
  language text,
  text_chars int NOT NULL DEFAULT 0,
  sha256 text,
  duration_seconds int,
  last_timestamp_seconds int,
  coverage_ratio decimal(5,4),
  has_vtt boolean DEFAULT false,
  has_srt boolean DEFAULT false,
  error_type text,
  error_message text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(video_id, language)
);

-- Daily collections table for batch processing
CREATE TABLE IF NOT EXISTS daily_collections (
  id text PRIMARY KEY, -- job_id reference
  date text NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  sources_profile text NOT NULL DEFAULT 'youtube-default',
  require_transcripts boolean DEFAULT true,
  allow_asr boolean DEFAULT true,
  total_videos int DEFAULT 0,
  videos_with_transcripts int DEFAULT 0,
  videos_failed int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Daily collection items (videos in each collection)
CREATE TABLE IF NOT EXISTS daily_collection_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id text NOT NULL REFERENCES daily_collections(id) ON DELETE CASCADE,
  video_id text NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  source_url text,
  category text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(collection_id, video_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcripts_video_id ON transcripts(video_id);
CREATE INDEX IF NOT EXISTS idx_daily_collections_date ON daily_collections(date);
CREATE INDEX IF NOT EXISTS idx_daily_collection_items_collection ON daily_collection_items(collection_id);

-- Enable RLS on all tables
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_collection_items ENABLE ROW LEVEL SECURITY;

-- Policies for jobs (anon access)
DROP POLICY IF EXISTS "anon_crud_jobs" ON jobs;
CREATE POLICY "anon_crud_jobs" ON jobs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_jobs" ON jobs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_jobs" ON jobs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_jobs" ON jobs FOR DELETE TO anon, authenticated USING (true);

-- Policies for videos (anon access)
DROP POLICY IF EXISTS "anon_crud_videos" ON videos;
CREATE POLICY "anon_crud_videos" ON videos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_videos" ON videos FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_videos" ON videos FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_videos" ON videos FOR DELETE TO anon, authenticated USING (true);

-- Policies for transcripts (anon access)
DROP POLICY IF EXISTS "anon_crud_transcripts" ON transcripts;
CREATE POLICY "anon_crud_transcripts" ON transcripts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_transcripts" ON transcripts FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_transcripts" ON transcripts FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_transcripts" ON transcripts FOR DELETE TO anon, authenticated USING (true);

-- Policies for daily_collections (anon access)
DROP POLICY IF EXISTS "anon_crud_daily_collections" ON daily_collections;
CREATE POLICY "anon_crud_daily_collections" ON daily_collections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_daily_collections" ON daily_collections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_daily_collections" ON daily_collections FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_daily_collections" ON daily_collections FOR DELETE TO anon, authenticated USING (true);

-- Policies for daily_collection_items (anon access)
DROP POLICY IF EXISTS "anon_crud_daily_collection_items" ON daily_collection_items;
CREATE POLICY "anon_crud_daily_collection_items" ON daily_collection_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_insert_daily_collection_items" ON daily_collection_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "anon_update_daily_collection_items" ON daily_collection_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_delete_daily_collection_items" ON daily_collection_items FOR DELETE TO anon, authenticated USING (true);