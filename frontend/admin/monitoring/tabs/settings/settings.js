(function() {
    'use strict';
    
    window.settingsTab = {
        settings: {},
        
        init() {
            console.log('Settings tab initialized');
            this.loadSettings();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Auto-save on change
            document.querySelectorAll('.setting-input').forEach(input => {
                input.addEventListener('change', (e) => {
                    this.saveSetting(e.target.name, e.target.value);
                });
            });
            
            // Cache clear button
            document.getElementById('clear-cache-btn')?.addEventListener('click', () => {
                this.clearCache();
            });
            
            // Backup button
            document.getElementById('backup-btn')?.addEventListener('click', () => {
                this.createBackup();
            });
        },
        
        async loadSettings() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/settings`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.settings = await response.json();
                    this.displaySettings();
                }
            } catch (error) {
                console.error('Error loading settings:', error);
            }
        },
        
        displaySettings() {
            // Game Settings
            document.getElementById('round-duration').value = this.settings.round_duration || 30;
            document.getElementById('questions-per-round').value = this.settings.questions_per_round || 10;
            document.getElementById('max-players-per-game').value = this.settings.max_players_per_game || 50;
            
            // System Settings
            document.getElementById('maintenance-mode').checked = this.settings.maintenance_mode || false;
            document.getElementById('registration-required').checked = this.settings.registration_required || false;
            document.getElementById('profanity-filter').checked = this.settings.profanity_filter || true;
            
            // Email Settings
            document.getElementById('smtp-host').value = this.settings.smtp_host || '';
            document.getElementById('smtp-port').value = this.settings.smtp_port || 587;
            document.getElementById('smtp-user').value = this.settings.smtp_user || '';
            document.getElementById('email-from').value = this.settings.email_from || '';
            
            // Display system info
            this.displaySystemInfo();
        },
        
        displaySystemInfo() {
            const infoContainer = document.getElementById('system-info');
            if (!infoContainer) return;
            
            infoContainer.innerHTML = `
                <h3>System Information</h3>
                <p>Version: ${this.settings.version || '1.0.0'}</p>
                <p>Database: PostgreSQL ${this.settings.db_version || 'Unknown'}</p>
                <p>Server: Node.js ${this.settings.node_version || 'Unknown'}</p>
                <p>Uptime: ${this.formatUptime(this.settings.uptime || 0)}</p>
                <p>Last Backup: ${this.settings.last_backup ? new Date(this.settings.last_backup).toLocaleString() : 'Never'}</p>
            `;
        },
        
        formatUptime(seconds) {
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${days}d ${hours}h ${minutes}m`;
        },
        
        async saveSetting(name, value) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/settings/${name}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ value })
                });
                
                if (response.ok) {
                    this.showMessage(`${name} updated`, 'success');
                }
            } catch (error) {
                console.error('Error saving setting:', error);
                this.showMessage('Error saving setting', 'error');
            }
        },
        
        async clearCache() {
            if (!confirm('Are you sure you want to clear all caches?')) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/cache/clear`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.showMessage('Cache cleared successfully', 'success');
                }
            } catch (error) {
                console.error('Error clearing cache:', error);
                this.showMessage('Error clearing cache', 'error');
            }
        },
        
        async createBackup() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/backup`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const result = await response.json();
                    this.showMessage(`Backup created: ${result.filename}`, 'success');
                    this.loadSettings(); // Refresh to show new backup time
                }
            } catch (error) {
                console.error('Error creating backup:', error);
                this.showMessage('Error creating backup', 'error');
            }
        },
        
        async testEmailSettings() {
            const authToken = localStorage.getItem('authToken');
            const testEmail = prompt('Enter email address for test:');
            if (!testEmail) return;
            
            try {
                const response = await fetch(`${API_BASE}/admin/settings/test-email`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: testEmail })
                });
                
                if (response.ok) {
                    this.showMessage('Test email sent', 'success');
                } else {
                    this.showMessage('Failed to send test email', 'error');
                }
            } catch (error) {
                console.error('Error testing email:', error);
                this.showMessage('Error testing email', 'error');
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('settings-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            // Remove event listeners if needed
        }
    };
})();
