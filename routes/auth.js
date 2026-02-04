const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');

const config = require('../config');
const { findByUsername, findById, sanitizeUser } = require('../models/userStore');
const { addToBlocklist, isBlocklisted } = require('../models/tokenBlocklist');

const router = express.Router();

// Rate limiter for login endpoint
const loginLimiter = rateLimit({
  windowMs: config.rateLimit.login.windowMs,
  max: config.rateLimit.login.max,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Generate access and refresh tokens for a user
 */
function generateTokens(user) {
  const tokenId = uuidv4();

  const accessToken = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      type: 'access',
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );

  const refreshToken = jwt.sign(
    {
      sub: user.id,
      username: user.username,
      type: 'refresh',
      jti: tokenId, // Unique ID for blocklist tracking
    },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );

  return { accessToken, refreshToken, tokenId };
}

/**
 * POST /auth/login
 * Authenticate user and return tokens
 */
router.post(
  '/login',
  loginLimiter,
  [
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    try {
      // Validate input
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

      const { username, password } = req.body;

      // Find user
      const user = findByUsername(username);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.passwordHash);
      if (!isValidPassword) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_CREDENTIALS',
            message: 'Invalid username or password',
          },
        });
      }

      // Generate tokens
      const { accessToken, refreshToken } = generateTokens(user);

      res.json({
        success: true,
        data: {
          user: sanitizeUser(user),
          accessToken,
          refreshToken,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  }
);

/**
 * POST /auth/refresh
 * Exchange a valid refresh token for a new access token
 */
router.post(
  '/refresh',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  async (req, res) => {
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

      const { refreshToken } = req.body;

      // Verify refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      } catch (err) {
        let errorCode = 'REFRESH_TOKEN_INVALID';
        let message = 'Invalid refresh token';

        if (err.name === 'TokenExpiredError') {
          errorCode = 'REFRESH_TOKEN_EXPIRED';
          message = 'Refresh token has expired. Please login again.';
        }

        return res.status(401).json({
          success: false,
          error: {
            code: errorCode,
            message,
          },
        });
      }

      // Check if token type is correct
      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          success: false,
          error: {
            code: 'INVALID_TOKEN_TYPE',
            message: 'Invalid token type',
          },
        });
      }

      // Check if token is blocklisted
      if (isBlocklisted(decoded.jti)) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'REFRESH_TOKEN_REVOKED',
            message: 'Refresh token has been revoked. Please login again.',
          },
        });
      }

      // Verify user still exists
      const user = findById(decoded.sub);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User no longer exists',
          },
        });
      }

      // Generate new access token only
      const accessToken = jwt.sign(
        {
          sub: user.id,
          username: user.username,
          type: 'access',
        },
        config.jwt.accessSecret,
        { expiresIn: config.jwt.accessExpiresIn }
      );

      res.json({
        success: true,
        data: {
          accessToken,
        },
      });
    } catch (err) {
      console.error('Refresh error:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  }
);

/**
 * POST /auth/logout
 * Revoke the refresh token
 */
router.post(
  '/logout',
  [body('refreshToken').notEmpty().withMessage('Refresh token is required')],
  async (req, res) => {
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

      const { refreshToken } = req.body;

      // Verify and decode the refresh token
      let decoded;
      try {
        decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
      } catch (err) {
        // Even if token is invalid/expired, consider logout successful
        return res.json({
          success: true,
          data: {
            message: 'Logged out successfully',
          },
        });
      }

      // Add token to blocklist
      if (decoded.jti) {
        addToBlocklist(decoded.jti, decoded.exp * 1000); // Convert to milliseconds
      }

      res.json({
        success: true,
        data: {
          message: 'Logged out successfully',
        },
      });
    } catch (err) {
      console.error('Logout error:', err);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'An unexpected error occurred',
        },
      });
    }
  }
);

/**
 * GET /auth/me
 * Get current user info (requires authentication)
 */
const { authenticateToken } = require('../middleware/authMiddleware');

router.get('/me', authenticateToken, (req, res) => {
  const user = findById(req.user.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      error: {
        code: 'USER_NOT_FOUND',
        message: 'User not found',
      },
    });
  }

  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
    },
  });
});

module.exports = router;
