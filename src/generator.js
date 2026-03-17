const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const imagePath = path.join(rootDir, 'assets', 'images', 'base.png');
const fontsDir = path.join(rootDir, 'assets', 'fonts');

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
    options.videoDurationSeconds ?? process.env.VIDEO_DURATION_SECONDS ?? 3
  );
  const startScrollAt = Number(
    options.scrollStartSeconds ?? process.env.SCROLL_START_SECONDS ?? 0.5
  );
  const endScrollAt = Number(
    options.scrollEndSeconds ?? process.env.SCROLL_END_SECONDS ?? 2.5
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
  // Keep the reveal text in a stable title area with a fixed in-frame bottom margin.
  const revealTextY = 'h-105';

  const filter = [
    `drawbox=x=${titleX}:y=${titleY}:w=${titleW}:h=${titleH}:color=black@0.45:t=fill`,
    `drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontsize=42:fontcolor=white:shadowcolor=black@0.8:shadowx=2:shadowy=2:x='if(lt(t,${config.startScrollAt}),w*0.12,if(lt(t,${config.endScrollAt}),w*0.12-(t-${config.startScrollAt})*220,w*0.12-(${config.endScrollAt}-${config.startScrollAt})*220))':y=${revealTextY}`
  ].join(',');

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
    '-s',
    '500x750',
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
