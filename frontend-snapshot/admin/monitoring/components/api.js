// components/api.js - API management with authentication

class APIManager {
    constructor(authManager) {
        this.auth = authManager;
        this.baseURL = '/api';
    }

    async request(url, options = {}) {
        // Add auth headers
        const authOptions = this.auth.addAuthHeaders(options);
        
        let response = await fetch(this.baseURL + url, authOptions);
        
        // Handle 401 errors
        if (response.status === 401) {
            const refreshed = await this.auth.refreshAuthToken();
            if (refreshed) {
                // Retry with new token
                const newAuthOptions = this.auth.addAuthHeaders(options);
                response = await fetch(this.baseURL + url, newAuthOptions);
            } else {
                // Refresh failed, redirect to login
                this.auth.clearAuth();
                window.location.replace('/admin/login.html');
                return;
            }
        }
        
        return response;
    }

    async get(url, options = {}) {
        return this.request(url, { ...options, method: 'GET' });
    }

    async post(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data)
        });
    }

    async put(url, data, options = {}) {
        return this.request(url, {
            ...options,
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            body: JSON.stringify(data)
        });
    }

    async delete(url, options = {}) {
        return this.request(url, { ...options, method: 'DELETE' });
    }
}
