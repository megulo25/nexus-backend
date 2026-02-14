/**
 * Import Playlists Script
 *
 * Scans playlists/{username}/*.json and imports tracks and playlists
 * into data/tracks.json and data/playlists.json
 *
 * Expected structure:
 *   playlists/
 *     megulo25/
 *       Salsa.json
 *       Afro-Cuban.json
 *     another_user/
 *       Jazz.json
 *
 * Each JSON file should contain an array of track objects:
 *   [
 *     {
 *       "track_name": "Song Title",
 *       "artist": "Artist Name",
 *       "album": "Album Name",
 *       "release_date": "2024-01-01",
 *       "duration_ms": "180000",
 *       "url": "https://...",
 *       "local_path": "filename.m4a"  // relative to songs/ directory
 *     }
 *   ]
 *
 * Run with: yarn import:playlists
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const config = require('../config');
const { getAllUsers } = require('../models/userStore');
const {
  getAllTracks,
  saveAllTracks,
  findByArtistAndName,
} = require('../models/trackStore');
const {
  getAllPlaylists,
  saveAllPlaylists,
  findByUserIdAndName,
} = require('../models/playlistStore');

const PLAYLISTS_DIR = config.paths.playlists;

/**
 * Normalize a track from the source JSON format to our internal format
 */
function normalizeTrack(sourceTrack) {
  // Extract just the filename from local_path
  const filePath = sourceTrack.local_path
    ? path.basename(sourceTrack.local_path).normalize('NFC')
    : null;

  // Extract thumbnail filename from thumbnail_path, or derive from URL
  let thumbnailPath = null;
  if (sourceTrack.thumbnail_path) {
    thumbnailPath = path.basename(sourceTrack.thumbnail_path).normalize('NFC');
  } else if (sourceTrack.url) {
    // Derive from YouTube URL: extract video ID
    try {
      const parsed = new URL(sourceTrack.url);
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        thumbnailPath = `${videoId}.jpg`;
      }
    } catch {
      // Invalid URL, leave thumbnailPath null
    }
  }

  return {
    id: uuidv4(),
    trackName: sourceTrack.track_name,
    artist: sourceTrack.artist,
    album: sourceTrack.album || null,
    releaseDate: sourceTrack.release_date || null,
    durationMs: parseInt(sourceTrack.duration_ms, 10) || null,
    sourceUrl: sourceTrack.url || null,
    filePath,
    thumbnailPath,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Import playlists for all users
 */
async function importPlaylists() {
  console.log('🎵 Starting playlist import...\n');

  // Check if playlists directory exists
  if (!fs.existsSync(PLAYLISTS_DIR)) {
    console.log(`❌ Playlists directory not found: ${PLAYLISTS_DIR}`);
    console.log('   Create the directory and add playlist JSON files.');
    process.exit(1);
  }

  // Get all users
  const users = getAllUsers();
  if (users.length === 0) {
    console.log('❌ No users found. Run seed:users first.');
    process.exit(1);
  }

  const userMap = new Map(users.map((u) => [u.username, u]));
  console.log(`👥 Found ${users.length} users: ${users.map((u) => u.username).join(', ')}\n`);

  // Load existing data
  let tracks = getAllTracks();
  let playlists = getAllPlaylists();

  // Create a map for quick track lookup by artist+name
  const trackLookup = new Map();
  for (const track of tracks) {
    const key = `${track.artist.toLowerCase()}|${track.trackName.toLowerCase()}`;
    trackLookup.set(key, track);
  }

  let totalNewTracks = 0;
  let totalDuplicateTracks = 0;
  let totalNewPlaylists = 0;
  let totalUpdatedPlaylists = 0;

  // Scan user directories
  const userDirs = fs.readdirSync(PLAYLISTS_DIR, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  for (const username of userDirs) {
    const user = userMap.get(username);
    if (!user) {
      console.log(`⚠️  Skipping directory "${username}" - no matching user found`);
      continue;
    }

    console.log(`📁 Processing playlists for user: ${username}`);

    const userPlaylistDir = path.join(PLAYLISTS_DIR, username);
    const playlistFiles = fs.readdirSync(userPlaylistDir)
      .filter((f) => f.endsWith('.json'));

    for (const playlistFile of playlistFiles) {
      const playlistName = path.basename(playlistFile, '.json');
      const playlistPath = path.join(userPlaylistDir, playlistFile);

      console.log(`   📋 Importing: ${playlistName}`);

      // Read playlist JSON
      let sourceTracks;
      try {
        const content = fs.readFileSync(playlistPath, 'utf8');
        sourceTracks = JSON.parse(content);
      } catch (err) {
        console.log(`   ❌ Error reading ${playlistFile}: ${err.message}`);
        continue;
      }

      if (!Array.isArray(sourceTracks)) {
        console.log(`   ❌ ${playlistFile} is not an array`);
        continue;
      }

      // Process tracks and collect their IDs
      const playlistTrackIds = [];

      for (const sourceTrack of sourceTracks) {
        if (!sourceTrack.track_name || !sourceTrack.artist) {
          console.log(`   ⚠️  Skipping track with missing name/artist`);
          continue;
        }

        const key = `${sourceTrack.artist.toLowerCase()}|${sourceTrack.track_name.toLowerCase()}`;
        let track = trackLookup.get(key);

        if (track) {
          // Track already exists
          totalDuplicateTracks++;
        } else {
          // New track
          track = normalizeTrack(sourceTrack);
          tracks.push(track);
          trackLookup.set(key, track);
          totalNewTracks++;
        }

        // Add to playlist (avoid duplicates within playlist)
        if (!playlistTrackIds.includes(track.id)) {
          playlistTrackIds.push(track.id);
        }
      }

      // Check if playlist already exists
      const existingPlaylist = findByUserIdAndName(user.id, playlistName);

      if (existingPlaylist) {
        // Merge track IDs (add new ones, keep order)
        const existingIds = new Set(existingPlaylist.trackIds);
        let added = 0;
        for (const trackId of playlistTrackIds) {
          if (!existingIds.has(trackId)) {
            existingPlaylist.trackIds.push(trackId);
            added++;
          }
        }
        existingPlaylist.updatedAt = new Date().toISOString();

        // Update in playlists array
        const idx = playlists.findIndex((p) => p.id === existingPlaylist.id);
        if (idx !== -1) {
          playlists[idx] = existingPlaylist;
        }

        console.log(`      ✅ Updated playlist (added ${added} new tracks)`);
        totalUpdatedPlaylists++;
      } else {
        // Create new playlist
        const newPlaylist = {
          id: uuidv4(),
          userId: user.id,
          name: playlistName,
          trackIds: playlistTrackIds,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        playlists.push(newPlaylist);

        console.log(`      ✅ Created playlist with ${playlistTrackIds.length} tracks`);
        totalNewPlaylists++;
      }
    }

    console.log('');
  }

  // Save updated data
  saveAllTracks(tracks);
  saveAllPlaylists(playlists);

  console.log('========================================');
  console.log('📊 Import Summary:');
  console.log(`   Tracks: ${totalNewTracks} new, ${totalDuplicateTracks} duplicates skipped`);
  console.log(`   Playlists: ${totalNewPlaylists} new, ${totalUpdatedPlaylists} updated`);
  console.log(`   Total tracks in database: ${tracks.length}`);
  console.log(`   Total playlists in database: ${playlists.length}`);
  console.log('========================================');
  console.log('\n✅ Import complete!');
}

importPlaylists().catch((err) => {
  console.error('❌ Import failed:', err);
  process.exit(1);
});
