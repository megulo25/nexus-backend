const fs = require('fs');
const path = require('path');

const PLAYLISTS_FILE = path.join(__dirname, '..', 'data', 'playlists.json');

/**
 * Read all playlists from the JSON file
 * @returns {Array} Array of playlist objects
 */
function getAllPlaylists() {
  try {
    const data = fs.readFileSync(PLAYLISTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

/**
 * Save all playlists to the JSON file
 * @param {Array} playlists - Array of playlist objects
 */
function saveAllPlaylists(playlists) {
  fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
}

/**
 * Find a playlist by ID
 * @param {string} id - The playlist ID
 * @returns {Object|null} Playlist object or null if not found
 */
function findById(id) {
  const playlists = getAllPlaylists();
  return playlists.find((playlist) => playlist.id === id) || null;
}

/**
 * Get all playlists for a user with pagination
 * @param {string} userId - The user ID
 * @param {Object} options - Pagination options
 * @param {number} options.page - Page number (1-indexed)
 * @param {number} options.limit - Items per page
 * @returns {Object} Paginated result with playlists and pagination info
 */
function getByUserId(userId, { page = 1, limit = 20 } = {}) {
  const playlists = getAllPlaylists().filter((p) => p.userId === userId);

  const total = playlists.length;
  const totalPages = Math.ceil(total / limit);
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedPlaylists = playlists.slice(startIndex, endIndex);

  return {
    data: paginatedPlaylists,
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
 * Find a playlist by user ID and name (for deduplication)
 * @param {string} userId - User ID
 * @param {string} name - Playlist name
 * @returns {Object|null} Playlist object or null if not found
 */
function findByUserIdAndName(userId, name) {
  const playlists = getAllPlaylists();
  return (
    playlists.find(
      (p) => p.userId === userId && p.name.toLowerCase() === name.toLowerCase()
    ) || null
  );
}

/**
 * Create a new playlist
 * @param {Object} playlist - Playlist object to create
 * @returns {Object} The created playlist
 */
function create(playlist) {
  const playlists = getAllPlaylists();
  const newPlaylist = {
    ...playlist,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  playlists.push(newPlaylist);
  saveAllPlaylists(playlists);
  return newPlaylist;
}

/**
 * Update a playlist
 * @param {string} id - Playlist ID
 * @param {string} userId - User ID (for ownership check)
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated playlist or null if not found/not owned
 */
function update(id, userId, updates) {
  const playlists = getAllPlaylists();
  const index = playlists.findIndex((p) => p.id === id && p.userId === userId);

  if (index === -1) {
    return null;
  }

  // Only allow updating specific fields
  const allowedUpdates = ['name', 'trackIds'];
  const filteredUpdates = {};
  for (const key of allowedUpdates) {
    if (updates[key] !== undefined) {
      filteredUpdates[key] = updates[key];
    }
  }

  playlists[index] = {
    ...playlists[index],
    ...filteredUpdates,
    updatedAt: new Date().toISOString(),
  };

  saveAllPlaylists(playlists);
  return playlists[index];
}

/**
 * Delete a playlist
 * @param {string} id - Playlist ID
 * @param {string} userId - User ID (for ownership check)
 * @returns {boolean} True if deleted, false if not found/not owned
 */
function remove(id, userId) {
  const playlists = getAllPlaylists();
  const index = playlists.findIndex((p) => p.id === id && p.userId === userId);

  if (index === -1) {
    return false;
  }

  playlists.splice(index, 1);
  saveAllPlaylists(playlists);
  return true;
}

/**
 * Add a track to a playlist
 * @param {string} playlistId - Playlist ID
 * @param {string} userId - User ID (for ownership check)
 * @param {string} trackId - Track ID to add
 * @returns {Object|null} Updated playlist or null if not found/not owned
 */
function addTrack(playlistId, userId, trackId) {
  const playlists = getAllPlaylists();
  const index = playlists.findIndex(
    (p) => p.id === playlistId && p.userId === userId
  );

  if (index === -1) {
    return null;
  }

  // Avoid duplicates
  if (!playlists[index].trackIds.includes(trackId)) {
    playlists[index].trackIds.push(trackId);
    playlists[index].updatedAt = new Date().toISOString();
    saveAllPlaylists(playlists);
  }

  return playlists[index];
}

/**
 * Add multiple tracks to a playlist
 * @param {string} playlistId - Playlist ID
 * @param {string} userId - User ID (for ownership check)
 * @param {Array<string>} trackIds - Track IDs to add
 * @returns {Object|null} Updated playlist or null if not found/not owned
 */
function addTracks(playlistId, userId, trackIds) {
  const playlists = getAllPlaylists();
  const index = playlists.findIndex(
    (p) => p.id === playlistId && p.userId === userId
  );

  if (index === -1) {
    return null;
  }

  // Add only new tracks
  for (const trackId of trackIds) {
    if (!playlists[index].trackIds.includes(trackId)) {
      playlists[index].trackIds.push(trackId);
    }
  }

  playlists[index].updatedAt = new Date().toISOString();
  saveAllPlaylists(playlists);
  return playlists[index];
}

/**
 * Remove a track from a playlist
 * @param {string} playlistId - Playlist ID
 * @param {string} userId - User ID (for ownership check)
 * @param {string} trackId - Track ID to remove
 * @returns {Object|null} Updated playlist or null if not found/not owned
 */
function removeTrack(playlistId, userId, trackId) {
  const playlists = getAllPlaylists();
  const index = playlists.findIndex(
    (p) => p.id === playlistId && p.userId === userId
  );

  if (index === -1) {
    return null;
  }

  playlists[index].trackIds = playlists[index].trackIds.filter(
    (id) => id !== trackId
  );
  playlists[index].updatedAt = new Date().toISOString();
  saveAllPlaylists(playlists);
  return playlists[index];
}

/**
 * Check if user owns a playlist
 * @param {string} playlistId - Playlist ID
 * @param {string} userId - User ID
 * @returns {boolean} True if user owns the playlist
 */
function isOwner(playlistId, userId) {
  const playlist = findById(playlistId);
  return playlist && playlist.userId === userId;
}

module.exports = {
  getAllPlaylists,
  saveAllPlaylists,
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
};
