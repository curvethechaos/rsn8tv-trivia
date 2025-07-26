(function() {
    'use strict';
    
    window.prizesTab = {
        prizeTypes: ['weekly', 'monthly', 'quarterly', 'yearly'],
        thresholdPrize: null,
        
        init() {
            console.log('Prizes tab initialized');
            this.loadPrizes();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Time-based prize inputs
            this.prizeTypes.forEach(type => {
                const descInput = document.getElementById(`${type}-prize-description`);
                if (descInput) {
                    descInput.addEventListener('change', () => this.savePrize(type));
                }
            });
            
            // Threshold prize inputs
            document.getElementById('threshold-points')?.addEventListener('change', () => {
                this.saveThresholdPrize();
            });
        },
        
        async loadPrizes() {
            const authToken = localStorage.getItem('authToken');
            
            // Load time-based prizes
            try {
                const response = await fetch(`${API_BASE}/admin/prizes/time-based`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const prizes = await response.json();
                    this.displayTimePrizes(prizes);
                }
            } catch (error) {
                console.error('Error loading time-based prizes:', error);
            }
            
            // Load threshold prize
            try {
                const response = await fetch(`${API_BASE}/admin/prizes/threshold`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.thresholdPrize = await response.json();
                    this.displayThresholdPrize();
                }
            } catch (error) {
                console.error('Error loading threshold prize:', error);
            }
            
            // Load recent winners
            this.loadRecentWinners();
        },
        
        displayTimePrizes(prizes) {
            prizes.forEach(prize => {
                const descInput = document.getElementById(`${prize.period_type}-prize-description`);
                if (descInput) {
                    descInput.value = prize.description || '';
                }
                
                const valueInput = document.getElementById(`${prize.period_type}-prize-value`);
                if (valueInput) {
                    valueInput.value = prize.value || '';
                }
            });
        },
        
        displayThresholdPrize() {
            if (!this.thresholdPrize) return;
            
            document.getElementById('threshold-points').value = this.thresholdPrize.threshold_points || 8500;
            document.getElementById('threshold-description').value = this.thresholdPrize.description || '';
        },
        
        async savePrize(type) {
            const authToken = localStorage.getItem('authToken');
            const prizeData = {
                period_type: type,
                description: document.getElementById(`${type}-prize-description`).value,
                value: document.getElementById(`${type}-prize-value`).value
            };
            
            try {
                const response = await fetch(`${API_BASE}/admin/prizes/time-based/${type}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(prizeData)
                });
                
                if (response.ok) {
                    this.showMessage(`${type} prize updated`, 'success');
                }
            } catch (error) {
                console.error('Error saving prize:', error);
            }
        },
        
        async saveThresholdPrize() {
            const authToken = localStorage.getItem('authToken');
            const prizeData = {
                threshold_points: parseInt(document.getElementById('threshold-points').value),
                description: document.getElementById('threshold-description').value
            };
            
            try {
                const response = await fetch(`${API_BASE}/admin/prizes/threshold`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(prizeData)
                });
                
                if (response.ok) {
                    this.showMessage('Threshold prize updated', 'success');
                }
            } catch (error) {
                console.error('Error saving threshold prize:', error);
            }
        },
        
        async loadRecentWinners() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/prizes/winners?limit=10`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const winners = await response.json();
                    this.displayRecentWinners(winners);
                }
            } catch (error) {
                console.error('Error loading winners:', error);
            }
        },
        
        displayRecentWinners(winners) {
            const container = document.getElementById('recent-winners-list');
            if (!container) return;
            
            container.innerHTML = winners.map(winner => `
                <div class="winner-item">
                    <strong>${winner.nickname}</strong> - ${winner.prize_type} 
                    (${winner.score} points) - ${new Date(winner.won_at).toLocaleDateString()}
                    <button onclick="prizesTab.contactWinner(${winner.id})">Contact</button>
                </div>
            `).join('');
        },
        
        contactWinner(winnerId) {
            console.log('Contact winner:', winnerId);
            // Implement winner contact modal
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('prize-message');
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
