(function() {
    'use strict';
    
    window.brandingTab = {
        uploadQueue: {},
        
        init() {
            console.log('Branding tab initialized');
            this.loadCurrentBranding();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // File upload handlers
            const fileInputs = document.querySelectorAll('input[type="file"]');
            fileInputs.forEach(input => {
                input.addEventListener('change', (e) => {
                    this.handleFileSelect(e.target);
                });
            });
        },
        
        async loadCurrentBranding() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/branding`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const branding = await response.json();
                    this.displayCurrentBranding(branding);
                }
            } catch (error) {
                console.error('Error loading branding:', error);
            }
        },
        
        displayCurrentBranding(branding) {
            // Display main logo
            if (branding.logo_url) {
                const logoPreview = document.getElementById('logo-preview');
                if (logoPreview) {
                    logoPreview.innerHTML = `<img src="${branding.logo_url}" alt="Main Logo">`;
                }
            }
            
            // Display favicon
            if (branding.favicon_url) {
                const faviconPreview = document.getElementById('favicon-preview');
                if (faviconPreview) {
                    faviconPreview.innerHTML = `<img src="${branding.favicon_url}" alt="Favicon">`;
                }
            }
            
            // Display sponsor logos
            if (branding.sponsor_logos && branding.sponsor_logos.length > 0) {
                const sponsorContainer = document.getElementById('sponsor-logos-container');
                if (sponsorContainer) {
                    sponsorContainer.innerHTML = branding.sponsor_logos.map(sponsor => `
                        <div class="sponsor-logo-item">
                            <img src="${sponsor.url}" alt="${sponsor.name}">
                            <button onclick="brandingTab.removeSponsor('${sponsor.id}')">Remove</button>
                        </div>
                    `).join('');
                }
            }
        },
        
        handleFileSelect(input) {
            const file = input.files[0];
            if (!file) return;
            
            const type = input.dataset.brandingType;
            const reader = new FileReader();
            
            reader.onload = (e) => {
                this.uploadQueue[type] = {
                    file: file,
                    preview: e.target.result
                };
                this.showPreview(type, e.target.result);
            };
            
            reader.readAsDataURL(file);
        },
        
        showPreview(type, dataUrl) {
            const previewEl = document.getElementById(`${type}-preview`);
            if (previewEl) {
                previewEl.innerHTML = `<img src="${dataUrl}" alt="${type} preview">`;
            }
        },
        
        async uploadBranding(type) {
            const authToken = localStorage.getItem('authToken');
            const queuedFile = this.uploadQueue[type];
            
            if (!queuedFile) {
                this.showMessage('No file selected', 'error');
                return;
            }
            
            const formData = new FormData();
            formData.append('file', queuedFile.file);
            formData.append('type', type);
            
            try {
                const response = await fetch(`${API_BASE}/admin/branding/${type}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: formData
                });
                
                if (response.ok) {
                    this.showMessage(`${type} uploaded successfully`, 'success');
                    delete this.uploadQueue[type];
                    this.loadCurrentBranding();
                } else {
                    this.showMessage(`Failed to upload ${type}`, 'error');
                }
            } catch (error) {
                console.error('Error uploading branding:', error);
                this.showMessage('Upload error', 'error');
            }
        },
        
        async removeSponsor(sponsorId) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/branding/sponsor/${sponsorId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.loadCurrentBranding();
                }
            } catch (error) {
                console.error('Error removing sponsor:', error);
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('branding-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            this.uploadQueue = {};
        }
    };
})();
