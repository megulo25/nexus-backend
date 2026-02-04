const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config');
const authRoutes = require('./routes/auth');
const { authenticateToken } = require('./middleware/authMiddleware');
const { cleanupExpiredEntries } = require('./models/tokenBlocklist');

const app = express();

// ===========================================
// Security Middleware
// ===========================================

// Helmet adds various HTTP headers for security
app.use(helmet());

// CORS configuration for mobile apps
// Mobile apps don't need CORS, but this is useful if you add a web admin later
app.use(cors({
  origin: '*', // Allow all origins for mobile apps
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ===========================================
// Body Parsing Middleware
// ===========================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===========================================
// Routes
// ===========================================

// Health check endpoint (public)
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
    },
  });
});

// Auth routes (public)
app.use('/auth', authRoutes);

// Protected route example
app.get('/protected', authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      message: 'You have access to protected content!',
      user: req.user,
    },
  });
});

// ===========================================
// 404 Handler
// ===========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// ===========================================
// Global Error Handler
// ===========================================

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    },
  });
});

// ===========================================
// Start Server
// ===========================================

const port = config.port;

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Cleanup expired blocklist entries on startup and every hour
  cleanupExpiredEntries();
  setInterval(cleanupExpiredEntries, 60 * 60 * 1000);
});
