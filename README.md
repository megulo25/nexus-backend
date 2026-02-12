# Nexus Music Player - Backend API

A Node.js/Express REST API for streaming music from a personal music library. Features JWT authentication, playlist management, and audio streaming with HTTP Range support.

## Features

### 🔐 Authentication
- JWT-based authentication with access and refresh tokens
- Access tokens expire in 15 minutes, refresh tokens in 365 days
- Token blocklist for logout/revocation
- Rate limiting on login endpoint (5 attempts per 15 minutes)
- Bcrypt password hashing

### 🎵 Audio Streaming
- Stream audio files with HTTP Range support (seeking)
- Download tracks as attachments
- Supports multiple audio formats (m4a, mp3, etc.)
- Authenticated streaming with Bearer token

### 📋 Playlist Management
- User-specific playlists with track ordering
- Add/remove tracks from playlists
- Search tracks within playlists
- Download entire playlists as ZIP archives
- Unique playlist names per user (case-insensitive)

### 🔍 Search
- Search tracks by name, artist, or album
- Paginated results with configurable limits

## Tech Stack

| Category         | Technology                       |
| ---------------- | -------------------------------- |
| Runtime          | Node.js                          |
| Framework        | Express 5                        |
| Authentication   | JWT (jsonwebtoken)               |
| Password Hashing | bcrypt                           |
| Security         | helmet, cors, express-rate-limit |
| Validation       | express-validator                |
| Audio Metadata   | music-metadata                   |
| Archiving        | archiver                         |

## Project Structure

```
backend/
├── app.js                    # Express app entry point
├── config/
│   └── index.js              # Configuration from environment
├── middleware/
│   └── authMiddleware.js     # JWT authentication middleware
├── models/
│   ├── userStore.js          # User data operations
│   ├── trackStore.js         # Track metadata operations
│   ├── playlistStore.js      # Playlist data operations
│   └── tokenBlocklist.js     # Revoked token management
├── routes/
│   ├── auth.js               # Authentication endpoints
│   ├── tracks.js             # Track streaming endpoints
│   └── playlists.js          # Playlist management endpoints
├── scripts/
│   ├── seedUsers.js          # Create initial users
│   └── importPlaylists.js    # Import playlists from JSON
├── utils/
│   └── pagination.js         # Pagination helper
├── data/                     # JSON data storage
│   ├── users.json
│   ├── tracks.json
│   ├── playlists.json
│   └── tokenBlocklist.json
├── playlists/                # Playlist JSON files by user
│   └── {username}/
│       └── {PlaylistName}.json
└── songs/                    # Audio files directory
```

## API Endpoints

### Health Check
| Method | Endpoint  | Auth | Description  |
| ------ | --------- | ---- | ------------ |
| GET    | `/health` | ❌    | Health check |

### Authentication (`/auth`)
| Method | Endpoint        | Auth | Description            |
| ------ | --------------- | ---- | ---------------------- |
| POST   | `/auth/login`   | ❌    | Login with credentials |
| POST   | `/auth/refresh` | ❌    | Refresh access token   |
| POST   | `/auth/logout`  | ❌    | Revoke refresh token   |
| GET    | `/auth/me`      | ✅    | Get current user info  |

### Tracks (`/tracks`) - Protected
| Method | Endpoint               | Description                   |
| ------ | ---------------------- | ----------------------------- |
| GET    | `/tracks`              | List all tracks (paginated)   |
| GET    | `/tracks/:id`          | Get track metadata            |
| GET    | `/tracks/:id/stream`   | Stream audio (supports Range) |
| GET    | `/tracks/:id/download` | Download audio file           |

### Playlists (`/playlists`) - Protected
| Method | Endpoint                         | Description              |
| ------ | -------------------------------- | ------------------------ |
| GET    | `/playlists`                     | List user's playlists    |
| GET    | `/playlists/:id`                 | Get playlist with tracks |
| POST   | `/playlists`                     | Create playlist          |
| PUT    | `/playlists/:id`                 | Update playlist          |
| DELETE | `/playlists/:id`                 | Delete playlist          |
| POST   | `/playlists/:id/tracks`          | Add track(s) to playlist |
| DELETE | `/playlists/:id/tracks/:trackId` | Remove track             |
| GET    | `/playlists/:id/download`        | Download as ZIP          |

## Getting Started

### Prerequisites
- Node.js 18+
- Yarn (or npm)

### Installation

```bash
# Install dependencies
yarn install

# Copy environment template
cp .env.example .env

# Generate JWT secrets
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Add the generated secrets to .env
```

### Configuration

Edit `.env` with your settings:

```env
# Server
PORT=3000

# JWT Secrets (required - generate unique values)
JWT_ACCESS_SECRET=your_access_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Token Expiration
ACCESS_TOKEN_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=365d

# Rate Limiting
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=5

# Paths (optional - defaults shown)
SONGS_PATH=./songs
PLAYLISTS_PATH=./playlists
```

### Seed Data

```bash
# Create initial user
yarn seed:users

# Import playlists from JSON files
yarn import:playlists
```

### Running

```bash
# Development (with auto-reload)
yarn dev

# Production
yarn start
```

## API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [...]
  }
}
```

## Authentication Flow

1. **Login**: `POST /auth/login` → Returns `accessToken` + `refreshToken`
2. **API Requests**: Include `Authorization: Bearer <accessToken>` header
3. **Token Refresh**: When access token expires, call `POST /auth/refresh`
4. **Logout**: `POST /auth/logout` → Revokes refresh token

## Audio Streaming

The `/tracks/:id/stream` endpoint supports HTTP Range requests for seeking:

```bash
# Full file
curl -H "Authorization: Bearer <token>" http://localhost:3000/tracks/{id}/stream

# Partial content (seeking)
curl -H "Authorization: Bearer <token>" -H "Range: bytes=0-1024" http://localhost:3000/tracks/{id}/stream
```

## Data Storage

The backend uses JSON files for data storage (no database required):

- `data/users.json` - User accounts with hashed passwords
- `data/tracks.json` - Track metadata (populated from audio files)
- `data/playlists.json` - Playlist definitions with track IDs
- `data/tokenBlocklist.json` - Revoked refresh tokens

Audio files are stored in the `songs/` directory (configurable via `SONGS_PATH`).

## Scripts

### `yarn seed:users`
Creates initial user accounts. Edit `scripts/seedUsers.js` to configure users.

### `yarn import:playlists`
Imports playlists from JSON files in the `playlists/{username}/` directory. Each JSON file should contain an array of track objects with metadata.

#### Importing from the Search Module

The easiest way to import playlists from Spotify is the unified migration script at the project root:

```bash
# From the project root
./migrate.sh
```

Place your Spotify CSV exports in `search/spotify_playlists/{username}/` (the directory name must match a backend username), then run the script. It processes all CSVs in the directory as playlists for that user — handling YouTube download, duration updates, file copying, and backend import in one step. See the [search module README](../search/README.md) for details.

<details>
<summary>Manual import (advanced)</summary>

```bash
# 1. Copy the playlist JSON to the user's playlist directory
cp ../search/playlists/My_Playlist.json playlists/{username}/My_Playlist.json

# 2. Copy audio files (no-clobber to preserve existing)
cp -n ../search/songs/*.m4a songs/

# 3. Run the import
yarn import:playlists
```
</details>

The import script automatically:
- Transforms `snake_case` fields to `camelCase` (`track_name` → `trackName`, etc.)
- Parses `duration_ms` from string to integer
- Extracts filename from `local_path` for the `filePath` field
- Generates UUID `id` and `createdAt` timestamp for new tracks
- Deduplicates by artist + track name (case-insensitive)
- Creates a new playlist (or merges into existing) named after the JSON file

#### Expected Source JSON Format

```json
[
  {
    "track_name": "Song Title",
    "artist": "Artist Name",
    "album": "Album Name",
    "release_date": "2024-01-15",
    "duration_ms": "234567",
    "url": "https://www.youtube.com/watch?v=abc123",
    "local_path": "songs/Artist_Name-Song_Title.m4a"
  }
]
```

## Security Features

- **Helmet**: Sets secure HTTP headers
- **CORS**: Configured for mobile app access
- **Rate Limiting**: Protects login endpoint from brute force
- **JWT Tokens**: Short-lived access tokens, long-lived refresh tokens
- **Token Blocklist**: Revoked tokens are tracked and rejected
- **Bcrypt**: Secure password hashing

## License

Private project - All rights reserved
