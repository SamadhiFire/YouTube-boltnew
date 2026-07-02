#!/usr/bin/env python3
"""
YouTube Daily Collection Runner - Runs entirely on GitHub Actions
- Fetches videos from configured sources
- Filters by time window
- Extracts captions or runs ASR
- Outputs daily_items.json, manifest.json, subtitles_bundle.zip
"""

import argparse
import json
import hashlib
import os
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from faster_whisper import WhisperModel
    ASR_AVAILABLE = True
except ImportError:
    ASR_AVAILABLE = False
    print("Warning: faster-whisper not installed, ASR will be disabled")


# Paths
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SOURCES_CONFIG = PROJECT_DIR / "sources_config.json"


def load_sources_config() -> Dict:
    """Load sources configuration."""
    if SOURCES_CONFIG.exists():
        return json.loads(SOURCES_CONFIG.read_text())
    return {"profiles": {}}


def get_uploads_playlist_id(channel_id: str, api_key: str) -> Optional[str]:
    """Get the uploads playlist ID for a channel."""
    url = f"https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id={channel_id}&key={api_key}"
    import requests
    resp = requests.get(url, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        if data.get("items"):
            return data["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    return None


def fetch_playlist_videos(playlist_id: str, api_key: str, page_token: str = None) -> Dict:
    """Fetch videos from a playlist."""
    url = f"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId={playlist_id}&maxResults=50&key={api_key}"
    if page_token:
        url += f"&pageToken={page_token}"

    import requests
    resp = requests.get(url, timeout=30)
    if resp.status_code == 200:
        data = resp.json()
        videos = []
        for item in data.get("items", []):
            videos.append({
                "video_id": item["contentDetails"]["videoId"],
                "title": item["snippet"]["title"],
                "published_at": item["contentDetails"].get("videoPublishedAt") or item["snippet"]["publishedAt"],
                "channel_name": item["snippet"].get("channelTitle", ""),
                "thumbnail": item["snippet"]["thumbnails"].get("default", {}).get("url", ""),
            })
        return {
            "videos": videos,
            "next_page_token": data.get("nextPageToken")
        }
    print(f"Error fetching playlist {playlist_id}: {resp.status_code}")
    return {"videos": [], "next_page_token": None}


def fetch_videos_from_source(source: Dict, api_key: str) -> List[Dict]:
    """Fetch all videos from a source (channel or playlist)."""
    source_id = source["id"]
    source_type = source["type"]
    all_videos = []

    if source_type == "playlist":
        page_token = None
        while True:
            result = fetch_playlist_videos(source_id, api_key, page_token)
            all_videos.extend(result["videos"])
            page_token = result.get("next_page_token")
            if not page_token:
                break
            time.sleep(0.1)  # Rate limiting
    else:  # channel
        # Get uploads playlist
        uploads_id = get_uploads_playlist_id(source_id, api_key)
        if uploads_id:
            page_token = None
            while True:
                result = fetch_playlist_videos(uploads_id, api_key, page_token)
                all_videos.extend(result["videos"])
                page_token = result.get("next_page_token")
                if not page_token:
                    break
                time.sleep(0.1)

    # Add source metadata
    for v in all_videos:
        v["source_name"] = source.get("name", source_id)
        v["source_type"] = source_type
        v["source_id"] = source_id
        v["category"] = source.get("category", "")
        v["min_duration"] = source.get("min_duration", 0)

    return all_videos


def get_video_details(video_ids: List[str], api_key: str) -> Dict[str, Dict]:
    """Get detailed video information including duration."""
    if not video_ids:
        return {}

    import requests
    results = {}

    # Batch requests (50 IDs max per request)
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i+50]
        ids = ",".join(batch)
        url = f"https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id={ids}&key={api_key}"

        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            for item in data.get("items", []):
                vid = item["id"]
                duration = parse_duration(item["contentDetails"]["duration"])
                results[vid] = {
                    "id": vid,
                    "title": item["snippet"]["title"],
                    "description": item["snippet"].get("description", ""),
                    "channel_id": item["snippet"]["channelId"],
                    "channel_name": item["snippet"]["channelTitle"],
                    "published_at": item["snippet"]["publishedAt"],
                    "duration": duration,
                    "thumbnail": item["snippet"]["thumbnails"].get("high", {}).get("url", ""),
                }

    return results


def parse_duration(duration: str) -> int:
    """Parse YouTube duration string to seconds."""
    import re
    match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration)
    if not match:
        return 0
    h, m, s = match.groups()
    return int(h or 0) * 3600 + int(m or 0) * 60 + int(s or 0)


def is_in_window(published_at: str, window_start: str, window_end: str) -> bool:
    """Check if video publish time is within the collection window."""
    try:
        pub = datetime.fromisoformat(published_at.replace('Z', '+00:00'))
        start = datetime.fromisoformat(window_start.replace('Z', '+00:00'))
        end = datetime.fromisoformat(window_end.replace('Z', '+00:00'))
        return start <= pub < end
    except:
        return False


def download_audio(video_url: str, output_path: str) -> bool:
    """Download audio from YouTube video using yt-dlp."""
    try:
        cmd = [
            "yt-dlp", "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", output_path,
            "--no-playlist",
            video_url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        return result.returncode == 0
    except Exception as e:
        print(f"Error downloading audio: {e}")
        return False


def get_captions_with_ytdlp(video_url: str, language: str = "zh") -> Optional[Dict]:
    """Try to get captions using yt-dlp."""
    with tempfile.TemporaryDirectory() as tmpdir:
        try:
            # Download subtitles
            cmd = [
                "yt-dlp",
                "--write-auto-sub",
                "--sub-lang", f"{language},en",
                "--skip-download",
                "-o", os.path.join(tmpdir, "subtitle"),
                "--no-playlist",
                video_url
            ]
            subprocess.run(cmd, capture_output=True, timeout=60)

            # Find downloaded subtitle files
            for file in os.listdir(tmpdir):
                if file.endswith(('.vtt', '.srt')):
                    filepath = os.path.join(tmpdir, file)
                    content = Path(filepath).read_text(encoding='utf-8')
                    segments = parse_subtitle_content(content, file.split('.')[-1])
                    if segments:
                        is_auto = "auto" in file.lower() or ".zh." in file.lower()
                        return {
                            "segments": segments,
                            "source": "auto_caption" if is_auto else "official_caption"
                        }
        except Exception as e:
            print(f"Caption extraction failed: {e}")

    return None


def parse_subtitle_content(content: str, fmt: str) -> List[Dict]:
    """Parse VTT or SRT content into segments."""
    segments = []
    lines = content.strip().split('\n')
    i = 0

    while i < len(lines):
        line = lines[i].strip()

        # Skip WEBVTT header or sequence numbers
        if not line or line == 'WEBVTT' or line.isdigit():
            i += 1
            continue

        # Look for timestamp line
        if '-->' in line:
            times = line.split('-->')
            if len(times) == 2:
                start = parse_timestamp(times[0].strip())
                end = parse_timestamp(times[1].strip())

                # Collect text lines until next timestamp or empty line
                text_lines = []
                i += 1
                while i < len(lines):
                    text_line = lines[i].strip()
                    if not text_line or '-->' in text_line or text_line.isdigit():
                        break
                    # Remove VTT styling
                    if not text_line.startswith('<'):
                        text_lines.append(text_line)
                    i += 1

                if text_lines:
                    segments.append({
                        "start": start,
                        "end": end,
                        "text": ' '.join(text_lines)
                    })
                continue
        i += 1

    return segments


def parse_timestamp(ts: str) -> float:
    """Parse timestamp string to seconds."""
    # Remove any positioning info (VTT)
    ts = ts.split()[0] if ' ' in ts else ts
    ts = ts.replace(',', '.')

    parts = ts.split(':')
    if len(parts) == 3:
        h, m, s = parts
    elif len(parts) == 2:
        h, m = 0, parts[0]
        s = parts[1] if '.' in parts[-1] else '0'
    else:
        return 0

    try:
        return float(h) * 3600 + float(m) * 60 + float(s)
    except:
        return 0


def run_asr(audio_path: str, model_size: str = "small", language: str = "zh") -> Optional[Dict]:
    """Run ASR using faster-whisper."""
    if not ASR_AVAILABLE:
        print("ASR not available (faster-whisper not installed)")
        return None

    try:
        print(f"Loading Whisper model: {model_size}")
        model = WhisperModel(
            model_size,
            device="cpu",
            compute_type="int8"
        )

        print(f"Transcribing: {audio_path}")
        segments, info = model.transcribe(
            audio_path,
            language=language,
            vad_filter=True,
            vad_parameters=dict(min_silence_duration_ms=500)
        )

        segments_list = []
        for seg in segments:
            segments_list.append({
                "start": seg.start,
                "end": seg.end,
                "text": seg.text.strip()
            })

        return {
            "segments": segments_list,
            "language": info.language,
            "duration": info.duration,
            "source": "asr"
        }
    except Exception as e:
        print(f"ASR failed: {e}")
        return None


def segments_to_txt(segments: List[Dict]) -> str:
    """Convert segments to plain text."""
    return '\n'.join(s["text"] for s in segments)


def segments_to_vtt(segments: List[Dict]) -> str:
    """Convert segments to WebVTT format."""
    lines = ["WEBVTT\n"]
    for i, seg in enumerate(segments, 1):
        start = format_time(seg["start"], "vtt")
        end = format_time(seg["end"], "vtt")
        lines.append(f"\n{i}\n{start} --> {end}\n{seg['text']}")
    return '\n'.join(lines)


def segments_to_srt(segments: List[Dict]) -> str:
    """Convert segments to SRT format."""
    lines = []
    for i, seg in enumerate(segments, 1):
        start = format_time(seg["start"], "srt")
        end = format_time(seg["end"], "srt")
        lines.extend([str(i), f"{start} --> {end}", seg["text"], ""])
    return '\n'.join(lines)


def format_time(seconds: float, fmt: str) -> str:
    """Format seconds as timestamp."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)

    if fmt == "vtt":
        return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
    else:
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def calculate_sha256(text: str) -> str:
    """Calculate SHA256 hash of text."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def process_video(
    video: Dict,
    video_details: Dict,
    output_dir: Path,
    run_asr_flag: bool,
    model_size: str,
    language: str
) -> Dict:
    """Process a single video to extract or generate transcript."""
    video_id = video["video_id"]
    details = video_details.get(video_id, {})
    duration = details.get("duration", 0)
    min_duration = video.get("min_duration", 0)

    result = {
        "video_id": video_id,
        "status": "pending",
        "source": None,
        "transcript_file": None,
        "text_chars": 0,
        "sha256": None,
        "duration_seconds": duration,
        "coverage_ratio": 0,
        "error": None
    }

    # Skip short videos if min_duration set
    if min_duration > 0 and duration < min_duration:
        result["status"] = "skipped"
        result["error"] = f"Video too short ({duration}s < {min_duration}s)"
        return result

    video_url = f"https://www.youtube.com/watch?v={video_id}"
    base_name = f"youtube_{video_id}"

    # Step 1: Try to get existing captions
    print(f"  Trying captions for {video_id}...")
    transcript = get_captions_with_ytdlp(video_url, language)

    # Step 2: If no captions and ASR enabled, run transcription
    if not transcript and run_asr_flag and duration >= 300:  # 5+ minutes
        print(f"  Running ASR for {video_id}...")
        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, f"{video_id}.mp3")

            if download_audio(video_url, audio_path):
                transcript = run_asr(audio_path, model_size, language)
            else:
                result["error"] = "Failed to download audio"

    # Step 3: Save transcript if available
    if transcript and transcript["segments"]:
        segments = transcript["segments"]

        txt_content = segments_to_txt(segments)
        vtt_content = segments_to_vtt(segments)
        srt_content = segments_to_srt(segments)

        text_chars = len(txt_content)
        last_timestamp = segments[-1]["end"] if segments else 0
        coverage_ratio = min(last_timestamp / duration, 1.0) if duration > 0 else 0

        # Save files
        subtitle_dir = output_dir / "subtitles"
        subtitle_dir.mkdir(parents=True, exist_ok=True)

        (subtitle_dir / f"{base_name}.txt").write_text(txt_content, encoding='utf-8')
        (subtitle_dir / f"{base_name}.vtt").write_text(vtt_content, encoding='utf-8')
        (subtitle_dir / f"{base_name}.srt").write_text(srt_content, encoding='utf-8')

        # Save metadata
        metadata = {
            "platform": "youtube",
            "media_id": video_id,
            "url": video_url,
            "text": f"{base_name}.txt",
            "text_chars": text_chars,
            "sha256": calculate_sha256(txt_content),
            "duration_seconds": duration,
            "last_timestamp_seconds": int(last_timestamp),
            "coverage_ratio": round(coverage_ratio, 4),
            "source": transcript["source"],
            "language": language
        }
        (subtitle_dir / f"{base_name}.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )

        result.update({
            "status": "success",
            "source": transcript["source"],
            "transcript_file": f"{base_name}.txt",
            "text_chars": text_chars,
            "sha256": metadata["sha256"],
            "coverage_ratio": coverage_ratio
        })
        print(f"  Success: {text_chars} chars, {coverage_ratio:.1%} coverage")
    else:
        result["status"] = "failed"
        result["error"] = "No transcript available"
        print(f"  Failed: No transcript")

    return result


def main():
    parser = argparse.ArgumentParser(description="YouTube Daily Collection Runner")
    parser.add_argument("--date", required=True)
    parser.add_argument("--window-start", required=True)
    parser.add_argument("--window-end", required=True)
    parser.add_argument("--profile", default="youtube-all")
    parser.add_argument("--run-asr", default="true")
    parser.add_argument("--model-size", default="small")
    parser.add_argument("--language", default="zh")
    parser.add_argument("--output-dir", default="output")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        print("Error: YOUTUBE_API_KEY not set")
        sys.exit(1)

    run_asr_flag = args.run_asr.lower() == "true"

    # Load sources
    config = load_sources_config()
    sources = config.get("profiles", {}).get(args.profile, {}).get("sources", [])

    if not sources:
        print(f"Error: No sources found for profile '{args.profile}'")
        sys.exit(1)

    print(f"Loaded {len(sources)} sources from profile: {args.profile}")
    print(f"Date: {args.date}")
    print(f"Window: {args.window_start} to {args.window_end}")
    print(f"Run ASR: {run_asr_flag}")

    # Step 1: Collect all videos from sources
    print("\n=== Step 1: Fetching videos from sources ===")
    all_videos = []
    for source in sources:
        print(f"Fetching: {source.get('name', source['id'])}...")
        videos = fetch_videos_from_source(source, api_key)
        all_videos.extend(videos)
        print(f"  Found {len(videos)} videos")
        time.sleep(0.5)  # Rate limiting

    print(f"\nTotal videos found: {len(all_videos)}")

    # Step 2: Filter by time window
    print("\n=== Step 2: Filtering by time window ===")
    filtered_videos = []
    for v in all_videos:
        if is_in_window(v["published_at"], args.window_start, args.window_end):
            filtered_videos.append(v)

    print(f"Videos in window: {len(filtered_videos)}")

    if not filtered_videos:
        print("No videos found in time window")
        # Create empty output
        (output_dir / "daily_items.json").write_text("[]")
        (output_dir / "manifest.json").write_text(json.dumps({
            "date": args.date,
            "window_start": args.window_start,
            "window_end": args.window_end,
            "sources_profile": args.profile,
            "total_videos": 0,
            "videos_with_transcripts": 0,
            "videos_needing_asr": 0,
            "processed": 0,
            "failed": 0,
            "coverage_ratio": 0
        }, indent=2))
        return

    # Step 3: Get video details
    print("\n=== Step 3: Getting video details ===")
    video_ids = [v["video_id"] for v in filtered_videos]
    video_details = get_video_details(video_ids, api_key)
    print(f"Got details for {len(video_details)} videos")

    # Step 4: Process each video
    print("\n=== Step 4: Processing videos ===")
    daily_items = []
    results = []
    processed = 0
    failed = 0
    needing_asr = 0

    for i, video in enumerate(filtered_videos, 1):
        video_id = video["video_id"]
        details = video_details.get(video_id, {})
        duration = details.get("duration", 0)

        title = details.get("title", video.get("title", video_id))
        print(f"\n[{i}/{len(filtered_videos)}] {title[:50]}... ({duration}s)")

        # Track if needs ASR (5+ min video)
        if duration >= 300:
            needing_asr += 1

        # Process video
        result = process_video(
            video=video,
            video_details=video_details,
            output_dir=output_dir,
            run_asr_flag=run_asr_flag,
            model_size=args.model_size,
            language=args.language
        )

        results.append(result)

        if result["status"] == "success":
            processed += 1
        elif result["status"] == "failed":
            failed += 1

        # Build daily item
        item = {
            "platform": "youtube",
            "category": video.get("category", ""),
            "source_name": video.get("source_name", ""),
            "source_url": f"https://www.youtube.com/{'playlist?list=' if video['source_type'] == 'playlist' else 'channel/'}{video['source_id']}",
            "title": details.get("title", ""),
            "original_title": details.get("title", ""),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "published_at": details.get("published_at", video.get("published_at", "")),
            "duration": duration,
            "description": details.get("description", ""),
            "chapters": [],
            "transcript_source": result.get("source"),
            "text_chars": result.get("text_chars", 0),
            "coverage_ratio": result.get("coverage_ratio", 0)
        }
        daily_items.append(item)

    # Step 5: Generate output files
    print("\n=== Step 5: Generating output files ===")

    # daily_items.json
    (output_dir / "daily_items.json").write_text(
        json.dumps(daily_items, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    print(f"Generated daily_items.json ({len(daily_items)} items)")

    # manifest.json
    coverage_ratio = sum(r.get("coverage_ratio", 0) for r in results if r["status"] == "success")
    coverage_ratio = coverage_ratio / processed if processed > 0 else 0

    manifest = {
        "date": args.date,
        "window_start": args.window_start,
        "window_end": args.window_end,
        "sources_profile": args.profile,
        "sources_processed": len(sources),
        "total_videos": len(filtered_videos),
        "videos_with_transcripts": processed,
        "videos_needing_asr": needing_asr,
        "processed": processed,
        "failed": failed,
        "coverage_ratio": round(coverage_ratio, 4),
        "asr_enabled": run_asr_flag,
        "asr_model": args.model_size if run_asr_flag else None,
        "errors": [r for r in results if r.get("error")]
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    print(f"Generated manifest.json")

    # Create subtitles_bundle.zip
    subtitle_dir = output_dir / "subtitles"
    if subtitle_dir.exists():
        with zipfile.ZipFile(output_dir / "subtitles_bundle.zip", 'w', zipfile.ZIP_DEFLATED) as zf:
            for file in subtitle_dir.glob("*"):
                zf.write(file, f"subtitles/{file.name}")
        print("Generated subtitles_bundle.zip")

    print("\n=== Collection Complete ===")
    print(f"Total videos: {len(filtered_videos)}")
    print(f"Successfully processed: {processed}")
    print(f"Failed: {failed}")
    print(f"Coverage ratio: {coverage_ratio:.1%}")


if __name__ == "__main__":
    main()
