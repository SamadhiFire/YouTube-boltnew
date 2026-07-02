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

// Sources configuration
const SOURCES_CONFIG: Record<string, { sources: any[] }> = {
  "youtube-all": {
    sources: [
      { id: "UCSej6W5W-4PDFsZBif0tYFw", type: "channel", category: "tech-ai-vc", name: "Sequoia Capital" },
      { id: "UCz4St9qG3OAGseWpTwjH6KQ", type: "channel", category: "tech-ai-vc", name: "No Priors Podcast" },
      { id: "PLOXw6I10VTv9GAOCZjUAAkSVyW2cDXs4u", type: "playlist", category: "tech-ai-vc", name: "The OpenAI Podcast" },
      { id: "PLd7-bHaQwnthaNDpZ32TtYONGVk95-fhF", type: "playlist", category: "tech-ai-vc", name: "Dwarkesh Podcast" },
      { id: "UCVYWDY9x8h4wQ7P57rBcnTA", type: "channel", category: "tech-ai-vc", name: "Bg2 Pod" },
      { id: "UCUMZ7gohrM67iV2gcb6HV6w", type: "channel", category: "business-finance", name: "Bloomberg Originals" },
      { id: "UCKMmL5ZahtbeB9dt2FqnZpg", type: "channel", category: "business-finance", name: "Business Breakdowns" },
      { id: "PLe4PRejZgr0NHEFdRxaup9ClCBvX335Xl", type: "playlist", category: "business-finance", name: "Masters in Business" },
      { id: "PLjZkFWu3rWSE2cZ8L2CbiRMmHtJeF0kHh", type: "playlist", category: "business-finance", name: "Acquired Podcast" },
      { id: "UCjS5j8YpRJ4rWMyPw-1S6yg", type: "channel", category: "product-startup", name: "Lenny's Podcast" },
      { id: "PLdMrbgYfVl-s16D_iT2BJCJ90pWtTO1A4", type: "playlist", category: "news-global", name: "The Daily" },
      { id: "UCshZoyx6GEwR8mQXc4MlYrA", type: "channel", category: "culture-society", name: "Lex Fridman", min_duration: 1800 },
    ]
  },
  "tech-ai-vc": {
    sources: [
      { id: "UCSej6W5W-4PDFsZBif0tYFw", type: "channel", category: "tech-ai-vc", name: "Sequoia Capital" },
      { id: "UCz4St9qG3OAGseWpTwjH6KQ", type: "channel", category: "tech-ai-vc", name: "No Priors Podcast" },
      { id: "PLOXw6I10VTv9GAOCZjUAAkSVyW2cDXs4u", type: "playlist", category: "tech-ai-vc", name: "The OpenAI Podcast" },
    ]
  }
};

// ================== Utility Functions ==================

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

// ================== YouTube API Functions ==================

async function getChannelUploadsPlaylistId(channelId: string): Promise<string | null> {
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${YOUTUBE_API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  return data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads || null;
}

async function fetchPlaylistVideos(playlistId: string, pageToken?: string): Promise<{ videos: any[]; nextPageToken?: string }> {
  const maxResults = 50;
  let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${YOUTUBE_API_KEY}`;
  if (pageToken) url += `&pageToken=${pageToken}`;

  const response = await fetch(url);
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
}

async function fetchVideosFromSource(source: any): Promise<any[]> {
  const allVideos: any[] = [];

  if (source.type === "playlist") {
    let pageToken: string | undefined;
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
    } while (pageToken);
  } else {
    const uploadsId = await getChannelUploadsPlaylistId(source.id);
    if (uploadsId) {
      let pageToken: string | undefined;
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
      } while (pageToken);
    }
  }

  return allVideos;
}

async function getVideoDetails(videoIds: string[]): Promise<Record<string, any>> {
  if (videoIds.length === 0) return {};

  const results: Record<string, any> = {};

  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${batch.join(",")}&key=${YOUTUBE_API_KEY}`;

    const response = await fetch(url);
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
  }

  return results;
}

// ================== Transcript Extraction ==================

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
    console.error("Transcript API error:", err);
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

// ================== Main Handler ==================

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
      const { date, window_start, window_end, sources_profile = "youtube-all", require_transcripts = true, sources } = body;

      const jobId = generateJobId("daily");

      await supabase.from("jobs").insert({
        id: jobId,
        job_type: "daily-collect",
        status: "queued",
        request_data: { date, window_start, window_end, sources_profile, require_transcripts, sources },
      });

      await supabase.from("daily_collections").insert({
        id: jobId,
        date,
        window_start,
        window_end,
        sources_profile,
        require_transcripts,
      });

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
    return new Response(
      JSON.stringify({ error: "Internal error", message: err instanceof Error ? err.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ================== Background Processing ==================

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

    console.log(`Starting daily collection ${jobId} for ${date}`);

    const config = SOURCES_CONFIG[profile] || { sources: [] };
    const sources = customSources || config.sources;

    console.log(`Processing ${sources.length} sources`);

    // Collect videos
    const allVideos: any[] = [];
    for (const source of sources) {
      console.log(`Fetching: ${source.name}...`);
      try {
        const videos = await fetchVideosFromSource(source);
        allVideos.push(...videos);
        console.log(`  Found ${videos.length} videos`);
      } catch (err) {
        console.error(`  Error: ${err}`);
      }
    }

    // Filter by time window
    const filteredVideos = allVideos.filter(v => isInTimeWindow(v.publishedAt, windowStart, windowEnd));
    console.log(`Videos in window: ${filteredVideos.length}`);

    if (filteredVideos.length === 0) {
      await supabase.from("jobs").update({
        status: "success",
        completed_at: new Date().toISOString(),
        result_data: { daily_items: [], manifest: { date, total_videos: 0 } }
      }).eq("id", jobId);
      return;
    }

    // Get video details
    const videoIds = filteredVideos.map(v => v.videoId);
    const videoDetails = await getVideoDetails(videoIds);

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

      console.log(`[${i + 1}/${filteredVideos.length}] ${videoId}: ${(details.title || "").slice(0, 50)}...`);

      const item: any = {
        platform: "youtube",
        category: video.category,
        source_name: video.sourceName,
        source_url: `https://www.youtube.com/${video.sourceType === "playlist" ? "playlist?list=" : "channel/"}${video.sourceId}`,
        title: details.title || "",
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published_at: details.publishedAt || video.publishedAt,
        duration: duration,
        description: (details.description || "").slice(0, 500),
        chapters: [],
      };

      // Skip short videos if min_duration set
      if (minDuration > 0 && duration < minDuration) {
        item.transcript_source = "skipped";
        item.error = `Too short (${duration}s < ${minDuration}s)`;
        dailyItems.push(item);
        continue;
      }

      // Get transcript
      if (requireTranscripts && duration >= 300) {
        const result = await getTranscriptFromFreeAPI(videoId, "en");

        if (result && result.segments.length > 0) {
          const txtContent = result.segments.map(s => s.text).join("\n");
          const vttContent = segmentsToVtt(result.segments);
          const metrics = calculateQualityMetrics(result.segments, duration);
          const sha256 = await computeSha256(txtContent);

          item.transcript_source = result.source;
          item.text_chars = metrics.text_chars;
          item.coverage_ratio = metrics.coverage_ratio;

          subtitlesBundle[`youtube_${videoId}`] = {
            txt: txtContent,
            vtt: vttContent,
            json: {
              platform: "youtube",
              media_id: videoId,
              url: item.url,
              text_chars: metrics.text_chars,
              sha256,
              duration_seconds: duration,
              coverage_ratio: metrics.coverage_ratio,
              source: result.source,
            }
          };

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

          processed++;
        } else {
          item.transcript_source = "failed";
          item.error = "No captions available";
          failed++;
        }
      } else {
        item.transcript_source = duration < 300 ? "skipped_short" : "not_required";
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

    // Link videos to collection
    for (const item of dailyItems) {
      const videoId = item.url.split("v=")[1]?.split("&")[0];
      if (videoId) {
        await supabase.from("daily_collection_items").insert({
          collection_id: jobId,
          video_id: videoId,
          source_url: item.source_url,
          category: item.category,
        }).catch(() => {});
      }
    }

    await supabase.from("daily_collections").update({
      total_videos: filteredVideos.length,
      videos_with_transcripts: processed,
      videos_failed: failed,
      completed_at: new Date().toISOString(),
    }).eq("id", jobId);

    await supabase.from("jobs").update({
      status: "success",
      completed_at: new Date().toISOString(),
      result_data: {
        daily_items: dailyItems,
        manifest,
        subtitles_bundle,
        summary: { total: filteredVideos.length, processed, failed }
      },
    }).eq("id", jobId);

    console.log(`Collection ${jobId} complete: ${processed} success, ${failed} failed`);

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
