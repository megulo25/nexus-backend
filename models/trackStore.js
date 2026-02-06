const fs = require('fs');
const path = require('path');

const config = require('../config');

const TRACKS_FILE = path.join(__dirname, '..', 'data', 'tracks.json');

/**
 * Get the file size for a track
 * @param {Object} track - Track object with filePath
 * @returns {number|null} File size in bytes, or null if file doesn't exist
 */
function getTrackFileSize(track) {
  if (!track || !track.filePath) {
    return null;
  }
  try {
    const filePath = path.join(config.paths.songs, track.filePath);
    const stat = fs.statSync(filePath);
    return stat.size;
  } catch (err) {
    return null;
  }
}

/**
 * Add fileSize to a track object
 * @param {Object} track - Track object
 * @returns {Object} Track with fileSize property
 */
function withFileSize(track) {
  if (!track) return null;
  return {
    ...track,
    fileSize: getTrackFileSize(track),
  };
}

/**
 * Add fileSize to an array of tracks
 * @param {Array} tracks - Array of track objects
 * @returns {Array} Tracks with fileSize property
 */
function withFileSizes(tracks) {
  return tracks.map(withFileSize);
}

/**
 * Read all tracks from the JSON file
 * @returns {Array} Array of track objects
 */
function getAllTracks() {
  try {
    const data = fs.readFileSync(TRACKS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Save all tracks to the JSON file
 * @param {Array} tracks - Array of track objects
 */
function saveAllTracks(tracks) {
  fs.writeFileSync(TRACKS_FILE, JSON.stringify(tracks, null, 2));
}

/**
 * Find a track by ID
 * @param {string} id - The track ID
 * @returns {Object|null} Track object or null if not found
 */
function findById(id) {
  const tracks = getAllTracks();
  return tracks.find((track) => track.id === id) || null;
}

/**
 * Find multiple tracks by IDs
 * @param {Array<string>} ids - Array of track IDs
 * @returns {Array} Array of track objects (maintains order of ids)
 */
function findByIds(ids) {
  const tracks = getAllTracks();
  const trackMap = new Map(tracks.map((t) => [t.id, t]));
  return ids.map((id) => trackMap.get(id)).filter(Boolean);
}

/**
 * Get all tracks with pagination
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @param {string} options.search - Optional search query
 * @returns {Object} Paginated result with tracks and pagination info
 */
function getAll({ page = 1, limit = 20, search = '', sort = '' } = {}) {
  let tracks = getAllTracks();

  // Apply search filter if provided
  if (search) {
    const searchLower = search.toLowerCase();
    tracks = tracks.filter(
      (track) =>
        track.trackName.toLowerCase().includes(searchLower) ||
        track.artist.toLowerCase().includes(searchLower) ||
        (track.album && track.album.toLowerCase().includes(searchLower))
    );
  }

  // Sort by newest first when requested
  if (sort === 'newest') {
    tracks = [...tracks].sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  const total = tracks.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedTracks = tracks.slice(startIndex, endIndex);

  return {
    data: paginatedTracks,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

/**
 * Find a track by artist and track name (for deduplication)
 * @param {string} artist - Artist name
 * @param {string} trackName - Track name
 * @returns {Object|null} Track object or null if not found
 */
function findByArtistAndName(artist, trackName) {
  const tracks = getAllTracks();
  return (
    tracks.find(
      (track) =>
        track.artist.toLowerCase() === artist.toLowerCase() &&
        track.trackName.toLowerCase() === trackName.toLowerCase()
    ) || null
  );
}

/**
 * Add a new track (with duplicate detection)
 * @param {Object} track - Track object to add
 * @returns {Object} The added or existing track
 */
function addTrack(track) {
  const existing = findByArtistAndName(track.artist, track.trackName);
  if (existing) {
    return existing;
  }

  const tracks = getAllTracks();
  tracks.push(track);
  saveAllTracks(tracks);
  return track;
}

/**
 * Add multiple tracks (with duplicate detection)
 * @param {Array} newTracks - Array of track objects to add
 * @returns {Array} Array of added/existing tracks
 */
function addTracks(newTracks) {
  const tracks = getAllTracks();
  const results = [];

  for (const newTrack of newTracks) {
    const existing = tracks.find(
      (t) =>
        t.artist.toLowerCase() === newTrack.artist.toLowerCase() &&
        t.trackName.toLowerCase() === newTrack.trackName.toLowerCase()
    );

    if (existing) {
      results.push(existing);
    } else {
      tracks.push(newTrack);
      results.push(newTrack);
    }
  }

  saveAllTracks(tracks);
  return results;
}

module.exports = {
  getAllTracks,
  saveAllTracks,
  findById,
  findByIds,
  getAll,
  findByArtistAndName,
  addTrack,
  addTracks,
  getTrackFileSize,
  withFileSize,
  withFileSizes,
};
