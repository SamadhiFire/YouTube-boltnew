import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const YOUTUBE_API_KEY = Deno.env.get("YOUTUBE_API_KEY") || "AIzaSyADeC0zLvPcZ_jnbTYG5qfWE-cKTwnO4_0";
const MEDIA_API_TOKEN = Deno.env.get("MEDIA_API_TOKEN") || "my-secret-token";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// YouTube sources matching config/sources_by_category.md
const SOURCES_CONFIG: Record<string, { sources: any[] }> = {
  "youtube-default": {
    sources: [
      // Tech / AI / VC
      { id: "UCSej6W5W-4PDFsZBif0tYFw", type: "channel", category: "科技 / AI / VC", name: "Sequoia Capital" },
      { id: "UCz4St9qG3OAGseWpTwjH6KQ", type: "channel", category: "科技 / AI / VC", name: "No Priors Podcast" },
      { id: "PLOXw6I10VTv9GAOCZjUAAkSVyW2cDXs4u", type: "playlist", category: "科技 / AI / VC", name: "The OpenAI Podcast" },
      { id: "PLd7-bHaQwnthaNDpZ32TtYONGVk95-fhF", type: "playlist", category: "科技 / AI / VC", name: "Dwarkesh Podcast" },
      { id: "UCVYWDY9x8h4wQ7P57rBcnTA", type: "channel", category: "科技 / AI / VC", name: "Bg2 Pod" },

      // Business / Finance / Investment
      { id: "UCUMZ7gohrM67iV2gcb6HV6w", type: "channel", category: "商业 / 财经 / 投资", name: "Bloomberg Originals" },
      { id: "UCKMmL5ZahtbeB9dt2FqnZpg", type: "channel", category: "商业 / 财经 / 投资", name: "Business Breakdowns" },
      { id: "UCB3qz3ZS5Ym5kMhJ7T5Q-0q", type: "channel", category: "商业 / 财经 / 投资", name: "Invest Like The Best" },
      { id: "PLe4PRejZgr0NHEFdRxaup9ClCBvX335Xl", type: "playlist", category: "商业 / 财经 / 投资", name: "Masters in Business" },
      { id: "PLe4PRejZgr0OJbRzA6nWybYiThLJd_ouz", type: "playlist", category: "商业 / 财经 / 投资", name: "Odd Lots" },
      { id: "PLe4PRejZgr0MuA6M0zkZyy-99-qc87wKV", type: "playlist", category: "商业 / 财经 / 投资", name: "Odd Lots Audio" },
      { id: "PLGaYlBJIOoa-qaI1saEniG3cR9V0Mu-PE", type: "playlist", category: "商业 / 财经 / 投资", name: "Bloomberg Surveillance" },
      { id: "PLGaYlBJIOoa94hnb-z2i64eVPcGZPUvo9", type: "playlist", category: "商业 / 财经 / 投资", name: "Bloomberg The China Show" },
      { id: "PLe4PRejZgr0PAxeoWOBGj6M7GXhXQmdn6", type: "playlist", category: "商业 / 财经 / 投资", name: "Leaders with Francine Lacqua" },
      { id: "PLjZkFWu3rWSE2cZ8L2CbiRMmHtJeF0kHh", type: "playlist", category: "商业 / 财经 / 投资", name: "Acquired Podcast Full Episodes" },
      { id: "PLjZkFWu3rWSEW_Dh8WQtVXkWphCocktxG", type: "playlist", category: "商业 / 财经 / 投资", name: "ACQ2" },

      // Product / Startup / Management
      { id: "UCjS5j8YpRJ4rWMyPw-1S6yg", type: "channel", category: "产品 / 创业 / 管理", name: "Lenny's Podcast" },
      { id: "UCqXKcHq9iS9sBnNKTSFVrVQ", type: "channel", category: "产品 / 创业 / 管理", name: "The Knowledge Project Podcast" },
      { id: "PLQn7qZwwMmziZuTLRhYseP7Vg9TumF5dv", type: "playlist", category: "产品 / 创业 / 管理", name: "Silicon Valley Girl Podcast" },

      // News / Global Issues
      { id: "UC_6LnzQz4Brq8rpk5G7G2mQ", type: "channel", category: "新闻 / 时评 / 全球议题", name: "Interesting Times with Ross Douthat", min_duration: 600 },
      { id: "PLRNktCZa_EIJjZf5ZSbfUw8tKBLiPMTXk", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "WSJ Take On the Week" },
      { id: "PLRNktCZa_EIK9s9oKiKnwfxz-wqkY7-qI", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "WSJ Bold Names" },
      { id: "PLJI0LFwrJ8Kl8wRL8oqS32EagmpH2yorK", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "The Interview - New York Times" },
      { id: "PLdMrbgYfVl-s16D_iT2BJCJ90pWtTO1A4", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "The Daily" },
      { id: "PLe4PRejZgr0Ns_wjGlmjlPz0cded0nTYS", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "The Mishal Husain Show" },

      // Culture / Society / Humanities
      { id: "UCshZoyx6GEwR8mQXc4MlYrA", type: "channel", category: "文化 / 社会 / 人文", name: "Lex Fridman", min_duration: 1800 },
      { id: "PL959yNJGO7n6ut_Lf717t4LFoswMxl7lL", type: "playlist", category: "文化 / 社会 / 人文", name: "Cannonball with Wesley Morris" },
      { id: "PLwa5nQCz20BRS5qYQ_D2NNQIpdSvYCMUV", type: "playlist", category: "文化 / 社会 / 人文", name: "Revisionist History" },
    ]
  },
  "youtube-all": {
    sources: [
      { id: "UCSej6W5W-4PDFsZBif0tYFw", type: "channel", category: "科技 / AI / VC", name: "Sequoia Capital" },
      { id: "UCz4St9qG3OAGseWpTwjH6KQ", type: "channel", category: "科技 / AI / VC", name: "No Priors Podcast" },
      { id: "PLOXw6I10VTv9GAOCZjUAAkSVyW2cDXs4u", type: "playlist", category: "科技 / AI / VC", name: "The OpenAI Podcast" },
      { id: "PLd7-bHaQwnthaNDpZ32TtYONGVk95-fhF", type: "playlist", category: "科技 / AI / VC", name: "Dwarkesh Podcast" },
      { id: "UCVYWDY9x8h4wQ7P57rBcnTA", type: "channel", category: "科技 / AI / VC", name: "Bg2 Pod" },
      { id: "UCUMZ7gohrM67iV2gcb6HV6w", type: "channel", category: "商业 / 财经 / 投资", name: "Bloomberg Originals" },
      { id: "PLe4PRejZgr0NHEFdRxaup9ClCBvX335Xl", type: "playlist", category: "商业 / 财经 / 投资", name: "Masters in Business" },
      { id: "PLjZkFWu3rWSE2cZ8L2CbiRMmHtJeF0kHh", type: "playlist", category: "商业 / 财经 / 投资", name: "Acquired Podcast Full Episodes" },
      { id: "UCjS5j8YpRJ4rWMyPw-1S6yg", type: "channel", category: "产品 / 创业 / 管理", name: "Lenny's Podcast" },
      { id: "PLdMrbgYfVl-s16D_iT2BJCJ90pWtTO1A4", type: "playlist", category: "新闻 / 时评 / 全球议题", name: "The Daily" },
      { id: "UCshZoyx6GEwR8mQXc4MlYrA", type: "channel", category: "文化 / 社会 / 人文", name: "Lex Fridman", min_duration: 1800 },
    ]
  }
};

// Utility functions
function generateJobId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return parseInt(match[1] || "0") * 3600 + parseInt(match[2] || "0") * 60 + parseInt(match[3] || "0");
}

function isInTimeWindow(publishedAt: string, windowStart: string, windowEnd: string): boolean {
  try {
    const published = new Date(publishedAt);
    const start = new Date(windowStart);
    const end = new Date(windowEnd);
    return published >= start && published < end;
  } catch { return false; }
}

function formatVttTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

async function computeSha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function verifyToken(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  return auth.replace("Bearer ", "") === MEDIA_API_TOKEN;
}

// YouTube API functions
async function getChannelUploadsPlaylistId(channelId: string): Promise<string | null> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const data = await response.json();
    return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
  } catch { return null; }
}

async function fetchPlaylistVideos(playlistId: string, pageToken?: string): Promise<{ videos: any[]; nextPageToken?: string }> {
  const maxResults = 50;
  let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) return { videos: [] };

    const data = await response.json();
    const videos = (data.items || []).map((item: any) => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      publishedAt: item.contentDetails.videoPublishedAt || item.snippet.publishedAt,
      channelId: item.snippet.channelId,
      channelName: item.snippet.channelTitle,
    }));

    return { videos, nextPageToken: data.nextPageToken };
  } catch (err) {
    console.error(`Error fetching playlist ${playlistId}:`, err);
    return { videos: [] };
  }
}

async function fetchVideosFromSource(source: any): Promise<any[]> {
  const allVideos: any[] = [];
  console.log(`Fetching source: ${source.name} (${source.type}: ${source.id})`);

  if (source.type === "playlist") {
    let pageToken: string | undefined;
    let pageCount = 0;
    do {
      const result = await fetchPlaylistVideos(source.id, pageToken);
      allVideos.push(...result.videos.map(v => ({
        ...v,
        sourceId: source.id,
        sourceName: source.name,
        sourceType: "playlist",
        category: source.category,
        minDuration: source.min_duration || 0,
      })));
      pageToken = result.nextPageToken;
      pageCount++;
      // Limit pages to avoid timeout
      if (pageCount >= 3) break;
    } while (pageToken);
  } else {
    const uploadsId = await getChannelUploadsPlaylistId(source.id);
    if (uploadsId) {
      let pageToken: string | undefined;
      let pageCount = 0;
      do {
        const result = await fetchPlaylistVideos(uploadsId, pageToken);
        allVideos.push(...result.videos.map(v => ({
          ...v,
          sourceId: source.id,
          sourceName: source.name,
          sourceType: "channel",
          category: source.category,
          minDuration: source.min_duration || 0,
        })));
        pageToken = result.nextPageToken;
        pageCount++;
        if (pageCount >= 3) break;
      } while (pageToken);
    } else {
      console.log(`  Could not get uploads playlist for channel ${source.id}`);
    }
  }

  console.log(`  Found ${allVideos.length} videos from ${source.name}`);
  return allVideos;
}

async function getVideoDetails(videoIds: string[]): Promise<Record<string, any>> {
  if (videoIds.length === 0) return {};

  const results: Record<string, any> = {};

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch.join(",")}&key=${YOUTUBE_API_KEY}`;

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) continue;

      const data = await response.json();
      for (const item of data.items || []) {
        results[item.id] = {
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description,
          channelId: item.snippet.channelId,
          channelName: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          duration: parseDuration(item.contentDetails.duration),
          thumbnail: item.snippet.thumbnails?.high?.url,
        };
      }
    } catch (err) {
      console.error(`Error getting video details:`, err);
    }
  }

  return results;
}

// Transcript extraction
async function getTranscriptFromFreeAPI(videoId: string, language: string = "en"): Promise<{ text: string; segments: any[]; source: string } | null> {
  try {
    const url = `https://youtube-transcript.ai/transcript/${videoId}.txt?lang=${language}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });

    if (!response.ok) return null;

    const text = await response.text();
    const segments = parseMarkdownTranscript(text);

    if (segments.length > 0) {
      const isAuto = text.includes("[auto]");
      return { text, segments, source: isAuto ? "auto_caption" : "official_caption" };
    }
  } catch (err) {
    console.error(`Transcript API error for ${videoId}:`, err);
  }
  return null;
}

function parseMarkdownTranscript(markdown: string): any[] {
  const segments: any[] = [];
  const lines = markdown.split('\n');

  let currentTime = 0;
  let currentText = "";
  let inTranscript = false;

  for (const line of lines) {
    if (line.startsWith("## Transcript")) {
      inTranscript = true;
      continue;
    }

    if (!inTranscript) continue;
    if (!line.trim() || line.startsWith("---") || line.startsWith("Generated by")) continue;

    const timestampMatch = line.match(/\[(\d+):(\d+)(?::(\d+))?\]\s*(.+)/);
    if (timestampMatch) {
      if (currentText) {
        segments.push({ start: currentTime, end: currentTime + 5, text: currentText.trim() });
      }

      const mins = parseInt(timestampMatch[1], 10);
      const secs = parseInt(timestampMatch[2], 10);
      currentTime = mins * 60 + secs;
      currentText = timestampMatch[4] || "";
    } else if (line.trim()) {
      currentText += " " + line.trim();
    }
  }

  if (currentText) {
    segments.push({ start: currentTime, end: currentTime + 5, text: currentText.trim() });
  }

  return segments;
}

function segmentsToVtt(segments: any[]): string {
  let vtt = "WEBVTT\n\n";
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    vtt += `${i + 1}\n${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.text}\n\n`;
  }
  return vtt;
}

function calculateQualityMetrics(segments: any[], durationSeconds: number) {
  const text = segments.map(s => s.text).join(" ");
  const text_chars = text.length;
  const last_timestamp = segments.length > 0 ? segments[segments.length - 1].end : 0;
  const coverage_ratio = durationSeconds > 0 ? Math.min(last_timestamp / durationSeconds, 1) : 0;
  return {
    text_chars,
    last_timestamp_seconds: Math.floor(last_timestamp),
    coverage_ratio: Math.round(coverage_ratio * 10000) / 10000,
  };
}

// Main handler
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (!verifyToken(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const url = new URL(req.url);

  try {
    // POST /daily-collect
    if (req.method === "POST" && url.pathname.includes("/daily-collect")) {
      const body = await req.json();
      const { date, window_start, window_end, sources_profile = "youtube-default", require_transcripts = true, sources } = body;

      console.log(`Received daily-collect request: date=${date}, profile=${sources_profile}`);

      const jobId = generateJobId("daily");

      await supabase.from("jobs").insert({
        id: jobId,
        job_type: "daily-collect",
        status: "queued",
        request_data: { date, window_start, window_end, sources_profile, require_transcripts, sources },
      });

      try {
        await supabase.from("daily_collections").insert({
          id: jobId,
          date,
          window_start,
          window_end,
          sources_profile,
          require_transcripts,
        });
      } catch (err) {
        console.log("daily_collections insert skipped:", err);
      }

      EdgeRuntime.waitUntil(processDailyCollection(jobId, date, window_start, window_end, sources_profile, require_transcripts, sources));

      return new Response(
        JSON.stringify({ job_id: jobId, status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /daily-collect/{job_id}
    if (req.method === "GET" && url.pathname.includes("/daily-collect")) {
      const pathParts = url.pathname.split("/").filter(p => p);
      const dailyIdx = pathParts.findIndex(p => p === "daily-collect");

      if (dailyIdx === -1 || pathParts.length <= dailyIdx + 1) {
        return new Response(JSON.stringify({ error: "Missing job ID" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const jobId = pathParts[dailyIdx + 1];
      const action = pathParts[dailyIdx + 2];

      if (!action) {
        const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).maybeSingle();

        if (!job) {
          return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        return new Response(JSON.stringify(job), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Download files
      if (action === "files" && pathParts.length > dailyIdx + 3) {
        const fileType = pathParts[dailyIdx + 3];

        const { data: job } = await supabase.from("jobs").select("result_data, status").eq("id", jobId).maybeSingle();

        if (!job || (job.status !== "success" && job.status !== "failed")) {
          return new Response(JSON.stringify({ error: "Not ready" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const result = job.result_data as any || {};

        switch (fileType) {
          case "daily_items.json":
            return new Response(JSON.stringify(result.daily_items || [], null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          case "manifest.json":
            return new Response(JSON.stringify(result.manifest || {}, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          case "subtitles_bundle.json":
            return new Response(JSON.stringify(result.subtitles_bundle || {}, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          default:
            return new Response(JSON.stringify(result, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown";
    console.error("Handler error:", errorMessage);
    return new Response(
      JSON.stringify({ error: "Internal error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Background processing
async function processDailyCollection(
  jobId: string,
  date: string,
  windowStart: string,
  windowEnd: string,
  profile: string,
  requireTranscripts: boolean,
  customSources?: any[]
) {
  try {
    await supabase.from("jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);

    console.log(`=== Daily Collection ${jobId} ===`);
    console.log(`Date: ${date}`);
    console.log(`Window: ${windowStart} to ${windowEnd}`);
    console.log(`Profile: ${profile}`);

    const config = SOURCES_CONFIG[profile];
    if (!config) {
      throw new Error(`Unknown profile: ${profile}. Available: ${Object.keys(SOURCES_CONFIG).join(", ")}`);
    }

    const sources = customSources || config.sources;
    console.log(`Sources to process: ${sources.length}`);

    // Log source names
    for (const s of sources) {
      console.log(`  - ${s.name} (${s.type}: ${s.id})`);
    }

    // Collect videos from all sources
    const allVideos: any[] = [];
    for (const source of sources) {
      try {
        const videos = await fetchVideosFromSource(source);
        allVideos.push(...videos);
      } catch (err) {
        console.error(`Error fetching ${source.name}:`, err);
      }
    }

    console.log(`\nTotal videos collected: ${allVideos.length}`);

    // Filter by time window
    const filteredVideos = allVideos.filter(v => {
      const inWindow = isInTimeWindow(v.publishedAt, windowStart, windowEnd);
      if (inWindow) {
        console.log(`  IN WINDOW: ${v.videoId} - ${v.title?.slice(0, 50)}... (${v.publishedAt})`);
      }
      return inWindow;
    });

    console.log(`Videos in time window: ${filteredVideos.length}`);

    if (filteredVideos.length === 0) {
      console.log("No videos in time window - returning empty result");

      await supabase.from("jobs").update({
        status: "success",
        completed_at: new Date().toISOString(),
        result_data: {
          daily_items: [],
          manifest: {
            date,
            window_start: windowStart,
            window_end: windowEnd,
            sources_profile: profile,
            total_videos: 0,
            videos_with_transcripts: 0,
            videos_failed: 0,
            coverage_ratio: 0,
            processed_at: new Date().toISOString(),
          },
          subtitles_bundle: {},
          summary: { total: 0, processed: 0, failed: 0 }
        }
      }).eq("id", jobId);
      return;
    }

    // Get video details
    const videoIds = filteredVideos.map(v => v.videoId);
    const videoDetails = await getVideoDetails(videoIds);
    console.log(`Got details for ${Object.keys(videoDetails).length} videos`);

    // Process each video
    const dailyItems: any[] = [];
    const subtitlesBundle: Record<string, any> = {};
    let processed = 0;
    let failed = 0;

    for (let i = 0; i < filteredVideos.length; i++) {
      const video = filteredVideos[i];
      const videoId = video.videoId;
      const details = videoDetails[videoId] || {};
      const duration = details.duration || 0;
      const minDuration = video.minDuration || 0;

      console.log(`\n[${i + 1}/${filteredVideos.length}] ${videoId}`);
      console.log(`  Title: ${(details.title || video.title || "").slice(0, 60)}...`);
      console.log(`  Duration: ${duration}s, Min: ${minDuration}s`);
      console.log(`  Published: ${details.publishedAt || video.publishedAt}`);

      const item: any = {
        platform: "youtube",
        category: video.category,
        source_name: video.sourceName,
        source_url: `https://www.youtube.com/${video.sourceType === "playlist" ? "playlist?list=" : "channel/"}${video.sourceId}`,
        title: details.title || video.title || "",
        original_title: details.title || video.title || "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: details.publishedAt || video.publishedAt,
        duration: duration,
        duration_seconds: duration,
        description: (details.description || "").slice(0, 500),
        chapters: [],
        video_id: videoId,
      };

      // Skip short videos if min_duration set
      if (minDuration > 0 && duration < minDuration) {
        console.log(`  SKIPPED: Too short (${duration}s < ${minDuration}s)`);
        item.transcript_source = "skipped";
        item.error = `Too short (${duration}s < ${minDuration}s)`;
        dailyItems.push(item);
        continue;
      }

      // Get transcript for videos >= 300 seconds
      if (requireTranscripts && duration >= 300) {
        console.log(`  Fetching transcript...`);
        const result = await getTranscriptFromFreeAPI(videoId, "en");

        if (result && result.segments.length > 0) {
          console.log(`  SUCCESS: ${result.segments.length} segments, source: ${result.source}`);

          const txtContent = result.segments.map(s => s.text).join("\n");
          const vttContent = segmentsToVtt(result.segments);
          const metrics = calculateQualityMetrics(result.segments, duration);
          const sha256 = await computeSha256(txtContent);

          item.transcript_source = result.source;
          item.text_chars = metrics.text_chars;
          item.coverage_ratio = metrics.coverage_ratio;
          item.last_timestamp_seconds = metrics.last_timestamp_seconds;

          subtitlesBundle[`youtube_${videoId}`] = {
            video_id: videoId,
            url: item.url,
            title: item.title,
            duration_seconds: duration,
            last_timestamp_seconds: metrics.last_timestamp_seconds,
            coverage_ratio: metrics.coverage_ratio,
            transcript_source: result.source,
            language: "en",
            transcript_text: txtContent,
            transcript_vtt: vttContent,
            text_chars: metrics.text_chars,
            sha256,
          };

          // Save to database
          try {
            await supabase.from("videos").upsert({
              id: videoId,
              title: details.title,
              description: details.description,
              channel_id: details.channelId,
              channel_name: details.channelName,
              published_at: details.publishedAt,
              duration_seconds: duration,
              thumbnail_url: details.thumbnail,
              updated_at: new Date().toISOString(),
            });

            await supabase.from("transcripts").upsert({
              video_id: videoId,
              source: result.source,
              text_chars: metrics.text_chars,
              sha256,
              duration_seconds: duration,
              last_timestamp_seconds: metrics.last_timestamp_seconds,
              coverage_ratio: metrics.coverage_ratio,
              has_vtt: true,
            });
          } catch (err) {
            console.log(`  DB save error:`, err);
          }

          processed++;
        } else {
          console.log(`  FAILED: No transcript available`);
          item.transcript_source = "failed";
          item.error = "No captions available";
          failed++;
        }
      } else {
        item.transcript_source = duration < 300 ? "skipped_short" : "not_required";
        console.log(`  SKIPPED: ${item.transcript_source}`);
      }

      dailyItems.push(item);
    }

    // Build manifest
    const manifest = {
      date,
      window_start: windowStart,
      window_end: windowEnd,
      sources_profile: profile,
      total_videos: filteredVideos.length,
      videos_with_transcripts: processed,
      videos_failed: failed,
      coverage_ratio: filteredVideos.length > 0 ? processed / filteredVideos.length : 0,
      processed_at: new Date().toISOString(),
    };

    // Save collection items
    for (const item of dailyItems) {
      try {
        await supabase.from("daily_collection_items").insert({
          collection_id: jobId,
          video_id: item.video_id,
          source_url: item.source_url,
          category: item.category,
        });
      } catch (err) {
        // Ignore duplicate errors
      }
    }

    // Update collection record
    try {
      await supabase.from("daily_collections").update({
        total_videos: filteredVideos.length,
        videos_with_transcripts: processed,
        videos_failed: failed,
        completed_at: new Date().toISOString(),
      }).eq("id", jobId);
    } catch (err) {
      console.log("daily_collections update skipped:", err);
    }

    // Update job
    await supabase.from("jobs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      result_data: {
        daily_items: dailyItems,
        manifest,
        subtitles_bundle: subtitlesBundle,
        summary: { total: filteredVideos.length, processed, failed }
      },
    }).eq("id", jobId);

    console.log(`\n=== Collection Complete ===`);
    console.log(`Total: ${filteredVideos.length}, Processed: ${processed}, Failed: ${failed}`);

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown";
    console.error(`Collection ${jobId} failed:`, errorMessage);

    await supabase.from("jobs").update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_type: "processing_error",
      error_message: errorMessage,
    }).eq("id", jobId);
  }
}
