#!/usr/bin/env python3
"""
Extract transcript from a single YouTube video.
Supports both caption extraction and ASR fallback.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional, Dict, Any

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Warning: faster-whisper not installed, ASR will not be available")


def download_audio(video_url: str, output_path: str) -> bool:
    """Download audio from YouTube video."""
    try:
        cmd = [
            "yt-dlp",
            "-x",
            "--audio-format", "mp3",
            "--audio-quality", "0",
            "-o", output_path,
            "--no-playlist",
            video_url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error downloading: {e}")
        return False


def get_video_info(video_url: str) -> Dict[str, Any]:
    """Get video metadata using yt-dlp."""
    try:
        cmd = ["yt-dlp", "--dump-json", "--no-playlist", video_url]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
    except Exception as e:
        print(f"Error getting video info: {e}")
    return {}


def try_get_captions(video_url: str, language: str) -> Optional[Dict[str, Any]]:
    """Try to get existing captions from YouTube."""
    try:
        cmd = [
            "yt-dlp",
            "--write-auto-sub",
            "--sub-lang", language,
            "--skip-download",
            "-o", "temp_subtitle",
            "--no-playlist",
            video_url
        ]

        with tempfile.TemporaryDirectory() as tmpdir:
            subprocess.run(cmd, cwd=tmpdir, capture_output=True)

            # Look for subtitle files
            for f in os.listdir(tmpdir):
                if f.endswith(('.vtt', '.srt')):
                    filepath = os.path.join(tmpdir, f)
                    content = Path(filepath).read_text(encoding='utf-8')

                    # Parse VTT/SRT to segments
                    segments = parse_subtitle_file(content, f.split('.')[-1])

                    if segments:
                        return {
                            "segments": segments,
                            "source": "auto_caption" if "auto" in f else "official_caption"
                        }
    except Exception as e:
        print(f"Caption extraction failed: {e}")

    return None


def parse_subtitle_file(content: str, format_type: str) -> list:
    """Parse VTT or SRT content into segments."""
    segments = []

    if format_type == "vtt":
        lines = content.strip().split('\n')
        current_start = 0
        current_end = 0
        current_text = []

        for line in lines:
            line = line.strip()
            if '-->' in line:
                # Save previous segment
                if current_text:
                    segments.append({
                        "start": current_start,
                        "end": current_end,
                        "text": ' '.join(current_text)
                    })
                    current_text = []

                # Parse timestamps
                times = line.split(' --> ')
                current_start = parse_vtt_timestamp(times[0])
                current_end = parse_vtt_timestamp(times[1])
            elif line and not line.isdigit() and line != 'WEBVTT':
                current_text.append(line)

        # Last segment
        if current_text:
            segments.append({
                "start": current_start,
                "end": current_end,
                "text": ' '.join(current_text)
            })

    return segments


def parse_vtt_timestamp(ts: str) -> float:
    """Parse VTT timestamp to seconds."""
    ts = ts.strip()
    parts = ts.split(':')
    if len(parts) == 3:
        hrs, mins, secs = parts
    else:
        hrs = 0
        mins, secs = parts

    secs = secs.replace(',', '.')
    return float(hrs) * 3600 + float(mins) * 60 + float(secs)


def transcribe_audio(audio_path: str, model_size: str, language: str) -> Dict[str, Any]:
    """Transcribe audio using faster-whisper."""
    print(f"Loading Whisper model: {model_size}")

    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8"
    )

    print("Transcribing...")
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True
    )

    segments_list = []
    for segment in segments:
        segments_list.append({
            "start": segment.start,
            "end": segment.end,
            "text": segment.text.strip()
        })

    return {
        "segments": segments_list,
        "language": info.language,
        "duration": info.duration,
        "source": "asr"
    }


def segments_to_txt(segments: list) -> str:
    return '\n'.join(s["text"] for s in segments)


def segments_to_vtt(segments: list) -> str:
    lines = ["WEBVTT\n"]
    for i, seg in enumerate(segments, 1):
        start = format_time(seg["start"], "vtt")
        end = format_time(seg["end"], "vtt")
        lines.append(f"\n{i}\n{start} --> {end}\n{seg['text']}")
    return '\n'.join(lines)


def segments_to_srt(segments: list) -> str:
    lines = []
    for i, seg in enumerate(segments, 1):
        start = format_time(seg["start"], "srt")
        end = format_time(seg["end"], "srt")
        lines.extend([str(i), f"{start} --> {end}", seg["text"], ""])
    return '\n'.join(lines)


def format_time(seconds: float, format_type: str) -> str:
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)

    if format_type == "vtt":
        return f"{hrs:02d}:{mins:02d}:{secs:02d}.{ms:03d}"
    else:
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def calculate_sha256(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def main():
    parser = argparse.ArgumentParser(description="Extract transcript from YouTube video")
    parser.add_argument("--url", required=True, help="YouTube video URL")
    parser.add_argument("--language", default="zh", help="Language code")
    parser.add_argument("--run-asr", default="true", help="Run ASR if no captions")
    parser.add_argument("--model-size", default="small", choices=["tiny", "small", "medium"])
    parser.add_argument("--output-dir", default="output", help="Output directory")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Get video info
    print("Getting video information...")
    video_info = get_video_info(args.url)
    video_id = video_info.get("id", args.url.split("v=")[-1].split("&")[0])
    duration = video_info.get("duration", 0)
    title = video_info.get("title", video_id)

    print(f"Video: {title}")
    print(f"ID: {video_id}")
    print(f"Duration: {duration}s")

    # Try to get existing captions first
    print("\nTrying to get existing captions...")
    result = try_get_captions(args.url, args.language)

    # If no captions and ASR is enabled, run transcription
    if not result and args.run_asr.lower() == "true":
        print("\nNo captions found, running ASR...")

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, f"{video_id}.mp3")

            print("Downloading audio...")
            if download_audio(args.url, audio_path):
                try:
                    result = transcribe_audio(audio_path, args.model_size, args.language)
                except NameError:
                    print("Error: faster-whisper not available")
                    return
            else:
                print("Error: Failed to download audio")
                return

    if not result:
        print("Error: Could not extract transcript")
        return

    # Generate output files
    segments = result["segments"]
    source = result.get("source", "unknown")

    txt_content = segments_to_txt(segments)
    vtt_content = segments_to_vtt(segments)
    srt_content = segments_to_srt(segments)

    # Calculate metrics
    text_chars = len(txt_content)
    last_timestamp = segments[-1]["end"] if segments else 0
    coverage_ratio = min(last_timestamp / duration, 1.0) if duration > 0 else 0
    sha256 = calculate_sha256(txt_content)

    # Save files
    base_name = f"youtube_{video_id}"
    (output_dir / f"{base_name}.txt").write_text(txt_content, encoding='utf-8')
    (output_dir / f"{base_name}.vtt").write_text(vtt_content, encoding='utf-8')
    (output_dir / f"{base_name}.srt").write_text(srt_content, encoding='utf-8')

    # Save metadata
    metadata = {
        "platform": "youtube",
        "media_id": video_id,
        "url": args.url,
        "title": title,
        "duration_seconds": duration,
        "text": f"{base_name}.txt",
        "text_chars": text_chars,
        "sha256": sha256,
        "last_timestamp_seconds": int(last_timestamp),
        "coverage_ratio": round(coverage_ratio, 4),
        "source": source,
        "language": args.language,
        "segments_count": len(segments)
    }

    (output_dir / f"{base_name}.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )

    print(f"\nTranscript extracted successfully!")
    print(f"  Source: {source}")
    print(f"  Characters: {text_chars:,}")
    print(f"  Coverage: {coverage_ratio:.1%}")
    print(f"  Files saved to: {output_dir}/")
    print(f"    - {base_name}.txt")
    print(f"    - {base_name}.vtt")
    print(f"    - {base_name}.srt")
    print(f"    - {base_name}.json")


if __name__ == "__main__":
    main()
