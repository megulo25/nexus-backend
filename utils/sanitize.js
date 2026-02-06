/**
 * Sanitize a string for use in filenames.
 * Mirrors the stricter sanitizer from search/download.py:
 *   - Replaces invalid filesystem chars with _
 *   - Replaces spaces with _
 *   - Replaces semicolons with _ (multiple artists separator)
 *   - Collapses consecutive underscores
 *   - Strips leading/trailing underscores
 *
 * @param {string} name - The raw string to sanitize
 * @returns {string} A filesystem-safe string
 */
function sanitizeFilename(name) {
  let result = name;

  // Replace invalid filesystem characters with _
  result = result.replace(/[<>:"/\\|?*]/g, '_');

  // Replace spaces with underscores
  result = result.replace(/ /g, '_');

  // Replace semicolons (used for multiple artists) with _
  result = result.replace(/;/g, '_');

  // Collapse consecutive underscores
  result = result.replace(/_+/g, '_');

  // Strip leading/trailing underscores
  result = result.replace(/^_+|_+$/g, '');

  return result;
}

/**
 * Build a track filename following project conventions.
 * Pattern: {sanitized_artist}-{sanitized_track}.m4a
 *
 * @param {string} artist - Artist name
 * @param {string} trackName - Track name
 * @returns {string} The formatted filename
 */
function buildTrackFilename(artist, trackName) {
  return `${sanitizeFilename(artist)}-${sanitizeFilename(trackName)}.m4a`;
}

module.exports = { sanitizeFilename, buildTrackFilename };
