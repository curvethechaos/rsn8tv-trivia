// RSN8TV Admin Authentication Manager
// This file handles all authentication for the admin dashboard
(function() {
  'use strict';

  class AuthManager {
    constructor() {
      this.tokenKey = 'rsn8tv_admin_token';
      this.refreshTokenKey = 'rsn8tv_admin_refresh';
      this.userKey = 'rsn8tv_admin_user';
      this.tokenExpiryWarningShown = false;
      this.refreshTimer = null;
      this.baseURL = window.location.origin;
    }

    // Store tokens after login
    setTokens(accessToken, refreshToken, user) {
      // Store in localStorage for persistence across tabs
      localStorage.setItem(this.tokenKey, accessToken);
      localStorage.setItem(this.refreshTokenKey, refreshToken);
      localStorage.setItem(this.userKey, JSON.stringify(user));
      
      // Decode token to get expiry
      const payload = this.parseJwt(accessToken);
      if (payload && payload.exp) {
        localStorage.setItem('rsn8tv_token_expiry', payload.exp);
      }

      // Reset warning flag
      this.tokenExpiryWarningShown = false;

      // Set up auto-refresh
      this.scheduleTokenRefresh();
    }

    // Get stored access token
    getAccessToken() {
      return localStorage.getItem(this.tokenKey);
    }

    // Get authorization header
    getAuthHeader() {
      const token = this.getAccessToken();
      return token ? { 'Authorization': `Bearer ${token}` } : {};
    }

    // Parse JWT token
    parseJwt(token) {
      try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
      } catch (e) {
        console.error('Failed to parse JWT:', e);
        return null;
      }
    }

    // Check if token is expired
    isTokenExpired() {
      const token = this.getAccessToken();
      if (!token) return true;

      const payload = this.parseJwt(token);
      if (!payload || !payload.exp) return true;

      const now = Date.now() / 1000;
      return payload.exp < now;
    }

    // Check if token will expire soon
    isTokenExpiringSoon() {
      const token = this.getAccessToken();
      if (!token) return false;

      const payload = this.parseJwt(token);
      if (!payload || !payload.exp) return false;

      const now = Date.now() / 1000;
      const timeUntilExpiry = payload.exp - now;
      return timeUntilExpiry < 300; // 5 minutes
    }

    // Schedule automatic token refresh
    scheduleTokenRefresh() {
      // Clear any existing timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }

      const token = this.getAccessToken();
      if (!token) return;

      const payload = this.parseJwt(token);
      if (!payload || !payload.exp) return;

      // Refresh 5 minutes before expiry
      const expiryTime = payload.exp * 1000;
      const refreshTime = expiryTime - (5 * 60 * 1000);
      const timeUntilRefresh = refreshTime - Date.now();

      if (timeUntilRefresh > 0) {
        console.log(`Token refresh scheduled in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);
        this.refreshTimer = setTimeout(() => {
          console.log('Auto-refreshing token...');
          this.refreshToken();
        }, timeUntilRefresh);
      } else {
        // Token already needs refresh
        this.refreshToken();
      }
    }

    // Refresh access token
    async refreshToken() {
      const refreshToken = localStorage.getItem(this.refreshTokenKey);
      if (!refreshToken) {
        console.log('No refresh token available');
        this.logout();
        return false;
      }

      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ refreshToken })
        });

        if (response.ok) {
          const data = await response.json();
          this.setTokens(data.accessToken, data.refreshToken, data.user);
          console.log('Token refreshed successfully');
          return true;
        } else {
          console.error('Token refresh failed:', response.status);
          this.logout();
          return false;
        }
      } catch (error) {
        console.error('Token refresh error:', error);
        this.logout();
        return false;
      }
    }

    // Make authenticated API request
    async apiRequest(url, options = {}) {
      // Ensure URL is properly formatted
      if (!url.startsWith('http')) {
        url = `${this.baseURL}${url}`;
      }

      // Check if token is expired
      if (this.isTokenExpired()) {
        console.log('Token expired, attempting refresh...');
        const refreshed = await this.refreshToken();
        if (!refreshed) {
          throw new Error('Authentication failed');
        }
      }

      // Add auth header
      options.headers = {
        'Content-Type': 'application/json',
        ...options.headers,
        ...this.getAuthHeader()
      };

      try {
        const response = await fetch(url, options);

        // Check for token expiring soon header
        if (response.headers.get('X-Token-Expiring-Soon') === 'true' && !this.tokenExpiryWarningShown) {
          this.tokenExpiryWarningShown = true;
          console.log('Token expiring soon, will refresh automatically');
        }

        // Handle 401 Unauthorized
        if (response.status === 401) {
          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = { error: text };
          }
          
          if (data.code === 'TOKEN_EXPIRED') {
            // Try to refresh token
            console.log('Token expired, attempting refresh...');
            const refreshed = await this.refreshToken();
            
            if (refreshed) {
              // Retry the request
              options.headers = {
                ...options.headers,
                ...this.getAuthHeader()
              };
              return fetch(url, options);
            }
          }
          
          // Invalid token or other auth error
          this.logout();
          throw new Error('Authentication failed');
        }

        return response;
      } catch (error) {
        console.error('API request error:', error);
        throw error;
      }
    }

    // Logout
    logout() {
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      // Clear storage
      localStorage.removeItem(this.tokenKey);
      localStorage.removeItem(this.refreshTokenKey);
      localStorage.removeItem(this.userKey);
      localStorage.removeItem('rsn8tv_token_expiry');
      
      // Redirect to login
      window.location.href = '/admin/login.html';
    }

    // Get current user
    getCurrentUser() {
      const userStr = localStorage.getItem(this.userKey);
      try {
        return userStr ? JSON.parse(userStr) : null;
      } catch (e) {
        console.error('Failed to parse user data:', e);
        return null;
      }
    }

    // Check if user is authenticated
    isAuthenticated() {
      return !this.isTokenExpired();
    }

    // Listen for storage changes (login/logout in other tabs)
    initStorageListener() {
      window.addEventListener('storage', (e) => {
        if (e.key === this.tokenKey) {
          if (!e.newValue) {
            // Token removed in another tab (logout)
            console.log('Logged out in another tab');
            if (this.refreshTimer) {
              clearTimeout(this.refreshTimer);
              this.refreshTimer = null;
            }
            window.location.href = '/admin/login.html';
          } else if (e.oldValue && e.newValue !== e.oldValue) {
            // Token changed in another tab (refresh or new login)
            console.log('Token updated in another tab');
            this.scheduleTokenRefresh();
          }
        }
      });
    }

    // Initialize auth manager
    init() {
      // Check if we're on the login page
      if (window.location.pathname.includes('login.html')) {
        return;
      }

      // Check authentication
      if (!this.isAuthenticated()) {
        this.logout();
        return;
      }

      // Initialize storage listener
      this.initStorageListener();

      // Schedule token refresh
      this.scheduleTokenRefresh();

      // Set user info in UI if element exists
      const user = this.getCurrentUser();
      if (user) {
        const usernameDisplay = document.getElementById('username-display');
        if (usernameDisplay) {
          usernameDisplay.textContent = user.username;
        }
      }
    }
  }

  // Create global instance
  window.authManager = new AuthManager();

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.authManager.init();
    });
  } else {
    window.authManager.init();
  }
})();
