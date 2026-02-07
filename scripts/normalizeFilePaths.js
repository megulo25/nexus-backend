/**
 * One-time script: Normalize all filePaths in tracks.json to NFC.
 *
 * macOS (HFS+/APFS) silently stores filenames in NFD (decomposed Unicode),
 * while Linux preserves them byte-for-byte. When tracks.json is created on
 * macOS and the songs/ directory is copied to Linux, accented characters like
 * ñ, é, ü may not match because the JSON string and the on-disk filename
 * use different Unicode normalization forms.
 *
 * This script normalizes both:
 *   1. The filePath values in tracks.json → NFC
 *   2. The actual filenames in songs/ → NFC (renames on disk)
 *
 * Usage:
 *   node scripts/normalizeFilePaths.js            # dry-run
 *   node scripts/normalizeFilePaths.js --execute   # apply changes
 */

const fs = require('fs');
const path = require('path');

const TRACKS_FILE = path.join(__dirname, '..', 'data', 'tracks.json');
const SONGS_DIR = path.resolve(process.env.SONGS_PATH || path.join(__dirname, '..', 'songs'));
const DRY_RUN = !process.argv.includes('--execute');

function run() {
  console.log(`\n🔤 Unicode Normalization Script${DRY_RUN ? ' (DRY RUN — pass --execute to apply)' : ''}\n`);
  console.log(`   tracks.json: ${TRACKS_FILE}`);
  console.log(`   songs dir:   ${SONGS_DIR}\n`);

  const tracks = JSON.parse(fs.readFileSync(TRACKS_FILE, 'utf8'));

  let jsonChanged = 0;
  let filesRenamed = 0;
  let missing = 0;

  for (const track of tracks) {
    if (!track.filePath) continue;

    const normalized = track.filePath.normalize('NFC');
    const needsJsonFix = normalized !== track.filePath;

    // Check if the on-disk file needs renaming too
    const currentPath = path.join(SONGS_DIR, track.filePath);
    const normalizedPath = path.join(SONGS_DIR, normalized);

    if (needsJsonFix) {
      console.log(`  JSON: "${track.filePath}" → "${normalized}"`);
      if (!DRY_RUN) {
        track.filePath = normalized;
      }
      jsonChanged++;
    }

    // Rename on-disk file if it exists with the old (NFD) name
    if (needsJsonFix && fs.existsSync(currentPath) && currentPath !== normalizedPath) {
      if (!DRY_RUN) {
        fs.renameSync(currentPath, normalizedPath);
      }
      console.log(`  DISK: renamed file to NFC`);
      filesRenamed++;
    } else if (needsJsonFix && !fs.existsSync(currentPath) && !fs.existsSync(normalizedPath)) {
      console.log(`  ⚠️  file not found on disk: ${track.filePath}`);
      // Still fix the JSON path
      if (!DRY_RUN) {
        track.filePath = normalized;
      }
      missing++;
    }
  }

  if (!DRY_RUN && jsonChanged > 0) {
    fs.writeFileSync(TRACKS_FILE, JSON.stringify(tracks, null, 2));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   JSON paths normalized: ${jsonChanged}`);
  console.log(`   Files renamed on disk: ${filesRenamed}`);
  console.log(`   Files not found:       ${missing}`);
  console.log(`   Total tracks:          ${tracks.length}\n`);

  if (DRY_RUN) {
    console.log('ℹ️  This was a dry run. Run with --execute to apply changes.\n');
  } else if (jsonChanged > 0) {
    console.log('✅ Normalization complete.\n');
  } else {
    console.log('✅ All filePaths are already NFC-normalized.\n');
  }
}

run();
