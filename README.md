# Video_Maker_From_Player_picture

Minimal lab prototype to generate a short MP4 from:
- one static base image
- one long scrolling text line (music-player style reveal)

Implementation is intentionally simple:
- plain Node.js script (`src/index.js`)
- direct `ffmpeg` command (no heavy wrapper libs)
- Docker-first execution

## Project structure

```txt
src/
assets/
  images/
    base.png        # required (you provide)
  fonts/
    *.ttf|*.otf     # required (you provide one font)
output/
  test-reveal.mp4   # generated
```

## Required placeholder assets

This repo does **not** include production assets.
You must add:

1. `assets/images/base.png`
   - any PNG image (recommended landscape, e.g. 1280x720)
2. One font file in `assets/fonts/`
   - `.ttf` or `.otf` (example: `DejaVuSans.ttf`)

The script auto-picks the first font file found.

## Run with Docker (recommended)

Build image:

```bash
docker build -t video-maker-poc .
```

Run container:

```bash
docker run --rm -v "$(pwd)/output:/app/output" video-maker-poc
```

Optional custom text:

```bash
docker run --rm \
  -e REVEAL_TEXT="Now Playing — Your long custom title goes here" \
  -v "$(pwd)/output:/app/output" \
  video-maker-poc
```

Optional timing controls:

```bash
docker run --rm \
  -e VIDEO_DURATION_SECONDS=12 \
  -e SCROLL_START_SECONDS=2 \
  -e SCROLL_END_SECONDS=10 \
  -v "$(pwd)/output:/app/output" \
  video-maker-poc
```

Timing variables must satisfy:

- `VIDEO_DURATION_SECONDS > 0`
- `0 <= SCROLL_START_SECONDS < SCROLL_END_SECONDS <= VIDEO_DURATION_SECONDS`

Output file:

- `output/test-reveal.mp4`

## Local non-Docker run (optional)

Only if `node` and `ffmpeg` are available locally:

```bash
node src/index.js
```

## Railway compatibility notes

- Uses container image with explicit OS deps (`ffmpeg`) in `Dockerfile`, so runtime is reproducible.
- Writes output to filesystem path (`/app/output`) without local-machine-only assumptions.
- No frontend, no external API integrations, no Spotify coupling.
- Configuration is environment-variable friendly (`REVEAL_TEXT`).
- Supports environment-variable timing controls (`VIDEO_DURATION_SECONDS`, `SCROLL_START_SECONDS`, `SCROLL_END_SECONDS`).
