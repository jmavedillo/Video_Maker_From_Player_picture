const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const imagePath = path.join(rootDir, 'assets', 'images', 'base.png');
const fontsDir = path.join(rootDir, 'assets', 'fonts');
const outputDir = path.join(rootDir, 'output');
const outputPath = path.join(outputDir, 'test-reveal.mp4');

const text =
  process.env.REVEAL_TEXT ||
  'Now Playing — This is a long scrolling title for the first MP4 proof of concept';

const totalDuration = Number(process.env.VIDEO_DURATION_SECONDS || 10);
const startScrollAt = Number(process.env.SCROLL_START_SECONDS || 1.5);
const endScrollAt = Number(process.env.SCROLL_END_SECONDS || 8.5);

if (!Number.isFinite(totalDuration) || totalDuration <= 0) {
  console.error('VIDEO_DURATION_SECONDS must be a positive number.');
  process.exit(1);
}

if (!Number.isFinite(startScrollAt) || !Number.isFinite(endScrollAt)) {
  console.error('SCROLL_START_SECONDS and SCROLL_END_SECONDS must be valid numbers.');
  process.exit(1);
}

if (startScrollAt < 0 || endScrollAt <= startScrollAt || endScrollAt > totalDuration) {
  console.error(
    'Expected 0 <= SCROLL_START_SECONDS < SCROLL_END_SECONDS <= VIDEO_DURATION_SECONDS.'
  );
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`Missing image: ${imagePath}`);
  console.error('Add a base image at assets/images/base.png and run again.');
  process.exit(1);
}

if (!fs.existsSync(fontsDir)) {
  console.error(`Missing fonts directory: ${fontsDir}`);
  process.exit(1);
}

const fontCandidates = fs
  .readdirSync(fontsDir)
  .filter((file) => /\.(ttf|otf)$/i.test(file));

if (fontCandidates.length === 0) {
  console.error(`No font file found in: ${fontsDir}`);
  console.error('Add one .ttf or .otf file (for example DejaVuSans.ttf) and run again.');
  process.exit(1);
}

const fontPath = path.join(fontsDir, fontCandidates[0]);
fs.mkdirSync(outputDir, { recursive: true });

const titleY = 'h-120';
const titleX = '60';
const titleW = 'w-120';
const titleH = '70';

const escapedFontPath = fontPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:');
const escapedText = text
  .replace(/\\/g, '\\\\')
  .replace(/,/g, '\\,')
  .replace(/\[/g, '\\[')
  .replace(/\]/g, '\\]')
  .replace(/:/g, '\\:')
  .replace(/'/g, "\\'")
  .replace(/%/g, '\\%');

const filter = [
  `drawbox=x=${titleX}:y=${titleY}:w=${titleW}:h=${titleH}:color=black@0.45:t=fill`,
  `drawtext=fontfile='${escapedFontPath}':text='${escapedText}':fontsize=42:fontcolor=white:shadowcolor=black@0.8:shadowx=2:shadowy=2:x='if(lt(t,${startScrollAt}),w*0.12,if(lt(t,${endScrollAt}),w*0.12-(t-${startScrollAt})*220,w*0.12-(${endScrollAt}-${startScrollAt})*220))':y=h-73`
].join(',');

console.log('Generating video...');
console.log(`- image:  ${imagePath}`);
console.log(`- font:   ${fontPath}`);
console.log(`- output: ${outputPath}`);
console.log(`- duration: ${totalDuration}s`);
console.log(`- scroll window: ${startScrollAt}s to ${endScrollAt}s`);

const ffmpegArgs = [
  '-y',
  '-loop',
  '1',
  '-i',
  imagePath,
  '-t',
  String(totalDuration),
  '-vf',
  filter,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  '-r',
  '30',
  outputPath
];

const result = spawnSync('ffmpeg', ffmpegArgs, {
  stdio: 'inherit'
});

if (result.status !== 0) {
  console.error('ffmpeg failed. See logs above.');
  process.exit(result.status || 1);
}

console.log('Done.');
