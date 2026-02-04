const express = require('express');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const { authenticateToken } = require('../middleware/authMiddleware');
const {
  findById,
  getByUserId,
  findByUserIdAndName,
  create,
  update,
  remove,
  addTrack,
  addTracks,
  removeTrack,
  isOwner,
} = require('../models/playlistStore');
const { findById: findTrackById, findByIds } = require('../models/trackStore');
const { parsePaginationParams, paginate } = require('../utils/pagination');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

/**
 * GET /playlists
 * List current user's playlists with pagination
 */
router.get('/', (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req.query);
    const result = getByUserId(req.user.id, { page, limit });

    // Add track count to each playlist
    const playlistsWithCount = result.data.map((playlist) => ({
      ...playlist,
      trackCount: playlist.trackIds.length,
    }));

    res.json({
      success: true,
      data: playlistsWithCount,
      pagination: result.pagination,
    });
  } catch (err) {
    console.error('Error fetching playlists:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch playlists',
      },
    });
  }
});

/**
 * GET /playlists/:id
 * Get playlist details with paginated tracks
 */
router.get('/:id', (req, res) => {
  try {
    const playlist = findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYLIST_NOT_FOUND',
          message: 'Playlist not found',
        },
      });
    }

    // Check ownership
    if (playlist.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this playlist',
        },
      });
    }

    // Parse track pagination params
    const trackPage = parseInt(req.query.trackPage, 10) || 1;
    const trackLimit = Math.min(parseInt(req.query.trackLimit, 10) || 50, 100);

    // Get paginated tracks
    const allTracks = findByIds(playlist.trackIds);
    const paginatedTracks = paginate(allTracks, trackPage, trackLimit);

    res.json({
      success: true,
      data: {
        id: playlist.id,
        name: playlist.name,
        trackCount: playlist.trackIds.length,
        createdAt: playlist.createdAt,
        updatedAt: playlist.updatedAt,
        tracks: paginatedTracks.data,
      },
      trackPagination: paginatedTracks.pagination,
    });
  } catch (err) {
    console.error('Error fetching playlist:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch playlist',
      },
    });
  }
});

/**
 * POST /playlists
 * Create a new playlist
 */
router.post(
  '/',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Playlist name is required')
      .isLength({ max: 100 })
      .withMessage('Playlist name must be 100 characters or less'),
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: errors.array(),
          },
        });
      }

      const { name } = req.body;

      // Check for duplicate name
      const existing = findByUserIdAndName(req.user.id, name);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_PLAYLIST',
            message: 'A playlist with this name already exists',
          },
        });
      }

      const playlist = create({
        id: uuidv4(),
        userId: req.user.id,
        name,
        trackIds: [],
      });

      res.status(201).json({
        success: true,
        data: playlist,
      });
    } catch (err) {
      console.error('Error creating playlist:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create playlist',
        },
      });
    }
  }
);

/**
 * PUT /playlists/:id
 * Update playlist name or track order
 */
router.put(
  '/:id',
  [
    body('name')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Playlist name cannot be empty')
      .isLength({ max: 100 })
      .withMessage('Playlist name must be 100 characters or less'),
    body('trackIds')
      .optional()
      .isArray()
      .withMessage('trackIds must be an array'),
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: errors.array(),
          },
        });
      }

      const { name, trackIds } = req.body;

      // Check if name is being changed to a duplicate
      if (name) {
        const existing = findByUserIdAndName(req.user.id, name);
        if (existing && existing.id !== req.params.id) {
          return res.status(409).json({
            success: false,
            error: {
              code: 'DUPLICATE_PLAYLIST',
              message: 'A playlist with this name already exists',
            },
          });
        }
      }

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (trackIds !== undefined) updates.trackIds = trackIds;

      const playlist = update(req.params.id, req.user.id, updates);

      if (!playlist) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAYLIST_NOT_FOUND',
            message: 'Playlist not found or access denied',
          },
        });
      }

      res.json({
        success: true,
        data: playlist,
      });
    } catch (err) {
      console.error('Error updating playlist:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update playlist',
        },
      });
    }
  }
);

/**
 * DELETE /playlists/:id
 * Delete a playlist
 */
router.delete('/:id', (req, res) => {
  try {
    const deleted = remove(req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYLIST_NOT_FOUND',
          message: 'Playlist not found or access denied',
        },
      });
    }

    res.json({
      success: true,
      data: {
        message: 'Playlist deleted successfully',
      },
    });
  } catch (err) {
    console.error('Error deleting playlist:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete playlist',
      },
    });
  }
});

/**
 * POST /playlists/:id/tracks
 * Add track(s) to a playlist
 */
router.post(
  '/:id/tracks',
  [
    body('trackId').optional().isString().withMessage('trackId must be a string'),
    body('trackIds').optional().isArray().withMessage('trackIds must be an array'),
  ],
  (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid input',
            details: errors.array(),
          },
        });
      }

      const { trackId, trackIds } = req.body;

      // Must provide either trackId or trackIds
      if (!trackId && (!trackIds || trackIds.length === 0)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Provide trackId or trackIds',
          },
        });
      }

      let playlist;

      if (trackIds && trackIds.length > 0) {
        // Verify all tracks exist
        const existingTracks = findByIds(trackIds);
        if (existingTracks.length !== trackIds.length) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_TRACKS',
              message: 'One or more tracks not found',
            },
          });
        }

        playlist = addTracks(req.params.id, req.user.id, trackIds);
      } else {
        // Verify track exists
        const track = findTrackById(trackId);
        if (!track) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'TRACK_NOT_FOUND',
              message: 'Track not found',
            },
          });
        }

        playlist = addTrack(req.params.id, req.user.id, trackId);
      }

      if (!playlist) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'PLAYLIST_NOT_FOUND',
            message: 'Playlist not found or access denied',
          },
        });
      }

      res.json({
        success: true,
        data: {
          ...playlist,
          trackCount: playlist.trackIds.length,
        },
      });
    } catch (err) {
      console.error('Error adding tracks to playlist:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to add tracks to playlist',
        },
      });
    }
  }
);

/**
 * DELETE /playlists/:id/tracks/:trackId
 * Remove a track from a playlist
 */
router.delete('/:id/tracks/:trackId', (req, res) => {
  try {
    const playlist = removeTrack(req.params.id, req.user.id, req.params.trackId);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYLIST_NOT_FOUND',
          message: 'Playlist not found or access denied',
        },
      });
    }

    res.json({
      success: true,
      data: {
        ...playlist,
        trackCount: playlist.trackIds.length,
      },
    });
  } catch (err) {
    console.error('Error removing track from playlist:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to remove track from playlist',
      },
    });
  }
});

/**
 * GET /playlists/:id/download
 * Download all tracks in the playlist as a ZIP file
 */
router.get('/:id/download', (req, res) => {
  try {
    const playlist = findById(req.params.id);

    if (!playlist) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'PLAYLIST_NOT_FOUND',
          message: 'Playlist not found',
        },
      });
    }

    // Check ownership
    if (playlist.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have access to this playlist',
        },
      });
    }

    // Get all tracks
    const tracks = findByIds(playlist.trackIds);

    if (tracks.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EMPTY_PLAYLIST',
          message: 'Playlist has no tracks to download',
        },
      });
    }

    // Create a clean filename for the ZIP
    const zipFilename = `${playlist.name.replace(/[/\\?%*:|"<>]/g, '-')}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(zipFilename)}"`
    );

    // Create archive and pipe to response
    const archive = archiver('zip', {
      zlib: { level: 5 }, // Moderate compression for speed
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'ARCHIVE_ERROR',
            message: 'Failed to create archive',
          },
        });
      }
    });

    archive.pipe(res);

    // Add each track to the archive
    let trackNumber = 1;
    for (const track of tracks) {
      if (!track.filePath) {
        continue;
      }

      const filePath = path.join(config.paths.songs, track.filePath);

      if (!fs.existsSync(filePath)) {
        console.warn(`File not found for track ${track.id}: ${filePath}`);
        continue;
      }

      const ext = path.extname(track.filePath);
      // Use track number prefix to maintain playlist order
      const archiveFilename = `${String(trackNumber).padStart(2, '0')} - ${track.artist} - ${track.trackName}${ext}`
        .replace(/[/\\?%*:|"<>]/g, '-');

      archive.file(filePath, { name: archiveFilename });
      trackNumber++;
    }

    archive.finalize();
  } catch (err) {
    console.error('Error downloading playlist:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to download playlist',
        },
      });
    }
  }
});

module.exports = router;
