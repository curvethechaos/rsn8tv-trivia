// Players Tab Module for RSN8TV Admin Dashboard
// Path: /var/www/html/admin/monitoring/tabs/players/players.js

window.PlayersTab = {
    // State management
    currentPage: 1,
    totalPages: 1,
    currentSort: 'created_at',
    sortOrder: 'desc',
    filters: {},
    selectedPlayers: new Set(),
    isLoading: false,

    // Initialize the tab
    init() {
        console.log('Players tab initialized');
        this.setupEventListeners();
        this.loadPlayers();
    },

    // Cleanup when switching tabs
    cleanup() {
        this.selectedPlayers.clear();
    },

    // Setup all event listeners
    setupEventListeners() {
        // Search on Enter key
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.applyFilters();
            });
        }

        // Page input on Enter key
        const pageInput = document.getElementById('pageInput');
        if (pageInput) {
            pageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.goToPage();
            });
        }
    },

    // Load players from API
    async loadPlayers() {
        if (this.isLoading) return;
        this.isLoading = true;
        this.showLoading(true);
        
        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: 20,
                sortBy: this.currentSort,
                sortOrder: this.sortOrder,
                ...this.filters
            });

            const authToken = localStorage.getItem('authToken');
            const response = await fetch(`/api/admin/players?${params}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    // Handle auth refresh
                    await this.refreshAuth();
                    return this.loadPlayers();
                }
                throw new Error('Failed to load players');
            }

            const data = await response.json();
            
            if (data.success) {
                this.displayPlayers(data.players || []);
                this.updatePagination(data.pagination || {});
                this.updateStats(data.stats || {});
            }
        } catch (error) {
            console.error('Error loading players:', error);
            this.showError('Failed to load players. Please try again.');
        } finally {
            this.isLoading = false;
            this.showLoading(false);
        }
    },

    // Display players in the table
    displayPlayers(players) {
        const tbody = document.getElementById('playersTableBody');
        if (!tbody) return;

        if (players.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" class="empty-state">
                        <h3>No players found</h3>
                        <p>Try adjusting your filters or search criteria</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = players.map(player => {
            const isRegistered = player.email !== null;
            const displayName = player.nickname || player.display_name || player.temporary_name || 'Unknown';
            
            return `
                <tr data-player-id="${player.id}">
                    <td class="checkbox-column">
                        <input type="checkbox" 
                               value="${player.id}" 
                               onchange="PlayersTab.togglePlayerSelection(${player.id})"
                               ${this.selectedPlayers.has(player.id) ? 'checked' : ''}>
                    </td>
                    <td>
                        <div class="player-info">
                            <span class="player-nickname">${this.escapeHtml(displayName)}</span>
                            ${player.real_name ? `<span class="player-realname">${this.escapeHtml(player.real_name)}</span>` : ''}
                        </div>
                    </td>
                    <td>${this.escapeHtml(player.real_name || '-')}</td>
                    <td>${player.email ? this.escapeHtml(player.email) : '<span style="color: #666">Not registered</span>'}</td>
                    <td class="numeric">${player.games_played || 0}</td>
                    <td class="numeric">${player.highest_score || 0}</td>
                    <td class="numeric">${player.total_score || 0}</td>
                    <td>${this.formatDate(player.created_at)}</td>
                    <td>${player.last_played ? this.formatDate(player.last_played) : 'Never'}</td>
                    <td>
                        <span class="badge ${player.marketing_consent ? 'badge-success' : 'badge-danger'}">
                            ${player.marketing_consent ? 'Yes' : 'No'}
                        </span>
                    </td>
                    <td>
                        <button class="btn-view" onclick="PlayersTab.viewPlayer(${player.id})">
                            View
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        this.updateSelectedCount();
    },

    // Update statistics
    updateStats(stats) {
        const elements = {
            'totalPlayersCount': stats.total || 0,
            'registeredToday': stats.registeredToday || 0,
            'withEmail': stats.withEmail || 0,
            'marketingConsent': stats.marketingConsent || 0
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    },

    // Update pagination controls
    updatePagination(pagination) {
        this.currentPage = pagination.page || 1;
        this.totalPages = pagination.pages || 1;

        // Update showing info
        const from = pagination.total > 0 ? ((pagination.page - 1) * pagination.limit) + 1 : 0;
        const to = Math.min(pagination.page * pagination.limit, pagination.total);
        
        const showingFrom = document.getElementById('showingFrom');
        const showingTo = document.getElementById('showingTo');
        const totalCount = document.getElementById('totalCount');
        const totalPagesEl = document.getElementById('totalPages');
        const pageInput = document.getElementById('pageInput');
        
        if (showingFrom) showingFrom.textContent = from;
        if (showingTo) showingTo.textContent = to;
        if (totalCount) totalCount.textContent = pagination.total || 0;
        if (totalPagesEl) totalPagesEl.textContent = this.totalPages;
        if (pageInput) pageInput.value = this.currentPage;

        // Update button states
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        
        if (prevBtn) prevBtn.disabled = this.currentPage <= 1;
        if (nextBtn) nextBtn.disabled = this.currentPage >= this.totalPages;
    },

    // Sort by column
    sortBy(field) {
        if (this.currentSort === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = field;
            this.sortOrder = 'desc';
        }

        // Update UI to show sort direction
        document.querySelectorAll('th[data-sort]').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
        });
        
        const currentTh = document.querySelector(`th[data-sort="${field}"]`);
        if (currentTh) {
            currentTh.classList.add(this.sortOrder === 'asc' ? 'sort-asc' : 'sort-desc');
        }

        this.currentPage = 1;
        this.loadPlayers();
    },

    // Apply filters
    applyFilters() {
        this.filters = {
            search: document.getElementById('searchInput')?.value || '',
            hasEmail: document.getElementById('emailFilter')?.value || '',
            marketingConsent: document.getElementById('marketingFilter')?.value || '',
            minScore: document.getElementById('minScoreFilter')?.value || '',
            minTotalScore: document.getElementById('minTotalScoreFilter')?.value || '',
            dateFrom: document.getElementById('dateFrom')?.value || '',
            dateTo: document.getElementById('dateTo')?.value || '',
            prizeEligible: document.getElementById('prizeFilter')?.value || ''
        };

        // Remove empty values
        Object.keys(this.filters).forEach(key => {
            if (!this.filters[key]) delete this.filters[key];
        });

        this.currentPage = 1;
        this.loadPlayers();
    },

    // Reset all filters
    resetFilters() {
        ['searchInput', 'emailFilter', 'marketingFilter', 'minScoreFilter', 
         'minTotalScoreFilter', 'dateFrom', 'dateTo', 'prizeFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        this.filters = {};
        this.currentPage = 1;
        this.loadPlayers();
    },

    // Toggle select all
    toggleSelectAll() {
        const checkbox = document.getElementById('selectAllCheckbox');
        const playerCheckboxes = document.querySelectorAll('#playersTableBody input[type="checkbox"]');
        
        playerCheckboxes.forEach(cb => {
            cb.checked = checkbox.checked;
            const playerId = parseInt(cb.value);
            if (checkbox.checked) {
                this.selectedPlayers.add(playerId);
            } else {
                this.selectedPlayers.delete(playerId);
            }
        });
        
        this.updateSelectedCount();
    },

    // Toggle individual player selection
    togglePlayerSelection(playerId) {
        if (this.selectedPlayers.has(playerId)) {
            this.selectedPlayers.delete(playerId);
        } else {
            this.selectedPlayers.add(playerId);
        }
        this.updateSelectedCount();
    },

    // Update selected count display
    updateSelectedCount() {
        const el = document.getElementById('selectedCount');
        if (el) el.textContent = this.selectedPlayers.size;
    },

    // Export players
    async exportPlayers() {
        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/admin/exports', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'players',
                    filters: this.filters,
                    selectedIds: Array.from(this.selectedPlayers)
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const data = await response.json();
            this.showMessage('Export started! Check the Exports tab for download.', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to start export', 'error');
        }
    },

    // Export marketing list
    async exportMarketing() {
        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch('/api/admin/exports', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${authToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'marketing_list',
                    filters: { ...this.filters, marketingConsent: 'true' }
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const data = await response.json();
            this.showMessage('Marketing list export started! Check the Exports tab.', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to start marketing export', 'error');
        }
    },

    // View player details
    async viewPlayer(playerId) {
        try {
            const authToken = localStorage.getItem('authToken');
            const response = await fetch(`/api/players/${playerId}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) throw new Error('Failed to load player details');

            const data = await response.json();
            
            if (data.profile) {
                this.showPlayerModal(data.profile);
            } else {
                this.showError('Player not found');
            }
        } catch (error) {
            console.error('Error viewing player:', error);
            this.showError('Failed to load player details');
        }
    },

    // Show player details modal
    showPlayerModal(player) {
        const modal = document.getElementById('playerModal');
        const modalBody = document.getElementById('playerModalBody');
        
        if (!modal || !modalBody) return;

        modalBody.innerHTML = `
            <div class="player-details">
                <h4>Profile Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Nickname:</span>
                    <span class="detail-value">${this.escapeHtml(player.nickname || 'N/A')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Real Name:</span>
                    <span class="detail-value">${this.escapeHtml(player.real_name || 'N/A')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Email:</span>
                    <span class="detail-value">${this.escapeHtml(player.email || 'N/A')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Marketing Consent:</span>
                    <span class="detail-value">
                        <span class="badge ${player.marketing_consent ? 'badge-success' : 'badge-danger'}">
                            ${player.marketing_consent ? 'Yes' : 'No'}
                        </span>
                    </span>
                </div>
                
                <h4 style="margin-top: 20px;">Game Statistics</h4>
                <div class="detail-row">
                    <span class="detail-label">Games Played:</span>
                    <span class="detail-value">${player.games_played || 0}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Highest Score:</span>
                    <span class="detail-value">${player.highest_score || 0}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Total Score:</span>
                    <span class="detail-value">${player.total_score || 0}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Average Score:</span>
                    <span class="detail-value">${player.average_score ? player.average_score.toFixed(0) : 0}</span>
                </div>
                
                <h4 style="margin-top: 20px;">Account Information</h4>
                <div class="detail-row">
                    <span class="detail-label">Registered:</span>
                    <span class="detail-value">${this.formatDate(player.created_at)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Last Played:</span>
                    <span class="detail-value">${player.last_played ? this.formatDate(player.last_played) : 'Never'}</span>
                </div>
            </div>
        `;

        modal.style.display = 'flex';
    },

    // Close modal
    closeModal() {
        const modal = document.getElementById('playerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

    // Pagination controls
    prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            this.loadPlayers();
        }
    },

    nextPage() {
        if (this.currentPage < this.totalPages) {
            this.currentPage++;
            this.loadPlayers();
        }
    },

    goToPage() {
        const input = document.getElementById('pageInput');
        const page = parseInt(input.value);
        
        if (page >= 1 && page <= this.totalPages) {
            this.currentPage = page;
            this.loadPlayers();
        } else {
            input.value = this.currentPage;
        }
    },

    // UI helpers
    showLoading(show) {
        const tbody = document.getElementById('playersTableBody');
        if (tbody && show) {
            tbody.innerHTML = '<tr><td colspan="11" class="loading-cell">Loading...</td></tr>';
        }
    },

    showMessage(message, type = 'info') {
        // Create message element if it doesn't exist
        let messageEl = document.getElementById('playersMessage');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'playersMessage';
            messageEl.className = 'message';
            const tabContent = document.getElementById('players-tab');
            if (tabContent) {
                tabContent.insertBefore(messageEl, tabContent.firstChild);
            }
        }

        messageEl.textContent = message;
        messageEl.className = `message ${type} show`;
        
        setTimeout(() => {
            messageEl.classList.remove('show');
        }, 5000);
    },

    showError(message) {
        this.showMessage(message, 'error');
    },

    // Utility functions
    formatDate(dateString) {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Auth refresh helper
    async refreshAuth() {
        try {
            const refreshToken = localStorage.getItem('refreshToken');
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken })
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('authToken', data.accessToken);
                if (data.refreshToken) {
                    localStorage.setItem('refreshToken', data.refreshToken);
                }
                return true;
            }
        } catch (error) {
            console.error('Auth refresh failed:', error);
        }
        
        // Redirect to login if refresh fails
        window.location.href = '/admin/login.html';
        return false;
    }
};
