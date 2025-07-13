// routes/authRoutes.js
const express = require('express');
const router = express.Router();
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
            return res.status(400).json({
                success: false,
                error: error.details[0].message
            });
        }

        const { username, password } = req.body;
        const db = require('../db/connection');

        // Find user
        const user = await db('admin_users')
            .where(function() {
                this.where('username', username).orWhere('email', username);
            })
            .first();

        if (!user) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Check if account is active
        if (!user.is_active) {
            return res.status(401).json({
                success: false,
                error: 'Account is deactivated'
            });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // Generate tokens
        const { accessToken, refreshToken } = authService.generateTokens(user.id, user.role);
        
        // Store refresh token
        await authService.storeRefreshToken(user.id, refreshToken, req.ip);

        res.json({
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
        res.status(500).json({
            success: false,
            error: 'Authentication failed'
        });
    }
});

// Protected routes below this point
router.use(authMiddleware.verifyToken);

// Get current user info
router.get('/me', async (req, res) => {
    res.json({
        success: true,
        data: { user: req.user }
    });
});

// Admin only - create new user
router.post('/create-user', 
    authMiddleware.requireRole('super_admin'),
    async (req, res) => {
        try {
            const { error } = schemas.createUser.validate(req.body);
            if (error) {
                return res.status(400).json({
                    success: false,
                    error: error.details[0].message
                });
            }

            const { username, email, password } = req.body;
            const user = await authService.createAdminUser(username, email, password);
            
            res.json({
                success: true,
                data: { user }
            });
        } catch (error) {
            console.error('User creation error:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create user'
            });
        }
    }
);

module.exports = router;
