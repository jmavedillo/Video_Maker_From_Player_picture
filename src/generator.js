const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const imagePath = path.join(rootDir, 'assets', 'images', 'base.png');
const fontsDir = path.join(rootDir, 'assets', 'fonts');

const TIMING_PRESETS = {
  medium: {
    videoDurationSeconds: 7.5,
    scrollStartSeconds: 0,
    scrollEndSeconds: 5.3,
    initialPauseSeconds: 1.5,
    finalPauseSeconds: 1.2,
    scrollPixelsPerSecond: 56
  },
  long: {
    videoDurationSeconds: 10,
    scrollStartSeconds: 0,
    scrollEndSeconds: 8.5,
    initialPauseSeconds: 1.5,
    finalPauseSeconds: 1.5,
    scrollPixelsPerSecond: 48
  }
};

const selectedTimingPresetName = process.env.TIMING_PRESET === 'medium' ? 'medium' : 'long';
const selectedTimingPreset = TIMING_PRESETS[selectedTimingPresetName];

function escapeDrawtextText(input) {
  return String(input)
    .replace(/\\/g, '\\\\')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/%/g, '\\%');
}

function buildConfig(options = {}) {
  const text =
    options.text ||
    process.env.REVEAL_TEXT ||
    'Now Playing — This is a long scrolling title for the first MP4 proof of concept';

  const totalDuration = Number(
    options.videoDurationSeconds ??
      process.env.VIDEO_DURATION_SECONDS ??
      selectedTimingPreset.videoDurationSeconds
  );
  const startScrollAt = Number(
    options.scrollStartSeconds ??
      process.env.SCROLL_START_SECONDS ??
      selectedTimingPreset.scrollStartSeconds
  );
  const endScrollAt = Number(
    options.scrollEndSeconds ??
      process.env.SCROLL_END_SECONDS ??
      selectedTimingPreset.scrollEndSeconds
  );

  if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
    throw new Error('VIDEO_DURATION_SECONDS must be a positive number.');
  }

  if (!Number.isFinite(startScrollAt) || !Number.isFinite(endScrollAt)) {
    throw new Error('SCROLL_START_SECONDS and SCROLL_END_SECONDS must be valid numbers.');
  }

  if (startScrollAt < 0 || endScrollAt <= startScrollAt || endScrollAt > totalDuration) {
    throw new Error(
      'Expected 0 <= SCROLL_START_SECONDS < SCROLL_END_SECONDS <= VIDEO_DURATION_SECONDS.'
    );
  }

  if (!fs.existsSync(imagePath)) {
    throw new Error(`Missing image: ${imagePath}. Add a base image at assets/images/base.png and run again.`);
  }

  if (!fs.existsSync(fontsDir)) {
    throw new Error(`Missing fonts directory: ${fontsDir}`);
  }

  const fontCandidates = fs
    .readdirSync(fontsDir)
    .filter((file) => /\.(ttf|otf)$/i.test(file));

  if (fontCandidates.length === 0) {
    throw new Error(
      `No font file found in: ${fontsDir}. Add one .ttf or .otf file (for example DejaVuSans.ttf) and run again.`
    );
  }

  const fontPath = path.join(fontsDir, fontCandidates[0]);

  return {
    text,
    totalDuration,
    startScrollAt,
    endScrollAt,
    imagePath,
    fontPath
  };
}

function generateVideo(options) {
  const config = buildConfig(options);
  const outputPath = options.outputPath;

  if (!outputPath) {
    throw new Error('outputPath is required.');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // drawbox uses input-dimension vars (iw/ih) instead of w/h in this filter context.
  const titleY = 'ih-120';
  const titleX = '60';
  const titleW = 'iw-120';
  const titleH = '70';

  const escapedFontPath = config.fontPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
  const escapedText = escapeDrawtextText(config.text);
  const initialScrollPauseSeconds = selectedTimingPreset.initialPauseSeconds;
  const finalScrollPauseSeconds = selectedTimingPreset.finalPauseSeconds;
  const scrollPixelsPerSecond = selectedTimingPreset.scrollPixelsPerSecond;
  const delayedScrollStart = config.startScrollAt + initialScrollPauseSeconds;
  const delayedScrollEnd = Math.min(
    config.endScrollAt,
    config.totalDuration - finalScrollPauseSeconds
  );

  if (delayedScrollEnd <= delayedScrollStart) {
    throw new Error(
      'Expected scroll timing to leave movement between the initial and final pauses. Increase SCROLL_END_SECONDS or VIDEO_DURATION_SECONDS.'
    );
  }
  // Scale first so drawbox/drawtext coordinates and font size are computed on the final 500x750 frame.
  const revealTextY = '480';
  // Fixed crop viewport is intentional because the frame is already scaled to 500x750.
  const revealViewportX = '60';
  const revealViewportY = '482';
  const revealViewportW = '300';
  const revealViewportH = '88';
  const scrollX = `if(lt(t,${delayedScrollStart}),w*0.12,if(lt(t,${delayedScrollEnd}),w*0.12-(t-${delayedScrollStart})*${scrollPixelsPerSecond},w*0.12-(${delayedScrollEnd}-${delayedScrollStart})*${scrollPixelsPerSecond}))`;

  const filter = [
    `scale=500:750,drawbox=x=${titleX}:y=${titleY}:w=${titleW}:h=${titleH}:color=black@0.45:t=fill,split=2[base][textsrc]`,
    // Draw scrolling text on a duplicate layer, crop it to a fixed title viewport, then overlay it back.
    `[textsrc]drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontsize=52:fontcolor=white:shadowcolor=black@0.8:shadowx=2:shadowy=2:x='${scrollX}':y=${revealTextY},crop=w=${revealViewportW}:h=${revealViewportH}:x=${revealViewportX}:y=${revealViewportY}[textclip]`,
    `[base][textclip]overlay=x=${revealViewportX}:y=${revealViewportY}`
  ].join(';');

  const ffmpegArgs = [
    '-y',
    '-loop',
    '1',
    '-i',
    config.imagePath,
    '-t',
    String(config.totalDuration),
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-threads',
    '1',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-r',
    '15',
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stderr = '';

    ffmpeg.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    ffmpeg.on('error', (err) => {
      const elapsedMs = Date.now() - startTime;
      const wrapped = new Error(`Failed to start ffmpeg: ${err.message}`);
      wrapped.details = {
        code: err.code ?? null,
        signal: err.signal ?? null,
        killed: ffmpeg.killed,
        elapsedMs,
        command: `ffmpeg ${ffmpegArgs.join(' ')}`
      };
      reject(wrapped);
    });

    ffmpeg.on('close', (code, signal) => {
      const elapsedMs = Date.now() - startTime;
      if (code === 0) {
        resolve({ outputPath, config });
        return;
      }

      const details = {
        code,
        signal: signal ?? null,
        killed: ffmpeg.killed,
        elapsedMs,
        command: `ffmpeg ${ffmpegArgs.join(' ')}`
      };

      const diagnostic = [
        `code=${details.code}`,
        `signal=${details.signal}`,
        `killed=${details.killed}`,
        `elapsedMs=${details.elapsedMs}`,
        `command=${details.command}`
      ].join(', ');

      const wrapped = new Error(
        `ffmpeg failed (${diagnostic}). ${stderr ? `ffmpeg stderr:\n${stderr}` : ''}`
      );
      wrapped.details = details;

      reject(wrapped);
    });
  });
}

module.exports = {
  buildConfig,
  generateVideo
};
