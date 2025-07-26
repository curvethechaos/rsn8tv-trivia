// For leaderboards.js - similar pattern
(function() {
    'use strict';
    
    window.leaderboardsTab = {
        currentPeriod: 'weekly',
        
        init: function() {
            console.log('Leaderboards tab initializing...');
            this.setupEventListeners();
            this.loadLeaderboard();
        },
        
        setupEventListeners: function() {
            const periodSelect = document.getElementById('leaderboard-period');
            if (periodSelect) {
                periodSelect.addEventListener('change', (e) => {
                    this.currentPeriod = e.target.value;
                    this.loadLeaderboard();
                });
            }
        },
        
        loadLeaderboard: async function() {
            try {
                const tbody = document.getElementById('leaderboard-table-body');
                if (!tbody) return;
                
                tbody.innerHTML = '<tr><td colspan="5" class="loading">Loading leaderboard...</td></tr>';
                
                const response = await fetch(`${API_BASE}/leaderboards?period=${this.currentPeriod}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (!response.ok) throw new Error('Failed to load leaderboard');
                
                const data = await response.json();
                this.renderLeaderboard(data);
                
            } catch (error) {
                console.error('Error loading leaderboard:', error);
                this.showError('Failed to load leaderboard');
            }
        },
        
        renderLeaderboard: function(data) {
            const tbody = document.getElementById('leaderboard-table-body');
            if (!tbody || !data.leaderboard) return;
            
            if (data.leaderboard.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No entries yet</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.leaderboard.map(entry => `
                <tr class="${entry.rank === 1 ? 'current-winner' : ''}">
                    <td>${entry.rank}</td>
                    <td>${entry.nickname}</td>
                    <td>${entry.totalScore}</td>
                    <td>${entry.gamesPlayed}</td>
                    <td>${entry.averageScore.toFixed(1)}</td>
                </tr>
            `).join('');
            
            // Update period info
            if (data.currentPeriod) {
                const info = document.getElementById('current-winner-info');
                if (info) {
                    const start = new Date(data.currentPeriod.start).toLocaleDateString();
                    const end = new Date(data.currentPeriod.end).toLocaleDateString();
                    info.innerHTML = `<p>Current ${this.currentPeriod} period: ${start} - ${end}</p>`;
                }
            }
        },
        
        exportLeaderboard: function() {
            window.location.href = `${API_BASE}/admin/exports/leaderboard?period=${this.currentPeriod}&token=${authToken}`;
        },
        
        showError: function(message) {
            const tbody = document.getElementById('leaderboard-table-body');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="5" class="error" style="text-align: center; color: #ff5252;">${message}</td></tr>`;
            }
        },
        
        cleanup: function() {
            // Cleanup if needed
        }
    };
})();
