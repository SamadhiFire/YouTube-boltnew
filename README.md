# https://youtube-transcript-s-tis4.bolt.host

YouTube Transcript Relay Service (YouTube-boltnew)
=================================================

A lightweight relay/extraction service for YouTube transcripts. Provides two main interfaces — Official (when available) and Automatic (speech-recognition based) — so other projects (for example, 播客日报) can fetch captions easily.

Default language: English (Chinese translation follows below).

Quick links
- Live endpoint: https://youtube-transcript-s-tis4.bolt.host
- Repository: https://github.com/SamadhiFire/YouTube-boltnew

Features
- Fetch official (uploaded) YouTube captions when available.
- Fallback to automatic (ASR) transcripts when official captions are not present.
- Simple JSON and common subtitle formats (SRT, VTT, plain text).
- Caching and lightweight rate-limiting to reduce repeated fetches.
- Designed for easy integration by other services.

API (example)
- GET /api/transcript?video_id=<VIDEO_ID>&source=official|auto&lang=<LANG>&format=json|srt|vtt|txt
  - video_id (required): YouTube video id (e.g., dQw4w9WgXcQ)
  - source (optional): "official" or "auto" (default: "official,auto")
  - lang (optional): language code (e.g., en, zh-CN). If omitted, returns default/first available track.
  - format (optional): json (default), srt, vtt, txt
- Example:
  - JSON: GET https://youtube-transcript-s-tis4.bolt.host/api/transcript?video_id=dQw4w9WgXcQ&format=json
  - SRT:  GET https://youtube-transcript-s-tis4.bolt.host/api/transcript?video_id=dQw4w9WgXcQ&format=srt

Response examples
- JSON (format=json)

```json
{
  "video_id": "dQw4w9WgXcQ",
  "source": "official",
  "language": "en",
  "tracks": [
    {
      "start": 0.0,
      "duration": 4.2,
      "text": "We're no strangers to love..."
    }
  ],
  "fetched_at": "2026-07-28T12:00:00Z"
}
```

- SRT (format=srt)
```
1
00:00:00,000 --> 00:00:04,200
We're no strangers to love...

2
00:00:04,200 --> 00:00:08,400
You know the rules and so do I...
```

Usage / Install (developer)
- Requirements: Node (>=16) and/or Python 3.8+ depending on the code paths used.
- Clone:
```bash
git clone https://github.com/SamadhiFire/YouTube-boltnew.git
cd YouTube-boltnew
```
- Install (TypeScript / Node server):
```bash
# if project uses npm/yarn/pnpm
npm install
npm run build
npm start
```
- Python helpers (if present):
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/some_helper.py
```

Configuration (common environment variables)
- PORT — server port (default: 3000)
- YOUTUBE_API_KEY — optional: YouTube Data API key for robust official-caption fetching
- CACHE_TTL — caching duration in seconds (default: 3600)
- RATE_LIMIT — simple requests-per-minute limit (optional)
- LOG_LEVEL — debug / info / warn / error

Docker (example)
```dockerfile
# build locally then run
docker build -t youtube-transcript .
docker run -e PORT=3000 -e YOUTUBE_API_KEY="${YOUTUBE_API_KEY}" -p 3000:3000 youtube-transcript
```

Security & privacy
- The service only fetches publicly-available captions/transcripts from YouTube.
- If you add third-party transcription providers (ASR), secure API keys and PII handling is required.
- Consider enabling HTTPS and request authentication for production usage.

Integration tips
- Use format=json for automated processing.
- Cache results on the caller side to reduce service load.
- For batch requests, stagger them to avoid rate limits.

Development notes
- Language composition in the repository: TypeScript (~61%), Python (~38%).
- If you modify the endpoint signatures, update this README and any downstream consumers.

Contributing
- PRs are welcome. Please:
  - Open an issue describing the change first for non-trivial features.
  - Add tests for new behavior where applicable.
  - Keep changes scoped and document config additions.

License
- MIT (or pick your preferred license). Add LICENSE file to the repo.

Contact
- Repository owner: SamadhiFire
- Issue tracker: https://github.com/SamadhiFire/YouTube-boltnew/issues

---

中文（Chinese translation）
========================

YouTube 字幕中转提取服务（YouTube-boltnew）
----------------------------------------

一个轻量的 YouTube 字幕中转/提取服务。提供两个主要接口：官方字幕（存在时使用）与自动字幕（ASR），便于其他项目（例如播客日报）调用获取字幕。

快速链接
- 在线服务: https://youtube-transcript-s-tis4.bolt.host
- 仓库: https://github.com/SamadhiFire/YouTube-boltnew

功能
- 获取 YouTube 官方上传的字幕（若存在）。
- 在官方字幕缺失时回退到自动生成的字幕（ASR）。
- 支持 JSON、SRT、VTT、纯文本等常见字幕格式。
- 简单缓存与速率限制以降低重复抓取开销。
- 便于其他服务集成使用。

API 示例
- GET /api/transcript?video_id=<VIDEO_ID>&source=official|auto&lang=<LANG>&format=json|srt|vtt|txt
  - video_id（必需）: YouTube 视频 ID（例如 dQw4w9WgXcQ）
  - source（可选）: "official" 或 "auto"（默认尝试官方再自动）
  - lang（可选）: 语言代码（例如 en, zh-CN）
  - format（可选）: json（默认）、srt、vtt、txt

返回示例
- JSON（format=json）见上文 JSON 示例
- SRT（format=srt）见上文 SRT 示例

本地运行（开发）
- 要求：Node（>=16）和/或 Python 3.8+
- 克隆与启动：
```bash
git clone https://github.com/SamadhiFire/YouTube-boltnew.git
cd YouTube-boltnew
npm install
npm run build
npm start
```

配置（常用环境变量）
- PORT — 服务端口（默认 3000）
- YOUTUBE_API_KEY — 可选，用于更稳健地获取官方字幕
- CACHE_TTL — 缓存时长（秒，默认 3600）
- RATE_LIMIT — 简易速率限制
- LOG_LEVEL — 日志等级

Docker 示例
```bash
docker build -t youtube-transcript .
docker run -e PORT=3000 -e YOUTUBE_API_KEY="${YOUTUBE_API_KEY}" -p 3000:3000 youtube-transcript
```

安全与隐私
- 服务仅抓取公开可访问的 YouTube 字幕。
- 若接入第三方 ASR 服务，请妥善保管 API Key 并遵守隐私合规。
- 生产环境建议启用 HTTPS 与请求鉴权。

集成建议
- 机器处理请优先使用 format=json。
- 调用方也应做缓存以减轻服务压力。
- 批量请求时请错开以避免触发速率限制。

贡献
- 欢迎 PR：
  - 复杂功能建议先开 issue 讨论。
  - 为新行为添加测试。
  - 清晰说明配置或接口变更。

许可证
- MIT（或你偏好的许可证），请在仓库添加 LICENSE 文件。

联系方式
- 仓库所有者: SamadhiFire
- Issue 跟踪: https://github.com/SamadhiFire/YouTube-boltnew/issues
