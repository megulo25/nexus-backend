const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mime = require('mime-types');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const { authenticateToken } = require('../middleware/authMiddleware');
const { findById, getAll, addTrack, findByArtistAndName, withFileSize, withFileSizes } = require('../models/trackStore');
const { parsePaginationParams } = require('../utils/pagination');
const { sanitizeFilename, buildTrackFilename } = require('../utils/sanitize');
const { resolveTrackPath } = require('../utils/resolveTrackPath');

const execFileAsync = promisify(execFile);

// Build a clean environment for yt-dlp child processes.
// Yarn PnP injects NODE_OPTIONS="--require .pnp.cjs" which leaks into
// yt-dlp's Deno subprocess and crashes it (Deno blocks env access).
// We also strip all PNP_*/YARN_* vars and set cwd to a temp dir so
// Deno can't discover .pnp.cjs by walking up from the working directory.
const ytdlpOpts = (() => {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  for (const key of Object.keys(env)) {
    if (key.startsWith('PNP_') || key.startsWith('YARN_')) {
      delete env[key];
    }
  }
  return { env, cwd: os.tmpdir() };
})();

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /tracks
 * List all tracks with pagination and optional search
 * Query params: page, limit, search
 */
router.get('/', (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req.query);
    const search = req.query.search || '';
    const sort = req.query.sort || '';

    const result = getAll({ page, limit, search, sort });

    res.json({
      success: true,
      data: withFileSizes(result.data),
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Error fetching tracks:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch tracks',
      },
    });
  }
});

/**
 * GET /tracks/:id
 * Get single track metadata
 */
router.get('/:id', (req, res) => {
  try {
    const track = findById(req.params.id);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRACK_NOT_FOUND',
          message: 'Track not found',
        },
      });
    }

    res.json({
      success: true,
      data: withFileSize(track),
    });
  } catch (err) {
    console.error('Error fetching track:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch track',
      },
    });
  }
});

/**
 * GET /tracks/:id/stream
 * Stream audio file with Range header support for seeking
 */
router.get('/:id/stream', (req, res) => {
  try {
    const track = findById(req.params.id);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRACK_NOT_FOUND',
          message: 'Track not found',
        },
      });
    }

    if (!track.filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Audio file not available',
        },
      });
    }

    const filePath = resolveTrackPath(config.paths.songs, track.filePath);

    // Check if file exists (handles Unicode NFC/NFD normalization)
    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Audio file not found on server',
        },
      });
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const mimeType = mime.lookup(filePath) || 'audio/mpeg';
    const range = req.headers.range;

    if (range) {
      // Handle Range request for seeking
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      // Validate range
      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).json({
          success: false,
          error: {
            code: 'RANGE_NOT_SATISFIABLE',
            message: 'Requested range not satisfiable',
          },
        });
        return;
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
        'Cache-Control': 'public, max-age=86400',
      });

      stream.pipe(res);
    } else {
      // No range requested - send entire file
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mimeType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
      });

      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Error streaming track:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to stream track',
      },
    });
  }
});

/**
 * GET /tracks/:id/download
 * Download full audio file with Content-Disposition header
 */
router.get('/:id/download', (req, res) => {
  try {
    const track = findById(req.params.id);

    if (!track) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TRACK_NOT_FOUND',
          message: 'Track not found',
        },
      });
    }

    if (!track.filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Audio file not available',
        },
      });
    }

    const filePath = resolveTrackPath(config.paths.songs, track.filePath);

    // Check if file exists (handles Unicode NFC/NFD normalization)
    if (!filePath) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'FILE_NOT_FOUND',
          message: 'Audio file not found on server',
        },
      });
    }

    const stat = fs.statSync(filePath);
    const mimeType = mime.lookup(filePath) || 'audio/mpeg';
    const ext = path.extname(track.filePath);

    // Create a clean filename for download
    const downloadFilename = `${track.artist} - ${track.trackName}${ext}`
      .replace(/[/\\?%*:|"<>]/g, '-'); // Remove invalid filename chars

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', stat.size);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(downloadFilename)}"`
    );
    res.setHeader('Cache-Control', 'public, max-age=86400');

    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('Error downloading track:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to download track',
      },
    });
  }
});

/**
 * POST /tracks/import
 * Import a track from a YouTube URL using yt-dlp.
 * Downloads audio as m4a, extracts metadata, and adds to the library.
 *
 * Body: { url: string }
 */
router.post('/import', async (req, res) => {
  const { url } = req.body;

  // --- Validate request body ---
  if (!url || typeof url !== 'string') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'url is required',
      },
    });
  }

  // Validate it looks like a YouTube watch URL
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid URL',
      },
    });
  }

  const validHosts = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'youtu.be'];
  if (!validHosts.includes(parsedUrl.hostname)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Only YouTube URLs are supported',
      },
    });
  }

  // --- Clean the URL: strip playlist/radio params, keep only video ID ---
  const videoId = parsedUrl.searchParams.get('v');
  if (!videoId) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'URL must contain a video ID (v parameter)',
      },
    });
  }
  const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // --- Extract metadata from yt-dlp first (fast, no download) ---
  let title, uploader, album, durationStr;
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--skip-download',
      '--print', '%(title)s\n%(uploader)s\n%(album)s\n%(duration)s',
      cleanUrl,
    ], { ...ytdlpOpts, timeout: 30_000 });

    const lines = stdout.trim().split('\n');
    title = lines[0] || '';
    uploader = lines[1] || '';
    album = lines[2] || '';
    durationStr = lines[3] || '';

    // yt-dlp prints "NA" for missing fields
    if (album === 'NA' || !album) album = null;
    if (durationStr === 'NA') durationStr = '';
  } catch (err) {
    console.error('yt-dlp metadata extraction failed:', err.message);
    return res.status(502).json({
      success: false,
      error: {
        code: 'IMPORT_METADATA_FAILED',
        message: 'Failed to extract metadata from YouTube',
      },
    });
  }

  // --- Parse artist and track name ---
  // YouTube titles commonly use "Artist - Track" format
  let artist, trackName;
  if (title.includes(' - ')) {
    const dashIndex = title.indexOf(' - ');
    artist = title.substring(0, dashIndex).trim();
    trackName = title.substring(dashIndex + 3).trim();
  } else {
    // Fallback: use uploader (channel) as artist, full title as track name
    artist = uploader;
    trackName = title;
  }

  // Clean up common YouTube title suffixes
  trackName = trackName
    .replace(/\s*\(Official\s*(Music\s*)?Video\)/gi, '')
    .replace(/\s*\[Official\s*(Music\s*)?Video\]/gi, '')
    .replace(/\s*\(Official\s*Audio\)/gi, '')
    .replace(/\s*\[Official\s*Audio\]/gi, '')
    .replace(/\s*\(Lyric(s)?\s*Video\)/gi, '')
    .replace(/\s*\[Lyric(s)?\s*Video\]/gi, '')
    .replace(/\s*\(Audio\)/gi, '')
    .replace(/\s*\[Audio\]/gi, '')
    .replace(/\s*\(Visualizer\)/gi, '')
    .replace(/\s*\[Visualizer\]/gi, '')
    .replace(/\s*\|\s*.*$/, '') // Remove "| Something" at end
    .trim();

  if (!artist || !trackName) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMPORT_PARSE_FAILED',
        message: 'Could not determine artist and track name from video title',
      },
    });
  }

  // --- Check for duplicate before downloading ---
  const existing = findByArtistAndName(artist, trackName);
  if (existing) {
    return res.json({
      success: true,
      data: {
        message: 'Track already exists in library',
        track: withFileSize(existing),
        duplicate: true,
      },
    });
  }

  // --- Download audio ---
  const filename = buildTrackFilename(artist, trackName);
  const outputPath = path.join(config.paths.songs, filename);

  try {
    await execFileAsync('yt-dlp', [
      '--no-playlist',
      '--extract-audio',
      '--audio-format', 'm4a',
      '--audio-quality', '0',
      '-o', outputPath,
      cleanUrl,
    ], { ...ytdlpOpts, timeout: 300_000 }); // 5 minute timeout, matching search project
  } catch (err) {
    console.error('yt-dlp download failed:', err.message);
    // Clean up partial download if it exists
    try { fs.unlinkSync(outputPath); } catch { /* ignore */ }
    return res.status(502).json({
      success: false,
      error: {
        code: 'IMPORT_DOWNLOAD_FAILED',
        message: 'Failed to download audio from YouTube',
      },
    });
  }

  // --- Read duration from the downloaded file using music-metadata ---
  let durationMs = null;
  try {
    const fileBuffer = fs.readFileSync(outputPath);
    const { parseBuffer } = await import('music-metadata');
    const metadata = await parseBuffer(fileBuffer);
    if (metadata.format && metadata.format.duration) {
      durationMs = Math.round(metadata.format.duration * 1000);
    }
  } catch (err) {
    console.warn('Could not read duration from file, falling back to yt-dlp value:', err.message);
    // Fallback to yt-dlp duration (seconds → ms)
    if (durationStr) {
      const secs = parseFloat(durationStr);
      if (!isNaN(secs)) durationMs = Math.round(secs * 1000);
    }
  }

  // --- Create track record and persist ---
  const track = {
    id: uuidv4(),
    trackName,
    artist,
    album,
    releaseDate: null,
    durationMs,
    sourceUrl: url,
    filePath: filename,
    createdAt: new Date().toISOString(),
  };

  const saved = addTrack(track);

  console.log(`Imported track: ${artist} - ${trackName} (${filename})`);

  res.status(201).json({
    success: true,
    data: {
      message: 'Track imported successfully',
      track: withFileSize(saved),
    },
  });
});

module.exports = router;
