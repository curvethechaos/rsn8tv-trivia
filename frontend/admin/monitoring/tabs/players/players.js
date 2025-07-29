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
            // Build URLSearchParams manually to ensure proper encoding
            const params = new URLSearchParams();
            params.append('page', this.currentPage);
            params.append('limit', 20);
            params.append('sortBy', this.currentSort);
            params.append('sortOrder', this.sortOrder);

            // Add filters individually to ensure proper handling
            Object.entries(this.filters).forEach(([key, value]) => {
                if (value !== '' && value !== null && value !== undefined) {
                    params.append(key, value);
                }
            });

            console.log('Loading players with params:', params.toString()); // Debug log

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
                this.displayPlayers(data.data || []); // Fixed: use data.data instead of data.players
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
                    <td colspan="15" class="empty-state">
                        <h3>No players found</h3>
                        <p>Try adjusting your filters or search criteria</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = players.map(player => {
            const displayName = player.nickname || player.display_name || player.temporary_name || 'Unknown';

            // Display ranks only if greater than 0, otherwise show '-'
            const weeklyRank = (player.weekly_rank && player.weekly_rank > 0) ? player.weekly_rank : '-';
            const monthlyRank = (player.monthly_rank && player.monthly_rank > 0) ? player.monthly_rank : '-';
            const quarterlyRank = (player.quarterly_rank && player.quarterly_rank > 0) ? player.quarterly_rank : '-';
            const yearlyRank = (player.yearly_rank && player.yearly_rank > 0) ? player.yearly_rank : '-';

            // Determine current winner status
            const currentWinner = this.getCurrentWinnerStatus(player);
            const pastWinner = player.has_won_prize ? '🏆' : '-';

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
                    <td>${player.email ? this.escapeHtml(player.email) : '<span style="color: #666">Not registered</span>'}</td>
                    <td class="numeric">${player.games_played}</td>
                    <td class="numeric">${player.highest_score}</td>
                    <td class="numeric">${player.total_score}</td>
                    <td class="numeric">${weeklyRank}</td>
                    <td class="numeric">${monthlyRank}</td>
                    <td class="numeric">${quarterlyRank}</td>
                    <td class="numeric">${yearlyRank}</td>
                    <td>${this.formatDate(player.created_at)}</td>
                    <td>${player.last_played ? this.formatDate(player.last_played) : 'Never'}</td>
                    <td class="text-center">${currentWinner}</td>
                    <td class="text-center">${pastWinner}</td>
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

    // Helper to determine current winner status
    getCurrentWinnerStatus(player) {
        // Check if player is currently winning any period
        if (player.weekly_rank === 1) return 'W';
        if (player.monthly_rank === 1) return 'M';
        if (player.quarterly_rank === 1) return 'Q';
        if (player.yearly_rank === 1) return 'Y';
        
        // Check for threshold achievement
        // Note: Backend doesn't currently return weekly_score, using highest_score as proxy
        if (player.highest_score >= 8500) return 'T';
        
        return '-';
    },

    // Update statistics - Fixed to match HTML element IDs
    updateStats(stats) {
        const elements = {
            'totalPlayersCount': stats.total || 0,
            'registeredTodayCount': stats.registeredToday || 0
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
        // Get filter values and ensure proper types
        const filters = {
            search: document.getElementById('searchInput')?.value || '',
            hasEmail: document.getElementById('emailFilter')?.value || '',
            marketingConsent: document.getElementById('marketingFilter')?.value || '',
            minScore: document.getElementById('minScoreFilter')?.value || '',
            minTotalScore: document.getElementById('minTotalScoreFilter')?.value || '',
            dateFrom: document.getElementById('dateFrom')?.value || '',
            dateTo: document.getElementById('dateTo')?.value || '',
            prizeEligible: document.getElementById('prizeFilter')?.value || ''
        };

        // Only include filters with actual values
        this.filters = {};
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== '' && value !== null && value !== undefined) {
                this.filters[key] = value;
            }
        });

        console.log('Applying filters:', this.filters); // Debug log

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

        // Update select all checkbox
        const allCheckboxes = document.querySelectorAll('#playersTableBody input[type="checkbox"]');
        const checkedCount = document.querySelectorAll('#playersTableBody input[type="checkbox"]:checked').length;
        const selectAllCheckbox = document.getElementById('selectAllCheckbox');

        if (selectAllCheckbox) {
            selectAllCheckbox.checked = allCheckboxes.length > 0 && allCheckboxes.length === checkedCount;
        }
    },

    // Update selected count display
    updateSelectedCount() {
        const countEl = document.getElementById('selectedCount');
        if (countEl) {
            countEl.textContent = this.selectedPlayers.size;
        }
    },

    // Export players
    async exportPlayers() {
        if (!confirm('Export all players matching current filters?')) return;

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
                    filters: this.filters
                })
            });

            if (response.ok) {
                this.showSuccess('Export started. Check the Exports tab for progress.');
            } else {
                throw new Error('Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to start export. Please try again.');
        }
    },

    // Export marketing list
    async exportMarketing() {
        if (!confirm('Export marketing list (players with email consent)?')) return;

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
                    filters: this.filters
                })
            });

            if (response.ok) {
                this.showSuccess('Marketing export started. Check the Exports tab for progress.');
            } else {
                throw new Error('Export failed');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showError('Failed to start export. Please try again.');
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

            if (!response.ok) throw new Error('Failed to load player');

            const data = await response.json();
            const player = data.profile || data; // Handle different response structures
            this.showPlayerModal(player);
        } catch (error) {
            console.error('Error loading player:', error);
            this.showError('Failed to load player details.');
        }
    },

    // Show player modal
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
                    <span class="detail-value">${this.escapeHtml(player.email || 'Not registered')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Marketing Consent:</span>
                    <span class="badge ${player.marketing_consent ? 'badge-success' : 'badge-danger'}">
                        ${player.marketing_consent ? 'Yes' : 'No'}
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

                <h4 style="margin-top: 20px;">Leaderboard Rankings</h4>
                <div class="detail-row">
                    <span class="detail-label">Weekly Rank:</span>
                    <span class="detail-value">${player.weekly_rank || '-'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Monthly Rank:</span>
                    <span class="detail-value">${player.monthly_rank || '-'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Quarterly Rank:</span>
                    <span class="detail-value">${player.quarterly_rank || '-'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Yearly Rank:</span>
                    <span class="detail-value">${player.yearly_rank || '-'}</span>
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
            tbody.innerHTML = '<tr><td colspan="15" class="loading-cell">Loading players...</td></tr>';
        }
    },

    showError(message) {
        // You can implement a toast notification here
        console.error(message);
        alert(message); // Simple fallback
    },

    showSuccess(message) {
        // You can implement a toast notification here
        console.log(message);
        alert(message); // Simple fallback
    },

    // Escape HTML to prevent XSS
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Format date
    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
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
