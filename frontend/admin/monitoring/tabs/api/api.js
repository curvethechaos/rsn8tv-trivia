(function() {
    'use strict';
    
    window.apiTab = {
        apiKeys: [],
        
        init() {
            console.log('API tab initialized');
            this.loadApiKeys();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('generate-api-key-btn')?.addEventListener('click', () => {
                this.generateApiKey();
            });
        },
        
        async loadApiKeys() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/api-keys`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.apiKeys = await response.json();
                    this.displayApiKeys();
                }
            } catch (error) {
                console.error('Error loading API keys:', error);
            }
        },
        
        displayApiKeys() {
            const container = document.getElementById('api-keys-list');
            if (!container) return;
            
            container.innerHTML = this.apiKeys.map(key => `
                <div class="api-key-item">
                    <div class="key-info">
                        <strong>${key.name}</strong>
                        <span class="key-value">${key.key_preview}...</span>
                        <span class="key-created">Created: ${new Date(key.created_at).toLocaleDateString()}</span>
                    </div>
                    <div class="key-stats">
                        <span>Requests: ${key.request_count || 0}</span>
                        <span>Last used: ${key.last_used ? new Date(key.last_used).toLocaleString() : 'Never'}</span>
                    </div>
                    <div class="key-actions">
                        <button onclick="apiTab.toggleKey(${key.id}, ${!key.is_active})">
                            ${key.is_active ? 'Disable' : 'Enable'}
                        </button>
                        <button onclick="apiTab.deleteKey(${key.id})">Delete</button>
                    </div>
                </div>
            `).join('');
            
            // Display API documentation
            this.displayApiDocs();
        },
        
        displayApiDocs() {
            const docsContainer = document.getElementById('api-docs');
            if (!docsContainer) return;
            
            docsContainer.innerHTML = `
                <h3>API Documentation</h3>
                <div class="api-endpoint">
                    <h4>GET /api/leaderboards</h4>
                    <p>Retrieve leaderboard data</p>
                    <pre>
Headers:
  X-API-Key: your-api-key

Query Parameters:
  period: weekly|monthly|quarterly|yearly
  limit: number (default: 100)
                    </pre>
                </div>
                <div class="api-endpoint">
                    <h4>GET /api/player/:playerId</h4>
                    <p>Get player information</p>
                    <pre>
Headers:
  X-API-Key: your-api-key

Response:
{
  "id": 123,
  "nickname": "Player1",
  "games_played": 50,
  "high_score": 1500
}
                    </pre>
                </div>
            `;
        },
        
        async generateApiKey() {
            const name = prompt('Enter a name for this API key:');
            if (!name) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/api-keys`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    this.showNewApiKey(result.key);
                    this.loadApiKeys();
                }
            } catch (error) {
                console.error('Error generating API key:', error);
                this.showMessage('Error generating API key', 'error');
            }
        },
