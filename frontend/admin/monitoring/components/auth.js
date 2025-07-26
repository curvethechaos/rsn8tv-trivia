// components/auth.js - Fixed authentication management

class AuthManager {
    constructor() {
        this.token = localStorage.getItem('token');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.user = null;
        this.isChecking = false; // Prevent multiple simultaneous checks
    }

    async checkAuth() {
        // Prevent recursive checks
        if (this.isChecking) {
            return { authenticated: false };
        }

        this.isChecking = true;

        try {
            if (!this.token) {
                console.log('No token found');
                this.isChecking = false;
                return { authenticated: false };
            }

            console.log('Checking auth with token...');
            
            const response = await fetch('/api/auth/me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Auth check response:', response.status);

            if (response.ok) {
                const userData = await response.json();
                this.user = userData;
                this.isChecking = false;
                return { authenticated: true, user: userData };
            }

            // If 401, try to refresh token ONCE
            if (response.status === 401 && this.refreshToken && !this.hasTriedRefresh) {
                console.log('Token expired, attempting refresh...');
                this.hasTriedRefresh = true;
                const refreshed = await this.refreshAuthToken();
                if (refreshed) {
                    this.isChecking = false;
                    // DON'T recursively call checkAuth, just return success
                    return { authenticated: true, user: this.user };
                }
            }

            // Auth failed
            console.log('Auth check failed');
            this.clearAuth();
            this.isChecking = false;
            return { authenticated: false };

        } catch (error) {
            console.error('Auth check error:', error);
            this.isChecking = false;
            return { authenticated: false };
        }
    }

    async refreshAuthToken() {
        if (!this.refreshToken) {
            return false;
        }

        try {
            console.log('Attempting token refresh...');
            
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                localStorage.setItem('token', data.token);
                
                if (data.refreshToken) {
                    this.refreshToken = data.refreshToken;
                    localStorage.setItem('refreshToken', data.refreshToken);
                }
                
                // Get user data with new token
                if (data.user) {
                    this.user = data.user;
                }
                
                console.log('Token refresh successful');
                return true;
            }

            console.log('Token refresh failed:', response.status);
            return false;

        } catch (error) {
            console.error('Token refresh error:', error);
            return false;
        }
    }

    getToken() {
        return this.token;
    }

    getUser() {
        return this.user;
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            this.clearAuth();
            // Use replace to prevent back button issues
            window.location.replace('/admin/login.html');
        }
    }

    clearAuth() {
        this.token = null;
        this.refreshToken = null;
        this.user = null;
        this.hasTriedRefresh = false;
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('username');
    }

    // Add auth headers to fetch options
    addAuthHeaders(options = {}) {
        if (!this.token) {
            throw new Error('No authentication token available');
        }

        return {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${this.token}`
            }
        };
    }
}

// Create global auth instance
window.auth = new AuthManager();
