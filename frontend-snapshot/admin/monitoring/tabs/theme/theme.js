(function() {
    'use strict';
    
    window.themeTab = {
        currentTheme: {},
        previewMode: 'player',
        
        init() {
            console.log('Theme Editor tab initialized');
            this.loadCurrentTheme();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Color pickers
            document.querySelectorAll('input[type="color"]').forEach(input => {
                input.addEventListener('change', (e) => {
                    this.updateThemeProperty(e.target.name, e.target.value);
                });
            });
            
            // Preview mode toggle
            const previewToggle = document.getElementById('preview-mode');
            if (previewToggle) {
                previewToggle.addEventListener('change', (e) => {
                    this.previewMode = e.target.value;
                    this.updatePreview();
                });
            }
        },
        
        async loadCurrentTheme() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/theme`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.currentTheme = await response.json();
                    this.applyThemeToForm();
                    this.updatePreview();
                }
            } catch (error) {
                console.error('Error loading theme:', error);
            }
        },
        
        applyThemeToForm() {
            Object.entries(this.currentTheme).forEach(([key, value]) => {
                const input = document.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = value;
                }
            });
        },
        
        updateThemeProperty(property, value) {
            this.currentTheme[property] = value;
            this.updatePreview();
        },
        
        updatePreview() {
            const previewFrame = document.getElementById('theme-preview-frame');
            if (previewFrame) {
                // Update preview with current theme
                const previewDoc = previewFrame.contentDocument;
                if (previewDoc) {
                    const style = previewDoc.createElement('style');
                    style.textContent = this.generateThemeCSS();
                    previewDoc.head.appendChild(style);
                }
            }
        },
        
        generateThemeCSS() {
            return `
                :root {
                    --primary-color: ${this.currentTheme.primaryColor || '#4ade80'};
                    --secondary-color: ${this.currentTheme.secondaryColor || '#22c55e'};
                    --background-color: ${this.currentTheme.backgroundColor || '#111827'};
                    --text-color: ${this.currentTheme.textColor || '#f3f4f6'};
                    --correct-color: ${this.currentTheme.correctColor || '#4ade80'};
                    --incorrect-color: ${this.currentTheme.incorrectColor || '#ef4444'};
                }
            `;
        },
        
        async saveTheme() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/theme`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(this.currentTheme)
                });
                
                if (response.ok) {
                    this.showMessage('Theme saved successfully', 'success');
                } else {
                    this.showMessage('Failed to save theme', 'error');
                }
            } catch (error) {
                console.error('Error saving theme:', error);
                this.showMessage('Error saving theme', 'error');
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('theme-message');
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
