(function() {
    'use strict';
    
    window.scheduleTab = {
        schedules: [],
        
        init() {
            console.log('Schedule tab initialized');
            this.loadSchedules();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('add-schedule-btn')?.addEventListener('click', () => {
                this.showScheduleModal();
            });
            
            // Calendar view toggle
            document.getElementById('view-toggle')?.addEventListener('change', (e) => {
                this.toggleView(e.target.value);
            });
        },
        
        async loadSchedules() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/schedules`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.schedules = await response.json();
                    this.displaySchedules();
                }
            } catch (error) {
                console.error('Error loading schedules:', error);
            }
        },
        
        displaySchedules() {
            const container = document.getElementById('schedule-list');
            if (!container) return;
            
            // Group schedules by venue
            const schedulesByVenue = {};
            this.schedules.forEach(schedule => {
                if (!schedulesByVenue[schedule.venue_name]) {
                    schedulesByVenue[schedule.venue_name] = [];
                }
                schedulesByVenue[schedule.venue_name].push(schedule);
            });
            
            container.innerHTML = Object.entries(schedulesByVenue).map(([venue, schedules]) => `
                <div class="venue-schedule">
                    <h3>${venue}</h3>
                    ${schedules.map(schedule => `
                        <div class="schedule-item ${schedule.is_active ? 'active' : 'inactive'}">
                            <span>${this.formatSchedule(schedule)}</span>
                            <div class="schedule-actions">
                                <button onclick="scheduleTab.editSchedule(${schedule.id})">Edit</button>
                                <button onclick="scheduleTab.toggleSchedule(${schedule.id}, ${!schedule.is_active})">
                                    ${schedule.is_active ? 'Disable' : 'Enable'}
                                </button>
                                <button onclick="scheduleTab.deleteSchedule(${schedule.id})">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `).join('');
        },
        
        formatSchedule(schedule) {
            const days = JSON.parse(schedule.days_of_week || '[]').join(', ');
            return `${days} at ${schedule.start_time} - ${schedule.end_time}`;
        },
        
        showScheduleModal(scheduleId = null) {
            const modal = document.getElementById('schedule-modal');
            if (!modal) return;
            
            if (scheduleId) {
                const schedule = this.schedules.find(s => s.id === scheduleId);
                if (schedule) {
                    // Populate form with schedule data
                    document.getElementById('schedule-venue').value = schedule.venue_id;
                    document.getElementById('schedule-start-time').value = schedule.start_time;
                    document.getElementById('schedule-end-time').value = schedule.end_time;
                    
                    // Set days of week checkboxes
                    const days = JSON.parse(schedule.days_of_week || '[]');
                    document.querySelectorAll('input[name="days_of_week"]').forEach(checkbox => {
                        checkbox.checked = days.includes(checkbox.value);
                    });
                    
                    document.getElementById('schedule-id').value = schedule.id;
                }
            } else {
                document.getElementById('schedule-form').reset();
                document.getElementById('schedule-id').value = '';
            }
            
            modal.style.display = 'block';
        },
        
        async saveSchedule() {
            const authToken = localStorage.getItem('authToken');
            const scheduleId = document.getElementById('schedule-id').value;
            
            // Get selected days
            const days = Array.from(document.querySelectorAll('input[name="days_of_week"]:checked'))
                .map(cb => cb.value);
            
            const scheduleData = {
                venue_id: document.getElementById('schedule-venue').value,
                start_time: document.getElementById('schedule-start-time').value,
                end_time: document.getElementById('schedule-end-time').value,
                days_of_week: days
            };
            
            try {
                const url = scheduleId 
                    ? `${API_BASE}/admin/schedules/${scheduleId}`
                    : `${API_BASE}/admin/schedules`;
                    
                const method = scheduleId ? 'PUT' : 'POST';
                
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(scheduleData)
                });
                
                if (response.ok) {
                    this.closeScheduleModal();
                    this.loadSchedules();
                    this.showMessage('Schedule saved successfully', 'success');
                }
            } catch (error) {
                console.error('Error saving schedule:', error);
                this.showMessage('Error saving schedule', 'error');
            }
        },
        
        editSchedule(scheduleId) {
            this.showScheduleModal(scheduleId);
        },
        
        async toggleSchedule(scheduleId, activate) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/schedules/${scheduleId}/toggle`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ is_active: activate })
                });
                
                if (response.ok) {
                    this.loadSchedules();
                }
            } catch (error) {
                console.error('Error toggling schedule:', error);
            }
        },
        
        async deleteSchedule(scheduleId) {
            if (!confirm('Are you sure you want to delete this schedule?')) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/schedules/${scheduleId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.loadSchedules();
                    this.showMessage('Schedule deleted', 'success');
                }
            } catch (error) {
                console.error('Error deleting schedule:', error);
            }
        },
        
        closeScheduleModal() {
            const modal = document.getElementById('schedule-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        
        toggleView(view) {
            console.log('Toggle view to:', view);
            // Implement calendar/list view toggle
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('schedule-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            this.closeScheduleModal();
        }
    };
})();
