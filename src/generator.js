const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const defaultImagePath = path.join(rootDir, 'assets', 'images', 'base.png');
const defaultAudioPath = path.join(rootDir, 'assets', 'images', 'SoundBase1.mp3');
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
    videoDurationSeconds: 13,
    scrollStartSeconds: 0,
    scrollEndSeconds: 11.5,
    initialPauseSeconds: 1.5,
    finalPauseSeconds: 1.5,
    scrollPixelsPerSecond: 50
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
  const imagePath = options.imagePath || defaultImagePath;
  const audioPath = options.audioPath || defaultAudioPath;

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

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Missing background audio: ${audioPath}. Add an MP3 file and run again.`);
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
    audioPath,
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

  const heartbeatCycleSeconds = 1.2;
  const firstPulsePeakScale = 1.035;
  const secondPulsePeakScale = 1.02;
  const pulseHalfDurationSeconds = 0.06;
  const firstPulseStartSeconds = 0;
  const secondPulseStartSeconds = 0.25;
  const microJoltPixels = 1.5;
  const firstPulseFlareSeconds = 0.15;

  const heartbeatPhaseExpr = `mod(t\\,${heartbeatCycleSeconds})`;
  const firstPulseExpansionExpr = `1+${(firstPulsePeakScale - 1).toFixed(3)}*(1-pow(1-(${heartbeatPhaseExpr}-${firstPulseStartSeconds})/${pulseHalfDurationSeconds}\\,2))`;
  const firstPulseContractionExpr = `1+${(firstPulsePeakScale - 1).toFixed(3)}*(1-pow((${heartbeatPhaseExpr}-${pulseHalfDurationSeconds})/${pulseHalfDurationSeconds}\\,2))`;
  const secondPulseExpansionExpr = `1+${(secondPulsePeakScale - 1).toFixed(3)}*(1-pow(1-(${heartbeatPhaseExpr}-${secondPulseStartSeconds})/${pulseHalfDurationSeconds}\\,2))`;
  const secondPulseContractionExpr = `1+${(secondPulsePeakScale - 1).toFixed(3)}*(1-pow((${heartbeatPhaseExpr}-${secondPulseStartSeconds + pulseHalfDurationSeconds})/${pulseHalfDurationSeconds}\\,2))`;
  const breathingExpr = `1+0.005*pow(sin(((${heartbeatPhaseExpr}-${secondPulseStartSeconds + pulseHalfDurationSeconds})/(${heartbeatCycleSeconds - (secondPulseStartSeconds + pulseHalfDurationSeconds)}))*PI)\\,2)`;
  const heartbeatScaleExpr = `if(lt(${heartbeatPhaseExpr}\\,${pulseHalfDurationSeconds})\\,${firstPulseExpansionExpr}\\,if(lt(${heartbeatPhaseExpr}\\,${pulseHalfDurationSeconds * 2})\\,${firstPulseContractionExpr}\\,if(lt(${heartbeatPhaseExpr}\\,${secondPulseStartSeconds + pulseHalfDurationSeconds})\\,${secondPulseExpansionExpr}\\,if(lt(${heartbeatPhaseExpr}\\,${secondPulseStartSeconds + pulseHalfDurationSeconds * 2})\\,${secondPulseContractionExpr}\\,${breathingExpr}))))`;
  const firstPulseYOffsetExpr = `if(lt(${heartbeatPhaseExpr}\\,${pulseHalfDurationSeconds * 2})\\,-${microJoltPixels}*sin((${heartbeatPhaseExpr}/${pulseHalfDurationSeconds * 2})*PI)\\,0)`;
  const flareEnableExpr = `lt(mod(t\\,${heartbeatCycleSeconds})\\,${firstPulseFlareSeconds})`;

  const filter = [
    `scale=500:750,split=2[bgsrc][textsrc]`,
    `[bgsrc]scale=w='500*(${heartbeatScaleExpr})':h='750*(${heartbeatScaleExpr})':eval=frame,crop=w=500:h=750:x='(iw-500)/2':y='(ih-750)/2+(${firstPulseYOffsetExpr})'[pulsebg]`,
    `color=c=black@0.0:s=500x750:d=${config.totalDuration},format=rgba,drawbox=x=130:y=215:w=240:h=240:color=white@0.07:t=fill,drawbox=x=180:y=265:w=140:h=140:color=white@0.12:t=fill[flare]`,
    `[pulsebg][flare]overlay=x=0:y=0:format=auto:enable='${flareEnableExpr}'[base]`,
    // Draw scrolling text on a duplicate layer, crop it to a fixed title viewport, then overlay it back.
    `[textsrc]drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontsize=52:fontcolor=white:x='${scrollX}':y=${revealTextY},crop=w=${revealViewportW}:h=${revealViewportH}:x=${revealViewportX}:y=${revealViewportY}[textclip]`,
    `[base][textclip]overlay=x=${revealViewportX}:y=${revealViewportY}`
  ].join(';');

  const ffmpegArgs = [
    '-y',
    '-loop',
    '1',
    '-i',
    config.imagePath,
    '-i',
    config.audioPath,
    '-t',
    String(config.totalDuration),
    '-vf',
    filter,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
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
