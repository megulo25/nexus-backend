require('dotenv').config();
const path = require('path');

module.exports = {
  port: process.env.PORT || 3000,

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.ACCESS_TOKEN_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '365d',
  },

  rateLimit: {
    login: {
      windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX, 10) || 5, // 5 attempts per window
    },
  },

  paths: {
    songs: path.resolve(process.env.SONGS_PATH || './songs'),
    playlists: path.resolve(process.env.PLAYLISTS_PATH || './playlists'),
    thumbnails: path.resolve(process.env.THUMBNAILS_PATH || './thumbnails'),
  },
};
