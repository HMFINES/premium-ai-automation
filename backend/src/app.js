const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { testConnection } = require('./db');
const authRoutes = require('./routes/auth');
const supportRoutes = require('./routes/support');

const app = express();
const frontendDir = path.resolve(__dirname, '../..');
const allowedOrigins = config.http.allowedOrigins;

function resolveCorsOrigin(origin, callback) {
  if (allowedOrigins.length === 0) {
    callback(null, true);
    return;
  }

  // Allow non-browser requests (curl, health checks, server-to-server).
  if (!origin) {
    callback(null, true);
    return;
  }

  if (allowedOrigins.includes(origin)) {
    callback(null, true);
    return;
  }

  callback(new Error(`CORS origin not allowed: ${origin}`));
}

app.disable('x-powered-by');

app.use(
  cors({
    origin: resolveCorsOrigin,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.get('/api/health', async (_req, res) => {
  try {
    await testConnection();
    res.json({
      success: true,
      data: {
        status: 'ok',
        db: 'connected',
        mode: 'mysql'
      },
      error: null
    });
  } catch (error) {
    res.json({
      success: true,
      data: {
        status: 'degraded',
        db: 'disconnected',
        mode: 'file_fallback',
        details: error.message
      }
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/support', supportRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    data: null,
    error: {
      message: `Route not found: ${req.method} ${req.originalUrl}`,
      details: null
    }
  });
});

app.use(
  express.static(frontendDir, {
    extensions: ['html'],
    maxAge: config.isProduction ? '7d' : 0,
    etag: true,
    lastModified: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    }
  })
);

app.get('/login', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'login.html'));
});

app.get('/signup', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'signup.html'));
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.use((err, _req, res, _next) => {
  if (err.message && err.message.startsWith('CORS origin not allowed:')) {
    return res.status(403).json({
      success: false,
      data: null,
      error: {
        message: 'CORS origin denied',
        details: err.message
      }
    });
  }

  res.status(500).json({
    success: false,
    data: null,
    error: {
      message: 'Internal server error',
      details: err.message
    }
  });
});

module.exports = app;
