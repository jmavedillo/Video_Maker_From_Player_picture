const path = require('node:path');
const { generateVideo } = require('./generator');

async function main() {
  const rootDir = path.resolve(__dirname, '..');
  const outputDir = path.join(rootDir, 'output');
  const outputPath = path.join(outputDir, 'test-reveal.mp4');

  console.log('Generating video...');
  console.log(`- output: ${outputPath}`);

  const result = await generateVideo({ outputPath });

  console.log(`- image:  ${result.config.imagePath}`);
  console.log(`- font:   ${result.config.fontPath}`);
  console.log(`- duration: ${result.config.totalDuration}s`);
  console.log(`- scroll window: ${result.config.startScrollAt}s to ${result.config.endScrollAt}s`);
  console.log('Done.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
