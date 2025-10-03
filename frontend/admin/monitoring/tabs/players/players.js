// /var/www/html/admin/monitoring/tabs/players/players.js

const PlayersTab = {
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    players: [],
    selectedPlayers: new Set(),
    currentSort: 'created_at',
    sortOrder: 'desc',
    filters: {},
    isLoading: false,

    init() {
        console.log('Initializing Players Tab');
        this.bindEventHandlers();
        this.loadPlayers();
    },

bindEventHandlers() {
    // Search on input with debounce
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                this.filters.search = e.target.value;
                this.currentPage = 1;
                this.loadPlayers();
            }, 300);
        });
    }
        // Filter change handlers
 const filterElements = {
        'minScoreFilter': 'minScore',
        'minTotalScoreFilter': 'minTotalScore',
        'dateFromFilter': 'dateFrom',
        'dateToFilter': 'dateTo',
        'lastPlayedFromFilter': 'lastPlayedFrom',
        'lastPlayedToFilter': 'lastPlayedTo',
        'prizeFilter': 'prizeEligible'
    };

    Object.entries(filterElements).forEach(([elementId, filterKey]) => {
        const element = document.getElementById(elementId);
        if (element) {
            element.addEventListener('change', () => {
                this.filters[filterKey] = element.value;
            });
        }
    });
},


    async loadPlayers() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading(true);

        try {
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize,
                sortBy: this.currentSort,
                sortOrder: this.sortOrder,
                ...this.filters
            });

            // Remove empty filter values
            Array.from(params.keys()).forEach(key => {
                if (!params.get(key)) params.delete(key);
            });

            const authToken = localStorage.getItem('authToken');
            const response = await fetch(`/api/admin/players?${params}`, {
                headers: {
                    'Authorization': `Bearer ${authToken}`
                }
            });

            if (!response.ok) {
                if (response.status === 401) {
                    window.location.href = '/admin/login.html';
                    return;
                }
                throw new Error('Failed to load players');
            }

            const data = await response.json();
            
            if (data.success) {
                this.displayPlayers(data.data || []); 
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

    // Replace the displayPlayers method
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
        const realName = player.real_name || '';

        // Display SCORES for weekly/monthly/quarterly/yearly, not ranks
        const weeklyScore = player.weekly_score || 0;
        const monthlyScore = player.monthly_score || 0;
        const quarterlyScore = player.quarterly_score || 0;
        const yearlyScore = player.yearly_score || 0;

        // Determine current winner status based on ranks
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
                        <div class="player-nickname">${this.escapeHtml(displayName)}</div>
                        ${realName ? `<div class="player-realname">${this.escapeHtml(realName)}</div>` : ''}
                    </div>
                </td>
                <td>${this.escapeHtml(player.email || '-')}</td>
                <td class="text-center">${player.games_played || 0}</td>
                <td class="text-right">${player.highest_score || 0}</td>
                <td class="text-right">${player.total_score || 0}</td>
                <td class="text-center">${weeklyScore}</td>
                <td class="text-center">${monthlyScore}</td>
                <td class="text-center">${quarterlyScore}</td>
                <td class="text-center">${yearlyScore}</td>
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

    getCurrentWinnerStatus(player) {
        // Check if player is currently winning any period
        if (player.weekly_rank === 1) return 'W';
        if (player.monthly_rank === 1) return 'M';
        if (player.quarterly_rank === 1) return 'Q';
        if (player.yearly_rank === 1) return 'Y';
        
        // Check for threshold achievement (8500 points)
        if (player.highest_score >= 8500) return 'T';
        
        return '-';
    },

    updateStats(stats) {
        const elements = {
            'totalPlayersCount': stats.total || 0,
            'registeredToday': stats.registeredToday || 0
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    },

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

    sortBy(field) {
        if (this.currentSort === field) {
            this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
        } else {
            this.currentSort = field;
            this.sortOrder = 'desc';
        }
        this.currentPage = 1;
        this.loadPlayers();
    },

    applyFilters() {
        this.currentPage = 1;
        this.loadPlayers();
    },

clearFilters() {
    // Clear all filter inputs
    document.getElementById('searchInput').value = '';
    document.getElementById('minScoreFilter').value = '';
    document.getElementById('minTotalScoreFilter').value = '';
    document.getElementById('dateFromFilter').value = '';
    document.getElementById('dateToFilter').value = '';
    document.getElementById('lastPlayedFromFilter').value = '';
    document.getElementById('lastPlayedToFilter').value = '';
    document.getElementById('prizeFilter').value = '';
    
    // Clear filters object
    this.filters = {};
    
    // Reload
    this.currentPage = 1;
    this.loadPlayers();
},
    toggleSelectAll() {
        const checkbox = document.getElementById('selectAllCheckbox');
        const checkboxes = document.querySelectorAll('#playersTableBody input[type="checkbox"]');
        
        if (checkbox.checked) {
            checkboxes.forEach(cb => {
                cb.checked = true;
                this.selectedPlayers.add(parseInt(cb.value));
            });
        } else {
            checkboxes.forEach(cb => {
                cb.checked = false;
            });
            this.selectedPlayers.clear();
        }
        
        this.updateSelectedCount();
    },

    togglePlayerSelection(playerId) {
        if (this.selectedPlayers.has(playerId)) {
            this.selectedPlayers.delete(playerId);
        } else {
            this.selectedPlayers.add(playerId);
        }
        this.updateSelectedCount();
    },

    updateSelectedCount() {
        const count = this.selectedPlayers.size;
        const el = document.getElementById('selectedCount');
        if (el) el.textContent = `${count} selected`;
        
        // Update select all checkbox state
        const selectAll = document.getElementById('selectAllCheckbox');
        const totalCheckboxes = document.querySelectorAll('#playersTableBody input[type="checkbox"]').length;
        if (selectAll) {
            selectAll.checked = count > 0 && count === totalCheckboxes;
        }
    },

    async exportAll() {
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

            if (!response.ok) throw new Error('Export failed');

            const data = await response.json();
            this.showMessage('Export started. Check the Exports tab.', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to start export', 'error');
        }
    },

    async exportSelected() {
        if (this.selectedPlayers.size === 0) {
            this.showMessage('No players selected', 'error');
            return;
        }

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
                    filters: {
                        ...this.filters,
                        playerIds: Array.from(this.selectedPlayers)
                    }
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const data = await response.json();
            this.showMessage('Export started. Check the Exports tab.', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to start selected export', 'error');
        }
    },

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
                    type: 'marketing',
                    filters: {
                        marketingConsent: true
                    }
                })
            });

            if (!response.ok) throw new Error('Export failed');

            const data = await response.json();
            this.showMessage('Marketing export started. Check the Exports tab.', 'success');
        } catch (error) {
            console.error('Export error:', error);
            this.showMessage('Failed to start marketing export', 'error');
        }
    },

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

    closeModal() {
        const modal = document.getElementById('playerModal');
        if (modal) {
            modal.style.display = 'none';
        }
    },

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

    showLoading(show) {
        const tbody = document.getElementById('playersTableBody');
        if (tbody && show) {
            tbody.innerHTML = '<tr><td colspan="15" class="loading-cell">Loading players...</td></tr>';
        }
    },

    showError(message) {
        this.showMessage(message, 'error');
    },

    showMessage(message, type = 'info') {
        // Create message element if it doesn't exist
        let messageEl = document.querySelector('.message');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.className = 'message';
            document.querySelector('.players-container').insertBefore(messageEl, document.querySelector('.stats-grid'));
        }

        messageEl.textContent = message;
        messageEl.className = `message ${type} show`;

        setTimeout(() => {
            messageEl.classList.remove('show');
        }, 3000);
    },

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
};

// Make PlayersTab globally accessible
window.PlayersTab = PlayersTab;
