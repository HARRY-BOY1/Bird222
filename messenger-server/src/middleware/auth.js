const jwt = require('jsonwebtoken');

function readToken(header = '') {
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
}

function requireAuth(req, res, next) {
  try {
    const token = readToken(req.get('authorization'));
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    const payload = verifyToken(token);
    req.user = { id: Number(payload.sub), username: payload.username };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth, readToken, verifyToken };
