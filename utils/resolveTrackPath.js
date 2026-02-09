const fs = require('fs');
const path = require('path');

/**
 * Resolve a track's file path, handling Unicode NFC/NFD normalization
 * mismatches between JSON data (typically NFC) and the filesystem
 * (macOS APFS stores filenames in NFD).
 *
 * Tries the original path first, then NFC, then NFD normalization.
 *
 * @param {string} songsDir - Absolute path to the songs directory
 * @param {string} filePath - Relative file path from track metadata
 * @returns {string|null} Resolved absolute path if found, null otherwise
 */
function resolveTrackPath(songsDir, filePath) {
  if (!filePath) return null;

  // 1. Try the path as-is
  const original = path.join(songsDir, filePath);
  if (fs.existsSync(original)) return original;

  // 2. Try NFC normalization (composed characters: ñ as single codepoint)
  const nfc = path.join(songsDir, filePath.normalize('NFC'));
  if (fs.existsSync(nfc)) return nfc;

  // 3. Try NFD normalization (decomposed characters: ñ as n + combining tilde)
  const nfd = path.join(songsDir, filePath.normalize('NFD'));
  if (fs.existsSync(nfd)) return nfd;

  return null;
}

module.exports = { resolveTrackPath };
