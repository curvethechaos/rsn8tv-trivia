// dashboard.js - Simplified for integrated auth

class Dashboard {
    constructor() {
        this.initialized = false;
        this.modules = {
            auth: window.auth, // Use the global auth from dashboard.html
            navigation: null,
            api: null
        };
    }

    async init() {
        try {
            console.log('Initializing dashboard modules...');
            
            // Auth is already handled by dashboard.html
            
            // Initialize API module with auth
            this.modules.api = new APIManager(this.modules.auth);
            
            // Initialize navigation
            this.modules.navigation = new TabNavigation(this.modules.api);
            await this.modules.navigation.init();

            // Remove initial loading screen
            document.querySelector('.initial-loading').style.display = 'none';
            
            this.initialized = true;
            console.log('Dashboard initialized successfully');

        } catch (error) {
            console.error('Dashboard initialization failed:', error);
            showToast('Failed to initialize dashboard', 'error');
        }
    }

    reloadCurrentTab() {
        if (this.modules.navigation) {
            this.modules.navigation.reloadCurrentTab();
        }
    }

    switchToTab(tabId) {
        if (this.modules.navigation) {
            this.modules.navigation.switchTab(tabId);
        }
    }
}

// Create global dashboard instance
window.dashboard = new Dashboard();
