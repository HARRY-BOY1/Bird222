require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const filesRoutes = require('./routes/files');
const { initializeSocket } = require('./socket');
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
  .split(',').map((origin) => origin.trim()).filter(Boolean);
const corsOptions = { origin: corsOrigins.includes('*') ? '*' : corsOrigins, methods: ['GET', 'POST', 'PATCH', 'PUT', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization'] };

function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '16kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', authRoutes);
  app.use('/api', apiRoutes);
  app.use('/files', filesRoutes);
  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}

function createServer() {
  const app = createApp();
  const server = require('node:http').createServer(app);
  const io = initializeSocket(server, corsOptions.origin);
  return { app, server, io };
}

module.exports = { createApp, createServer };
