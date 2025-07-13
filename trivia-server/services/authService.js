// services/authService.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const db = require('../db/connection');

// Security constants
const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 30 * 60 * 1000; // 30 minutes
const TOKEN_ROTATION_ENABLED = true;

class AuthService {
    constructor() {
        this.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
        this.REFRESH_SECRET = process.env.REFRESH_SECRET || crypto.randomBytes(64).toString('hex');
    }

    // Generate secure tokens
    generateTokens(userId, role) {
        const payload = { userId, role, type: 'access' };
        const accessToken = jwt.sign(payload, this.JWT_SECRET, { 
            expiresIn: ACCESS_TOKEN_EXPIRY,
            issuer: 'rsn8tv-admin',
            audience: 'rsn8tv-admin-api'
        });

        const refreshPayload = { userId, type: 'refresh' };
        const refreshToken = jwt.sign(refreshPayload, this.REFRESH_SECRET, { 
            expiresIn: REFRESH_TOKEN_EXPIRY,
            issuer: 'rsn8tv-admin'
        });

        return { accessToken, refreshToken };
    }

    // Hash refresh token for secure storage
    hashToken(token) {
        return crypto.createHash('sha256').update(token).digest('hex');
    }

    // Store refresh token securely
    async storeRefreshToken(userId, refreshToken, ipAddress) {
        const hashedToken = this.hashToken(refreshToken);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        await db('admin_refresh_tokens').insert({
            admin_user_id: userId,
            token_hash: hashedToken,
            expires_at: expiresAt,
            created_ip: ipAddress
        });
    }

    // Create initial admin user
    async createAdminUser(username, email, password) {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        const [user] = await db('admin_users')
            .insert({
                username,
                email,
                password_hash: hashedPassword,
                role: 'super_admin'
            })
            .returning(['id', 'username', 'email', 'role']);

        return user;
    }

    // More methods will be added here...
}

module.exports = new AuthService();
