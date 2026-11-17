require('dotenv').config();

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET is required and must be at least 32 characters. Copy .env.example to .env and set it.');
  process.exit(1);
}

const { createServer } = require('./app');
const { server } = createServer();
const port = Number(process.env.PORT) || 3001;

server.listen(port, '0.0.0.0', () => console.log(`Messaging server listening on 0.0.0.0:${port}`));

function shutdown() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
