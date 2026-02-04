const jwt = require('jsonwebtoken');
const config = require('../config');

// Error codes for mobile clients to handle
const ErrorCodes = {
  TOKEN_MISSING: 'TOKEN_MISSING',
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_MALFORMED: 'TOKEN_MALFORMED',
};

/**
 * Middleware to authenticate requests using JWT access tokens
 * Expects: Authorization: Bearer <token>
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      success: false,
      error: {
        code: ErrorCodes.TOKEN_MISSING,
        message: 'Access token is required',
      },
    });
  }

  jwt.verify(token, config.jwt.accessSecret, (err, decoded) => {
    if (err) {
      // Determine specific error type for mobile clients
      let errorCode = ErrorCodes.TOKEN_INVALID;
      let message = 'Invalid access token';
      let statusCode = 401;

      if (err.name === 'TokenExpiredError') {
        errorCode = ErrorCodes.TOKEN_EXPIRED;
        message = 'Access token has expired';
      } else if (err.name === 'JsonWebTokenError') {
        if (err.message === 'jwt malformed') {
          errorCode = ErrorCodes.TOKEN_MALFORMED;
          message = 'Access token is malformed';
        }
      }

      return res.status(statusCode).json({
        success: false,
        error: {
          code: errorCode,
          message,
        },
      });
    }

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      username: decoded.username,
    };

    next();
  });
}

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for routes that behave differently for authenticated users
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, config.jwt.accessSecret, (err, decoded) => {
    if (err) {
      req.user = null;
    } else {
      req.user = {
        id: decoded.sub,
        username: decoded.username,
      };
    }
    next();
  });
}

module.exports = {
  authenticateToken,
  optionalAuth,
  ErrorCodes,
};
