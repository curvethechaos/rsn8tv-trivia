// components/navigation.js - Tab navigation management

class TabNavigation {
    constructor(apiManager) {
        this.api = apiManager;
        this.tabs = [
            { id: 'monitoring', label: 'Monitoring', icon: '📊' },
            { id: 'current-games', label: 'Current Games', icon: '🎮' },
            { id: 'players', label: 'Players', icon: '👥' },
            { id: 'questions', label: 'Questions', icon: '❓' },
            { id: 'leaderboards', label: 'Leaderboards', icon: '🏆' },
            { id: 'prizes', label: 'Prizes', icon: '🎁' },
            { id: 'theme', label: 'Theme Editor', icon: '🎨' },
            { id: 'branding', label: 'Branding', icon: '🏷️' },
            { id: 'analytics', label: 'Analytics', icon: '📈' },
            { id: 'venues', label: 'Venues', icon: '📍' },
            { id: 'schedule', label: 'Schedule', icon: '📅' },
            { id: 'marketing', label: 'Marketing', icon: '📧' },
            { id: 'api', label: 'API', icon: '🔌' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
        ];
        
        this.currentTab = null;
        this.loadedTabs = new Map();
        this.tabInstances = new Map();
    }

    async init() {
        this.renderNavigation();
        
        const initialTab = window.location.hash.slice(1) || 'monitoring';
        await this.switchTab(initialTab);

        window.addEventListener('popstate', () => {
            const tab = window.location.hash.slice(1) || 'monitoring';
            if (tab !== this.currentTab) {
                this.switchTab(tab);
            }
        });
    }

    renderNavigation() {
        const nav = document.getElementById('tabNavigation');
        nav.innerHTML = this.tabs.map(tab => `
            <button class="tab-button" 
                    data-tab="${tab.id}"
                    onclick="dashboard.modules.navigation.switchTab('${tab.id}')"
                    title="${tab.label}">
                <span class="tab-icon">${tab.icon}</span>
                <span class="tab-label">${tab.label}</span>
            </button>
        `).join('');
    }

    async switchTab(tabId) {
        if (!this.tabs.find(t => t.id === tabId)) {
            console.error(`Tab ${tabId} not found`);
            return;
        }

        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        if (this.currentTab && this.tabInstances.has(this.currentTab)) {
            const prevInstance = this.tabInstances.get(this.currentTab);
            if (prevInstance && prevInstance.cleanup) {
                prevInstance.cleanup();
            }
        }

        this.currentTab = tabId;
        window.location.hash = tabId;
        
        await this.loadTab(tabId);
    }

    async loadTab(tabId) {
        const container = document.getElementById('tabContent');
        
        try {
            container.innerHTML = `
                <div class="tab-loading">
                    <div class="spinner"></div>
                    <p>Loading ${tabId}...</p>
                </div>
            `;

            if (!this.loadedTabs.has(tabId)) {
                await this.loadTabModule(tabId);
            }

            const htmlResponse = await fetch(`tabs/${tabId}/${tabId}.html`);
            if (!htmlResponse.ok) {
                throw new Error(`Failed to load ${tabId} HTML`);
            }
            
            const html = await htmlResponse.text();
            container.innerHTML = html;

            const TabClass = this.loadedTabs.get(tabId);
            if (TabClass) {
                const instance = new TabClass(this.api);
                this.tabInstances.set(tabId, instance);
                
                // Make instance globally available for onclick handlers
                window[`${tabId}Tab`] = instance;
                
                if (instance.init) {
                    await instance.init();
                }
            }

        } catch (error) {
            console.error(`Error loading tab ${tabId}:`, error);
            container.innerHTML = `
                <div class="tab-error">
                    <h3>Failed to load ${tabId}</h3>
                    <p>${error.message}</p>
                    <button class="btn" onclick="dashboard.modules.navigation.reloadCurrentTab()">
                        Retry
                    </button>
                </div>
            `;
        }
    }

    async loadTabModule(tabId) {
        if (!document.getElementById(`${tabId}-css`)) {
            const cssLink = document.createElement('link');
            cssLink.rel = 'stylesheet';
            cssLink.href = `tabs/${tabId}/${tabId}.css`;
            cssLink.id = `${tabId}-css`;
            document.head.appendChild(cssLink);
        }

        try {
            // Use dynamic import with relative path
            const script = document.createElement('script');
            script.type = 'module';
            script.id = `${tabId}-js`;
            
            const response = await fetch(`tabs/${tabId}/${tabId}.js`);
            const jsText = await response.text();
            
            // Create a blob URL for the module
            const blob = new Blob([jsText], { type: 'application/javascript' });
            const blobUrl = URL.createObjectURL(blob);
            
            const module = await import(blobUrl);
            URL.revokeObjectURL(blobUrl);
            
            const TabClass = module.default || module[`${this.capitalize(tabId)}Tab`];
            
            if (TabClass) {
                this.loadedTabs.set(tabId, TabClass);
            } else {
                console.warn(`No class found for ${tabId} tab`);
            }
        } catch (error) {
            console.error(`Failed to load ${tabId} module:`, error);
        }
    }

    reloadCurrentTab() {
        if (this.currentTab) {
            this.switchTab(this.currentTab);
        }
    }

    getCurrentTab() {
        return this.currentTab;
    }

    getTabInstance(tabId) {
        return this.tabInstances.get(tabId);
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}
