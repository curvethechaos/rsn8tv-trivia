(function() {
    'use strict';
    
    window.currentGamesTab = {
        games: [],
        refreshInterval: null,
        selectedGame: null,
        
        init() {
            console.log('Current Games tab initialized');
            this.loadCurrentGames();
            this.startAutoRefresh();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('refresh-games-btn')?.addEventListener('click', () => {
                this.loadCurrentGames();
            });
            
            document.getElementById('auto-refresh-toggle')?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        },
        
        startAutoRefresh() {
            this.refreshInterval = setInterval(() => {
                this.loadCurrentGames();
            }, 5000); // Refresh every 5 seconds
        },
        
        stopAutoRefresh() {
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
                this.refreshInterval = null;
            }
        },
        
        async loadCurrentGames() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/current-games`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.games = await response.json();
                    this.displayGames();
                    this.updateStats();
                }
            } catch (error) {
                console.error('Error loading current games:', error);
            }
        },
        
        displayGames() {
            const container = document.getElementById('current-games-grid');
            if (!container) return;
            
            if (this.games.length === 0) {
                container.innerHTML = '<div class="no-games">No active games</div>';
                return;
            }
            
            container.innerHTML = this.games.map(game => `
                <div class="game-card ${game.status}" data-game-id="${game.id}">
                    <div class="game-header">
                        <h3>Room ${game.room_code}</h3>
                        <span class="game-status">${game.status}</span>
                    </div>
                    <div class="game-info">
                        <p>Venue: ${game.venue_name || 'Unknown'}</p>
                        <p>Device: ${game.xibo_display_id || 'Not linked'}</p>
                        <p>Players: ${game.player_count}/${game.max_players}</p>
                        <p>Round: ${game.current_round}/${game.total_rounds}</p>
                        <p>Question: ${game.current_question}/${game.questions_per_round}</p>
                        <p>Started: ${new Date(game.started_at).toLocaleTimeString()}</p>
                    </div>
                    <div class="game-actions">
                        <button onclick="currentGamesTab.viewGameDetails('${game.id}')">View Details</button>
                        <button onclick="currentGamesTab.endGame('${game.id}')" class="danger">End Game</button>
                    </div>
                </div>
            `).join('');
        },
        
        updateStats() {
            document.getElementById('total-active-games').textContent = this.games.length;
            document.getElementById('total-active-players').textContent = 
                this.games.reduce((sum, game) => sum + game.player_count, 0);
            
            const venueCount = new Set(this.games.map(g => g.venue_name)).size;
            document.getElementById('active-venues').textContent = venueCount;
        },
        
        async viewGameDetails(gameId) {
            this.selectedGame = gameId;
            const authToken = localStorage.getItem('authToken');
            
            try {
                const response = await fetch(`${API_BASE}/admin/current-games/${gameId}/players`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const players = await response.json();
                    this.showGameModal(gameId, players);
                }
            } catch (error) {
                console.error('Error loading game details:', error);
            }
        },
        
        showGameModal(gameId, players) {
            const game = this.games.find(g => g.id === gameId);
            if (!game) return;
            
            const modal = document.getElementById('game-details-modal');
            if (!modal) return;
            
            const modalContent = document.getElementById('game-details-content');
            modalContent.innerHTML = `
                <h2>Game ${game.room_code} Details</h2>
                <div class="game-details-info">
                    <p><strong>Status:</strong> ${game.status}</p>
                    <p><strong>Venue:</strong> ${game.venue_name}</p>
                    <p><strong>Started:</strong> ${new Date(game.started_at).toLocaleString()}</p>
                    <p><strong>Duration:</strong> ${this.calculateDuration(game.started_at)} minutes</p>
                </div>
                
                <h3>Players (${players.length})</h3>
                <table class="players-table">
                    <thead>
                        <tr>
                            <th>Nickname</th>
                            <th>Score</th>
                            <th>Answers</th>
                            <th>Device ID</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${players.map(player => `
                            <tr>
                                <td>${player.nickname || 'Anonymous'}</td>
                                <td>${player.score}</td>
                                <td>${player.answers_submitted}/${game.total_questions}</td>
                                <td>${player.device_id ? player.device_id.substring(0, 8) + '...' : 'N/A'}</td>
                                <td>
                                    ${player.profile_id ? 
                                        `<button onclick="currentGamesTab.viewPlayerProfile(${player.profile_id})">Profile</button>` :
                                        'Not registered'
                                    }
                                    <button onclick="currentGamesTab.kickPlayer('${gameId}', ${player.id})">Kick</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                
                <div class="modal-actions">
                    <button onclick="currentGamesTab.exportGameData('${gameId}')">Export Data</button>
                    <button onclick="currentGamesTab.closeGameModal()">Close</button>
                </div>
            `;
            
            modal.style.display = 'block';
        },
        
        calculateDuration(startTime) {
            const start = new Date(startTime);
            const now = new Date();
            const minutes = Math.floor((now - start) / 60000);
            return minutes;
        },
        
        async viewPlayerProfile(profileId) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/player/${profileId}/details`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const profile = await response.json();
                    this.showPlayerModal(profile);
                }
            } catch (error) {
                console.error('Error loading player profile:', error);
            }
        },
        
        showPlayerModal(profile) {
            alert(`Player Profile:\n\nName: ${profile.real_name}\nEmail: ${profile.email}\nGames Played: ${profile.total_games}\nHigh Score: ${profile.high_score}`);
        },
        
        async kickPlayer(gameId, playerId) {
            if (!confirm('Are you sure you want to kick this player?')) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/current-games/${gameId}/kick/${playerId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.viewGameDetails(gameId); // Refresh the modal
                    this.showMessage('Player kicked', 'success');
                }
            } catch (error) {
                console.error('Error kicking player:', error);
            }
        },
        
        async endGame(gameId) {
            if (!confirm('Are you sure you want to end this game?')) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/current-games/${gameId}/end`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.loadCurrentGames();
                    this.showMessage('Game ended', 'success');
                }
            } catch (error) {
                console.error('Error ending game:', error);
            }
        },
        
        async exportGameData(gameId) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/current-games/${gameId}/export`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `game-${gameId}-export.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                }
            } catch (error) {
                console.error('Error exporting game data:', error);
            }
        },
        
        closeGameModal() {
            const modal = document.getElementById('game-details-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('current-games-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            this.stopAutoRefresh();
            this.closeGameModal();
        }
    };
})();
