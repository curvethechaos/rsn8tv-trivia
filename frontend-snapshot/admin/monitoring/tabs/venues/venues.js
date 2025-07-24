(function() {
    'use strict';
    
    window.venuesTab = {
        venues: [],
        
        init() {
            console.log('Venues tab initialized');
            this.loadVenues();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('add-venue-btn')?.addEventListener('click', () => {
                this.showVenueModal();
            });
        },
        
        async loadVenues() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/venues`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.venues = await response.json();
                    this.displayVenues();
                }
            } catch (error) {
                console.error('Error loading venues:', error);
            }
        },
        
        displayVenues(venues = this.venues) {
            const container = document.getElementById('venues-grid');
            if (!container) return;
            
            container.innerHTML = venues.map(venue => `
                <div class="venue-card">
                    <h3>${venue.name}</h3>
                    <p>${venue.address}</p>
                    <p>Tablets: ${venue.tablet_count || 0}</p>
                    <p>Status: <span class="status ${venue.is_active ? 'active' : 'inactive'}">${venue.is_active ? 'Active' : 'Inactive'}</span></p>
                    <div class="venue-actions">
                        <button onclick="venuesTab.editVenue(${venue.id})">Edit</button>
                        <button onclick="venuesTab.toggleVenueStatus(${venue.id}, ${!venue.is_active})">
                            ${venue.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onclick="venuesTab.viewVenueStats(${venue.id})">Stats</button>
                    </div>
                </div>
            `).join('');
        },
        
        showVenueModal(venueId = null) {
            const modal = document.getElementById('venue-modal');
            if (!modal) return;
            
            if (venueId) {
                const venue = this.venues.find(v => v.id === venueId);
                if (venue) {
                    document.getElementById('venue-name').value = venue.name;
                    document.getElementById('venue-address').value = venue.address;
                    document.getElementById('venue-tablet-count').value = venue.tablet_count || 1;
                    document.getElementById('venue-id').value = venue.id;
                }
            } else {
                document.getElementById('venue-form').reset();
                document.getElementById('venue-id').value = '';
            }
            
            modal.style.display = 'block';
        },
        
        async saveVenue() {
            const authToken = localStorage.getItem('authToken');
            const venueId = document.getElementById('venue-id').value;
            const venueData = {
                name: document.getElementById('venue-name').value,
                address: document.getElementById('venue-address').value,
                tablet_count: parseInt(document.getElementById('venue-tablet-count').value)
            };
            
            try {
                const url = venueId 
                    ? `${API_BASE}/admin/venues/${venueId}`
                    : `${API_BASE}/admin/venues`;
                    
                const method = venueId ? 'PUT' : 'POST';
                
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(venueData)
                });
                
                if (response.ok) {
                    this.closeVenueModal();
                    this.loadVenues();
                    this.showMessage('Venue saved successfully', 'success');
                }
            } catch (error) {
                console.error('Error saving venue:', error);
                this.showMessage('Error saving venue', 'error');
            }
        },
        
        editVenue(venueId) {
            this.showVenueModal(venueId);
        },
        
        async toggleVenueStatus(venueId, activate) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/venues/${venueId}/status`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ is_active: activate })
                });
                
                if (response.ok) {
                    this.loadVenues();
                }
            } catch (error) {
                console.error('Error updating venue status:', error);
            }
        },
        
        viewVenueStats(venueId) {
            console.log('View stats for venue:', venueId);
            // Implement venue stats modal
        },
        
        closeVenueModal() {
            const modal = document.getElementById('venue-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('venue-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            this.closeVenueModal();
        }
    };
})();
