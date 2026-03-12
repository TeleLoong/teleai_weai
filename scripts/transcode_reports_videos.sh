#!/usr/bin/env bash
set -euo pipefail

# Batch process assets/reports videos.
# - Keep original HD file by default.
# - Generate low-bitrate copy: <video_name>__low.mp4
# - Generate poster: <video_name>__poster.jpg
# Set REWRITE_HD=true to rewrite the original source in-place.

REPORTS_DIR="${1:-assets/reports}"
CRF="${CRF:-22}"
PRESET="${PRESET:-medium}"
GOP="${GOP:-50}"
POSTER_AT_SECONDS="${POSTER_AT_SECONDS:-1}"
REWRITE_HD="${REWRITE_HD:-false}"
SKIP_EXISTING_LOW="${SKIP_EXISTING_LOW:-true}"
LOW_HEIGHT="${LOW_HEIGHT:-540}"
LOW_CRF="${LOW_CRF:-29}"
LOW_PRESET="${LOW_PRESET:-veryfast}"
LOW_MAXRATE="${LOW_MAXRATE:-1000k}"
LOW_BUFSIZE="${LOW_BUFSIZE:-2000k}"
LOW_AUDIO_BITRATE="${LOW_AUDIO_BITRATE:-96k}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$REPORTS_DIR" ]]; then
  echo "ERROR: directory not found: $REPORTS_DIR" >&2
  exit 1
fi

processed=0
failed=0
hd_rewritten=0
low_generated=0
low_skipped=0
poster_generated=0

echo "Transcoding MP4 files under: $REPORTS_DIR"
echo "Settings:"
echo "  REWRITE_HD=$REWRITE_HD CRF=$CRF PRESET=$PRESET GOP=$GOP"
echo "  LOW_HEIGHT=$LOW_HEIGHT LOW_CRF=$LOW_CRF LOW_PRESET=$LOW_PRESET"
echo "  LOW_MAXRATE=$LOW_MAXRATE LOW_BUFSIZE=$LOW_BUFSIZE LOW_AUDIO_BITRATE=$LOW_AUDIO_BITRATE"

stale_tmp_count=0
while IFS= read -r -d '' stale_tmp; do
  rm -f "$stale_tmp"
  stale_tmp_count=$((stale_tmp_count + 1))
done < <(find "$REPORTS_DIR" -maxdepth 1 -type f \( -name "*__low.__tmp__.mp4" -o -name "*.__tmp__.mp4" -o -name "*.__tmp__.jpg" \) -print0)

if [[ "$stale_tmp_count" -gt 0 ]]; then
  echo "  Removed stale temporary files: $stale_tmp_count"
fi

while IFS= read -r -d '' input; do
  filename="$(basename "$input")"
  stem="${input%.*}"

  if [[ "$stem" == *__poster || "$stem" == *__low || "$stem" == *.__tmp__ ]]; then
    continue
  fi

  tmp_video="${stem}.__tmp__.mp4"
  tmp_low="${stem}__low.__tmp__.mp4"
  low="${stem}__low.mp4"
  tmp_poster="${stem}.__tmp__.jpg"
  poster="${stem}__poster.jpg"

  echo ""
  echo ">>> Processing: $filename"

  if [[ "$REWRITE_HD" == "true" ]]; then
    if ffmpeg -nostdin -hide_banner -loglevel error -y \
      -i "$input" \
      -map_metadata 0 \
      -c:v libx264 \
      -preset "$PRESET" \
      -crf "$CRF" \
      -pix_fmt yuv420p \
      -profile:v high \
      -movflags +faststart \
      -g "$GOP" \
      -keyint_min "$GOP" \
      -sc_threshold 0 \
      -c:a aac \
      -b:a 128k \
      -ar 48000 \
      "$tmp_video"; then
      mv -f "$tmp_video" "$input"
      hd_rewritten=$((hd_rewritten + 1))
    else
      echo "ERROR: HD rewrite failed: $filename" >&2
      rm -f "$tmp_video"
      failed=$((failed + 1))
      continue
    fi
  fi

  if [[ "$SKIP_EXISTING_LOW" == "true" && -f "$low" ]]; then
    low_skipped=$((low_skipped + 1))
  else
    if ffmpeg -nostdin -hide_banner -loglevel error -y \
      -i "$input" \
      -map_metadata 0 \
      -vf "scale=-2:'min($LOW_HEIGHT,ih)'" \
      -c:v libx264 \
      -preset "$LOW_PRESET" \
      -crf "$LOW_CRF" \
      -maxrate "$LOW_MAXRATE" \
      -bufsize "$LOW_BUFSIZE" \
      -pix_fmt yuv420p \
      -profile:v high \
      -movflags +faststart \
      -g "$GOP" \
      -keyint_min "$GOP" \
      -sc_threshold 0 \
      -c:a aac \
      -b:a "$LOW_AUDIO_BITRATE" \
      -ar 48000 \
      "$tmp_low"; then
      mv -f "$tmp_low" "$low"
      low_generated=$((low_generated + 1))
    else
      echo "ERROR: low-bitrate transcode failed: $filename" >&2
      rm -f "$tmp_low"
      failed=$((failed + 1))
      continue
    fi
  fi

  if ffmpeg -nostdin -hide_banner -loglevel error -y \
    -ss "$POSTER_AT_SECONDS" \
    -i "$input" \
    -frames:v 1 \
    -q:v 2 \
    "$tmp_poster"; then
    mv -f "$tmp_poster" "$poster"
    poster_generated=$((poster_generated + 1))
  else
    echo "WARN: poster generation failed for: $filename" >&2
    rm -f "$tmp_poster"
  fi

  processed=$((processed + 1))
done < <(find "$REPORTS_DIR" -maxdepth 1 -type f \( -iname "*.mp4" \) -print0 | sort -z)

echo ""
echo "Done."
echo "  Processed videos: $processed"
echo "  HD rewritten: $hd_rewritten"
echo "  Low generated: $low_generated"
echo "  Low skipped(existing): $low_skipped"
echo "  Posters generated: $poster_generated"
echo "  Failed: $failed"

if [[ "$failed" -gt 0 ]]; then
  exit 2
fi
