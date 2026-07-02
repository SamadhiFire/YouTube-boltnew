#!/usr/bin/env python3
"""
Run ASR (Automatic Speech Recognition) for videos without captions.
Uses faster-whisper for local transcription with support for long videos.
"""

import argparse
import json
import hashlib
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime

try:
    from faster_whisper import WhisperModel
except ImportError:
    print("Error: faster-whisper not installed. Run: pip install faster-whisper")
    sys.exit(1)


def download_audio(video_url: str, output_path: str) -> bool:
    """Download audio from YouTube video using yt-dlp."""
    try:
        cmd = [
            "yt-dlp",
            "-x",  # Extract audio
            "--audio-format", "mp3",
            "--audio-quality", "0",  # Best quality
            "-o", output_path,
            "--no-playlist",
            video_url
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error downloading audio: {e}")
        return False


def transcribe_audio(
    audio_path: str,
    model_size: str = "small",
    language: str = "zh",
    chunk_length: int = 30
) -> Dict[str, Any]:
    """
    Transcribe audio using faster-whisper.
    Returns segments with timestamps and quality metrics.
    """
    print(f"Loading Whisper model: {model_size}")
    model = WhisperModel(
        model_size,
        device="cpu",  # Use CPU for GitHub Actions compatibility
        compute_type="int8"
    )

    print(f"Transcribing: {audio_path}")
    segments, info = model.transcribe(
        audio_path,
        language=language,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500),
        chunk_length=chunk_length
    )

    # Convert generator to list
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
        "language_probability": info.language_probability,
        "duration": info.duration
    }


def segments_to_txt(segments: List[Dict]) -> str:
    """Convert segments to plain text."""
    return "\n".join(s["text"] for s in segments)


def segments_to_vtt(segments: List[Dict]) -> str:
    """Convert segments to WebVTT format."""
    lines = ["WEBVTT\n"]

    for i, seg in enumerate(segments, 1):
        start = format_vtt_time(seg["start"])
        end = format_vtt_time(seg["end"])
        lines.append(f"\n{i}")
        lines.append(f"{start} --> {end}")
        lines.append(seg["text"])

    return "\n".join(lines)


def segments_to_srt(segments: List[Dict]) -> str:
    """Convert segments to SRT format."""
    lines = []

    for i, seg in enumerate(segments, 1):
        start = format_srt_time(seg["start"])
        end = format_srt_time(seg["end"])
        lines.append(str(i))
        lines.append(f"{start} --> {end}")
        lines.append(seg["text"])
        lines.append("")

    return "\n".join(lines)


def format_vtt_time(seconds: float) -> str:
    """Format seconds as VTT timestamp (HH:MM:SS.mmm)."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d}.{ms:03d}"


def format_srt_time(seconds: float) -> str:
    """Format seconds as SRT timestamp (HH:MM:SS,mmm)."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{ms:03d}"


def calculate_sha256(text: str) -> str:
    """Calculate SHA256 hash of text."""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def calculate_quality_metrics(
    segments: List[Dict],
    duration_seconds: float
) -> Dict[str, Any]:
    """Calculate quality metrics for the transcript."""
    text = " ".join(s["text"] for s in segments)
    text_chars = len(text)
    last_timestamp = segments[-1]["end"] if segments else 0
    coverage_ratio = min(last_timestamp / duration_seconds, 1.0) if duration_seconds > 0 else 0

    return {
        "text_chars": text_chars,
        "duration_seconds": int(duration_seconds),
        "last_timestamp_seconds": int(last_timestamp),
        "coverage_ratio": round(coverage_ratio, 4)
    }


def process_long_video(
    video_url: str,
    video_id: str,
    model_size: str,
    language: str,
    output_dir: Path
) -> Optional[Dict[str, Any]]:
    """
    Process a potentially long video by chunking if needed.
    For videos under 30 minutes, process directly.
    For longer videos, split into chunks.
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        audio_path = os.path.join(tmpdir, f"{video_id}.mp3")

        print(f"Downloading audio for {video_id}...")
        if not download_audio(video_url, audio_path):
            return None

        # Get audio duration
        probe_cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        result = subprocess.run(probe_cmd, capture_output=True, text=True)
        duration = float(result.stdout.strip()) if result.returncode == 0 else 0

        print(f"Audio duration: {duration:.1f} seconds")

        # For long videos (>30 min), split into chunks
        if duration > 1800:
            print("Long video detected, processing in chunks...")
            # Process in 10-minute chunks to avoid memory issues
            chunk_duration = 600  # 10 minutes
            all_segments = []
            current_time = 0

            num_chunks = int(duration // chunk_duration) + 1
            for i in range(num_chunks):
                chunk_start = i * chunk_duration
                chunk_end = min((i + 1) * chunk_duration, duration)

                print(f"Processing chunk {i+1}/{num_chunks} ({chunk_start:.0f}s - {chunk_end:.0f}s)")

                # Split chunk
                chunk_path = os.path.join(tmpdir, f"chunk_{i}.mp3")
                split_cmd = [
                    "ffmpeg", "-y", "-i", audio_path,
                    "-ss", str(chunk_start),
                    "-t", str(chunk_duration),
                    "-c", "copy",
                    chunk_path
                ]
                subprocess.run(split_cmd, capture_output=True)

                # Transcribe chunk
                result = transcribe_audio(chunk_path, model_size, language)

                # Adjust timestamps
                for seg in result["segments"]:
                    seg["start"] += chunk_start
                    seg["end"] += chunk_start

                all_segments.extend(result["segments"])

            segments = all_segments
        else:
            # Process directly for shorter videos
            result = transcribe_audio(audio_path, model_size, language)
            segments = result["segments"]

        if not segments:
            print("No segments produced")
            return None

        # Generate output files
        txt_content = segments_to_txt(segments)
        vtt_content = segments_to_vtt(segments)
        srt_content = segments_to_srt(segments)

        # Save files
        base_name = f"youtube_{video_id}"
        (output_dir / f"{base_name}.txt").write_text(txt_content, encoding='utf-8')
        (output_dir / f"{base_name}.vtt").write_text(vtt_content, encoding='utf-8')
        (output_dir / f"{base_name}.srt").write_text(srt_content, encoding='utf-8')

        # Calculate metrics
        metrics = calculate_quality_metrics(segments, duration)

        # Create metadata JSON
        metadata = {
            "platform": "youtube",
            "media_id": video_id,
            "url": video_url,
            "text": f"{base_name}.txt",
            "text_chars": metrics["text_chars"],
            "sha256": calculate_sha256(txt_content),
            "duration_seconds": metrics["duration_seconds"],
            "last_timestamp_seconds": metrics["last_timestamp_seconds"],
            "coverage_ratio": metrics["coverage_ratio"],
            "source": "asr",
            "language": language,
            "model": model_size,
            "segments_count": len(segments)
        }

        (output_dir / f"{base_name}.json").write_text(
            json.dumps(metadata, indent=2, ensure_ascii=False),
            encoding='utf-8'
        )

        print(f"Transcript saved: {base_name}.txt ({metrics['text_chars']} chars)")
        print(f"Coverage ratio: {metrics['coverage_ratio']:.1%}")

        return metadata


def main():
    parser = argparse.ArgumentParser(description="Run ASR for videos without captions")
    parser.add_argument("--manifest", required=True, help="Path to manifest.json")
    parser.add_argument("--daily-items", required=True, help="Path to daily_items.json")
    parser.add_argument("--output-dir", required=True, help="Output directory for transcripts")
    parser.add_argument("--model-size", default="small", choices=["tiny", "small", "medium"])
    parser.add_argument("--language", default="zh")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load manifest
    with open(args.manifest) as f:
        manifest = json.load(f)

    # Load daily items
    with open(args.daily_items) as f:
        daily_items = json.load(f)

    print(f"Processing {len(daily_items)} videos...")
    print(f"Videos without transcripts: {manifest.get('videos_without_transcripts', 0)}")

    # Track processing results
    processed = 0
    failed = 0
    results = []

    for item in daily_items:
        video_id = item.get("url", "").split("v=")[-1] if "v=" in item.get("url", "") else None
        if not video_id:
            continue

        video_url = f"https://www.youtube.com/watch?v={video_id}"
        duration = item.get("duration", 0)

        # Skip short videos (< 5 minutes)
        if duration < 300:
            print(f"Skipping short video: {video_id} ({duration}s)")
            continue

        print(f"\nProcessing: {item.get('title', video_id)[:50]}...")

        try:
            result = process_long_video(
                video_url=video_url,
                video_id=video_id,
                model_size=args.model_size,
                language=args.language,
                output_dir=output_dir
            )

            if result:
                processed += 1
                results.append({
                    "video_id": video_id,
                    "status": "success",
                    "metadata": result
                })
            else:
                failed += 1
                results.append({
                    "video_id": video_id,
                    "status": "failed",
                    "error": "Processing returned no results"
                })
        except Exception as e:
            failed += 1
            print(f"Error processing {video_id}: {e}")
            results.append({
                "video_id": video_id,
                "status": "failed",
                "error": str(e)
            })

    # Update manifest with ASR results
    manifest["asr_processed"] = processed
    manifest["asr_failed"] = failed
    manifest["asr_results"] = results
    manifest["asr_timestamp"] = datetime.utcnow().isoformat()

    with open(args.manifest, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"\nASR processing complete:")
    print(f"  Processed: {processed}")
    print(f"  Failed: {failed}")


if __name__ == "__main__":
    main()
