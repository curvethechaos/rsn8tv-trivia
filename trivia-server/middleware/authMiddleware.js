// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');
const db = require('../db/connection');

class AuthMiddleware {
    // Verify JWT access token
    async verifyToken(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    error: 'No token provided'
                });
            }

            const token = authHeader.substring(7);
            const authService = require('../services/authService');
            
            // Verify token
            const decoded = jwt.verify(token, authService.JWT_SECRET, {
                issuer: 'rsn8tv-admin',
                audience: 'rsn8tv-admin-api'
            });

            // Check if user still exists and is active
            const user = await db('admin_users')
                .where('id', decoded.userId)
                .where('is_active', true)
                .first();

            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'User not found or inactive'
                });
            }

            // Add user info to request
            req.user = {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            };

            next();
        } catch (error) {
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Token expired',
                    code: 'TOKEN_EXPIRED'
                });
            }
            
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid token'
                });
            }

            return res.status(500).json({
                success: false,
                error: 'Authentication error'
            });
        }
    }

    // Check user role
    requireRole(...allowedRoles) {
        return (req, res, next) => {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            if (!allowedRoles.includes(req.user.role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Insufficient permissions'
                });
            }

            next();
        };
    }

    // Security headers
    securityHeaders(req, res, next) {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.removeHeader('X-Powered-By');
        next();
    }
}

module.exports = new AuthMiddleware();
