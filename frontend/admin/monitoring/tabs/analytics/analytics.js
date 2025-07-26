(function() {
    'use strict';
    
    window.analyticsTab = {
        dateRange: 'week',
        charts: {},
        
        init() {
            console.log('Analytics tab initialized');
            this.loadAnalytics();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('analytics-date-range')?.addEventListener('change', (e) => {
                this.dateRange = e.target.value;
                this.loadAnalytics();
            });
        },
        
        async loadAnalytics() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/analytics?range=${this.dateRange}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.displayAnalytics(data);
                }
            } catch (error) {
                console.error('Error loading analytics:', error);
            }
        },
        
        displayAnalytics(data) {
            // Display summary stats
            document.getElementById('total-games-played').textContent = data.totalGames || 0;
            document.getElementById('unique-players').textContent = data.uniquePlayers || 0;
            document.getElementById('avg-game-duration').textContent = data.avgDuration || '0:00';
            document.getElementById('conversion-rate').textContent = (data.conversionRate * 100).toFixed(1) + '%';
            
            // Update charts
            this.updateGameTrendChart(data.gameTrend);
            this.updateVenueChart(data.venueStats);
            this.updateHourlyChart(data.hourlyDistribution);
        },
        
        updateGameTrendChart(trendData) {
            const canvas = document.getElementById('game-trend-chart');
            if (!canvas) return;
            
            // Simple chart rendering (would use Chart.js in production)
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Draw trend line
            ctx.beginPath();
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 2;
            
            const maxValue = Math.max(...trendData.map(d => d.count));
            const xStep = canvas.width / (trendData.length - 1);
            
            trendData.forEach((point, index) => {
                const x = index * xStep;
                const y = canvas.height - (point.count / maxValue * canvas.height);
                
                if (index === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });
            
            ctx.stroke();
        },
        
        updateVenueChart(venueData) {
            const container = document.getElementById('venue-stats-container');
            if (!container) return;
            
            container.innerHTML = venueData.map(venue => `
                <div class="venue-stat-item">
                    <div class="venue-name">${venue.name}</div>
                    <div class="venue-bar" style="width: ${venue.percentage}%"></div>
                    <div class="venue-count">${venue.games} games</div>
                </div>
            `).join('');
        },
        
        updateHourlyChart(hourlyData) {
            const container = document.getElementById('hourly-distribution');
            if (!container) return;
            
            const maxCount = Math.max(...hourlyData.map(h => h.count));
            
            container.innerHTML = hourlyData.map(hour => `
                <div class="hour-bar" style="height: ${(hour.count / maxCount) * 100}%">
                    <span class="hour-label">${hour.hour}:00</span>
                </div>
            `).join('');
        },
        
        async exportAnalytics() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/analytics/export?range=${this.dateRange}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `analytics-${this.dateRange}.csv`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                }
            } catch (error) {
                console.error('Error exporting analytics:', error);
            }
        },
        
        cleanup() {
            // Clean up charts if needed
        }
    };
})();
