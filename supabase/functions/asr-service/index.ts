import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MEDIA_API_TOKEN = Deno.env.get("MEDIA_API_TOKEN")!;

// Optional: External ASR service URL (e.g., Hugging Face Inference API, Replicate, etc.)
const ASR_SERVICE_URL = Deno.env.get("ASR_SERVICE_URL") || "";
const ASR_API_KEY = Deno.env.get("ASR_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function verifyToken(req: Request): boolean {
  const auth = req.headers.get("Authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  return token === MEDIA_API_TOKEN;
}

function generateJobId(prefix: string): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

interface ASRResult {
  segments: {
    start: number;
    end: number;
    text: string;
  }[];
  language: string;
  language_probability: number;
}

async function callExternalASR(audioUrl: string, language: string): Promise<ASRResult | null> {
  // If external ASR service is configured, call it
  if (!ASR_SERVICE_URL) {
    console.log("No external ASR service configured");
    return null;
  }

  try {
    const response = await fetch(ASR_SERVICE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ASR_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        audio_url: audioUrl,
        language: language || "zh",
        model: "small", // faster-whisper small model
        return_timestamps: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ASR service error: ${response.status}`, errorText);
      return null;
    }

    const data = await response.json();

    // Convert to standard format
    if (data.segments && Array.isArray(data.segments)) {
      return {
        segments: data.segments.map((seg: any) => ({
          start: seg.start || seg.begin || 0,
          end: seg.end || 0,
          text: seg.text?.trim() || "",
        })),
        language: data.language || language,
        language_probability: data.language_probability || 1.0,
      };
    }

    return null;
  } catch (err) {
    console.error("ASR service call failed:", err);
    return null;
  }
}

function segmentsToTxt(segments: ASRResult["segments"]): string {
  return segments.map(s => s.text).join("\n");
}

function segmentsToVtt(segments: ASRResult["segments"]): string {
  let vtt = "WEBVTT\n\n";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = formatVttTime(seg.start);
    const end = formatVttTime(seg.end);

    vtt += `${i + 1}\n`;
    vtt += `${start} --> ${end}\n`;
    vtt += `${seg.text}\n\n`;
  }

  return vtt;
}

function segmentsToSrt(segments: ASRResult["segments"]): string {
  let srt = "";

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const start = formatSrtTime(seg.start);
    const end = formatSrtTime(seg.end);

    srt += `${i + 1}\n`;
    srt += `${start} --> ${end}\n`;
    srt += `${seg.text}\n\n`;
  }

  return srt;
}

function formatVttTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}

function formatSrtTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

async function computeSha256Hash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function calculateQualityMetrics(segments: ASRResult["segments"], durationSeconds: number): {
  text_chars: number;
  duration_seconds: number;
  last_timestamp_seconds: number;
  coverage_ratio: number;
} {
  const text = segments.map(s => s.text).join(" ");
  const text_chars = text.length;
  const last_timestamp = segments.length > 0
    ? segments[segments.length - 1].end
    : 0;

  const coverage_ratio = durationSeconds > 0
    ? Math.min(last_timestamp / durationSeconds, 1)
    : 0;

  return {
    text_chars,
    duration_seconds: durationSeconds,
    last_timestamp_seconds: Math.floor(last_timestamp),
    coverage_ratio: Math.round(coverage_ratio * 10000) / 10000,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.url.includes("/health")) {
    return new Response(
      JSON.stringify({
        status: "ok",
        service: "asr-service",
        external_asr_configured: !!ASR_SERVICE_URL,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!verifyToken(req)) {
    return new Response(
      JSON.stringify({ error: "Unauthorized", message: "Invalid or missing API token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/").filter(Boolean);

    // POST /asr - Start ASR job
    if (req.method === "POST" && pathParts[0] === "asr" && pathParts.length === 1) {
      const body = await req.json();
      const {
        audio_url,
        video_id,
        language = "zh",
        duration_seconds = 0,
        model = "small", // small or medium
        chunk_size = 600, // 10 minutes chunk for long videos
      } = body;

      if (!audio_url && !video_id) {
        return new Response(
          JSON.stringify({ error: "Missing required field", message: "audio_url or video_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if external ASR is configured
      if (!ASR_SERVICE_URL) {
        return new Response(
          JSON.stringify({
            status: "failed",
            error_type: "asr_not_configured",
            error_message: "ASR service not configured. Set ASR_SERVICE_URL environment variable. For local development, use faster-whisper directly via the GitHub Action workflow.",
            instructions: {
              local_asr: "Run faster-whisper locally with: pip install faster-whisper && whisper <audio_file> --model small --output_format vtt",
              github_action: "Use the provided GitHub Action workflow which includes faster-whisper step.",
            },
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const jobId = generateJobId("asr");

      // Create job record
      await supabase.from("jobs").insert({
        id: jobId,
        job_type: "media-extract",
        status: "queued",
        request_data: {
          audio_url,
          video_id,
          language,
          duration_seconds,
          model,
          chunk_size,
        },
      });

      // Process in background
      EdgeRuntime.waitUntil(
        (async () => {
          try {
            await supabase.from("jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", jobId);

            const finalAudioUrl = audio_url || `https://www.youtube.com/watch?v=${video_id}`;

            const result = await callExternalASR(finalAudioUrl, language);

            if (!result || result.segments.length === 0) {
              await supabase.from("jobs").update({
                status: "failed",
                completed_at: new Date().toISOString(),
                error_type: "asr_failed",
                error_message: "ASR returned no segments or failed",
              }).eq("id", jobId);
              return;
            }

            const transcript_text = segmentsToTxt(result.segments);
            const transcript_vtt = segmentsToVtt(result.segments);
            const transcript_srt = segmentsToSrt(result.segments);
            const sha256 = await computeSha256Hash(transcript_text);
            const metrics = calculateQualityMetrics(result.segments, duration_seconds);

            // Update job with results
            await supabase.from("jobs").update({
              status: "success",
              completed_at: new Date().toISOString(),
              result_data: {
                transcript_text,
                transcript_vtt,
                transcript_srt,
                segments: result.segments,
                language: result.language,
                language_probability: result.language_probability,
                text_chars: metrics.text_chars,
                sha256,
                duration_seconds: metrics.duration_seconds,
                last_timestamp_seconds: metrics.last_timestamp_seconds,
                coverage_ratio: metrics.coverage_ratio,
              },
            }).eq("id", jobId);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            await supabase.from("jobs").update({
              status: "failed",
              completed_at: new Date().toISOString(),
              error_type: "processing_error",
              error_message: errorMessage,
            }).eq("id", jobId);
          }
        })()
      );

      return new Response(
        JSON.stringify({ job_id: jobId, status: "queued" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /asr/models - List available models
    if (req.method === "GET" && pathParts[0] === "asr" && pathParts[1] === "models") {
      return new Response(
        JSON.stringify({
          models: [
            { id: "tiny", name: "Tiny", speed: "fastest", accuracy: "basic", vram: "~1GB" },
            { id: "small", name: "Small (recommended)", speed: "fast", accuracy: "good", vram: "~2GB" },
            { id: "medium", name: "Medium", speed: "medium", accuracy: "better", vram: "~5GB" },
          ],
          recommended: "small",
          note: "Model selection applies when using local faster-whisper or external ASR service.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // GET /asr/local-instructions - Get instructions for local ASR
    if (req.method === "GET" && pathParts[0] === "asr" && pathParts[1] === "local-instructions") {
      return new Response(
        JSON.stringify({
          title: "Local faster-whisper Instructions",
          installation: {
            pip: "pip install faster-whisper",
            conda: "conda install -c conda-forge faster-whisper",
          },
          usage: {
            basic: "faster-whisper audio.mp3 --model small --output_format vtt --output_dir ./transcripts",
            with_language: "faster-whisper audio.mp3 --model small --language zh --output_format all",
            long_video: "faster-whisper long_video.mp3 --model small --vad_filter true --chunk_length 30",
          },
          output_files: [
            "transcript.txt - Plain text transcript",
            "transcript.vtt - WebVTT subtitles",
            "transcript.srt - SRT subtitles",
          ],
          quality_check: {
            coverage_ratio: "last_timestamp / video_duration should be >= 0.95",
            sha256: "Calculate SHA256 of transcript.txt UTF-8 bytes",
          },
          chunk_processing: {
            description: "For videos longer than 10 minutes, split into chunks",
            ffmpeg_split: "ffmpeg -i video.mp3 -f segment -segment_time 600 -c copy chunk_%03d.mp3",
            merge: "Concatenate transcripts and adjust timestamps",
          },
          github_action: {
            description: "Use the provided GitHub Action workflow for automated processing",
            setup: "Add ASR_STEP_ENABLED=true to your workflow variables",
            model: "Configure MODEL_SIZE=small or medium in workflow",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found", message: "Endpoint not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal error", message: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
