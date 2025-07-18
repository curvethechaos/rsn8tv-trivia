// routes/authRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../db/connection');
const authService = require('../services/authService');
const authMiddleware = require('../middleware/authMiddleware');
const bcrypt = require('bcrypt');
const Joi = require('joi');

// Validation schemas
const schemas = {
  login: Joi.object({
    username: Joi.string().required().min(3).max(50),
    password: Joi.string().required()
  }),
  createUser: Joi.object({
    username: Joi.string().required().min(3).max(50).alphanum(),
    email: Joi.string().required().email(),
    password: Joi.string().required().min(8)
  })
};

// Apply security headers to all routes
router.use(authMiddleware.securityHeaders);

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { error } = schemas.login.validate(req.body);
    if (error) {
      return res.status(400).json({ success: false, error: error.details[0].message });
    }

    const { username, password } = req.body;
    // Find user
    const user = await db('admin_users')
      .where(function() {
        this.where('username', username).orWhere('email', username);
      })
      .first();

    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Generate and store tokens
    const { accessToken, refreshToken } = authService.generateTokens(user.id, user.role);
    await authService.storeRefreshToken(user.id, refreshToken, req.ip);

    return res.json({
      success: true,
      data: {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Token refresh endpoint
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ success: false, error: 'Missing refresh token' });
  }
  try {
    // Verify refresh JWT
    const payload = jwt.verify(refreshToken, authService.REFRESH_SECRET, { issuer: 'rsn8tv-admin' });
    if (payload.type !== 'refresh') throw new Error('Invalid token type');

    // Check stored token
    const hashed = authService.hashToken(refreshToken);
    const stored = await db('admin_refresh_tokens')
      .where({ token_hash: hashed })
      .andWhere('expires_at', '>', new Date())
      .first();
    if (!stored) throw new Error('Token revoked or expired');

    // Issue new tokens
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      authService.generateTokens(payload.userId, payload.role);
    await authService.storeRefreshToken(payload.userId, newRefreshToken, req.ip);

    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken
      }
    });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(401).json({ success: false, error: 'Refresh failed' });
  }
});

// Protected routes require valid access token
router.use(authMiddleware.verifyToken);

// Get current user info
router.get('/me', (req, res) => {
  return res.json({ success: true, data: { user: req.user } });
});

// Admin-only route to create new user
router.post('/create-user',
  authMiddleware.requireRole('super_admin'),
  async (req, res) => {
    try {
      const { error } = schemas.createUser.validate(req.body);
      if (error) {
        return res.status(400).json({ success: false, error: error.details[0].message });
      }
      const { username, email, password } = req.body;
      const user = await authService.createAdminUser(username, email, password);
      return res.json({ success: true, data: { user } });
    } catch (error) {
      console.error('User creation error:', error);
      return res.status(500).json({ success: false, error: 'Failed to create user' });
    }
  }
);

module.exports = router;
