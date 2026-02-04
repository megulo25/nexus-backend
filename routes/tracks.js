const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');

const config = require('../config');
const { authenticateToken } = require('../middleware/authMiddleware');
const { findById, getAll } = require('../models/trackStore');
const { parsePaginationParams } = require('../utils/pagination');

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

    const result = getAll({ page, limit, search });

    res.json({
      success: true,
      data: result.data,
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
      data: track,
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

    const filePath = path.join(config.paths.songs, track.filePath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
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

    const filePath = path.join(config.paths.songs, track.filePath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
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

module.exports = router;
