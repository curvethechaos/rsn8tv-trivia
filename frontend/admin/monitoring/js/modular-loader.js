// Modular Dashboard Loader - ES6 Version with Flexible Naming
// Path: /var/www/html/admin/monitoring/js/modular-loader.js

// Set up globals BEFORE the IIFE to ensure they're available everywhere
window.API_BASE = window.API_BASE || 'https://trivia.rsn8tv.com/api';
window.authToken = window.authToken || localStorage.getItem('authToken');
window.refreshToken = window.refreshToken || localStorage.getItem('refreshToken');

console.log('[Modular] Initial globals:', {
    API_BASE: window.API_BASE,
    authToken: window.authToken ? 'exists' : 'missing',
    refreshToken: window.refreshToken ? 'exists' : 'missing'
});

(function() {
    'use strict';

    let currentTab = null;
    const loadedTabs = new Set();
    let isLoading = false;
    let autoRefreshInterval = null;

    // Add class to body for CSS targeting
    document.body.classList.add('modular-active');

    // Override the switchTab function
    window.switchTab = async function(tabName) {
        // Prevent multiple simultaneous loads
        if (isLoading) {
            console.log('[Modular] Already loading a tab, please wait...');
            return;
        }

        console.log('[Modular] Loading tab:', tabName);
        isLoading = true;

        try {
            // Clean up previous tab
            if (currentTab) {
                const prevModule = findModule(currentTab);
                if (prevModule && typeof prevModule.cleanup === 'function') {
                    console.log('[Modular] Cleaning up:', currentTab);
                    await prevModule.cleanup();
                }
            }

            // Update navigation
            updateNavigation(tabName);

            // Get container
            const container = document.getElementById('modular-tab-content');
            if (!container) {
                throw new Error('Container #modular-tab-content not found');
            }

            // Show loading state
            showLoading(container, tabName);

            // Load tab resources
            await loadTabCSS(tabName);
            const html = await loadTabHTML(tabName);
            container.innerHTML = html;

            // Load and initialize JavaScript module
            await loadTabJS(tabName);

            // Initialize the module (try both naming conventions)
            const module = findModule(tabName);

            if (module && typeof module.init === 'function') {
                console.log('[Modular] Initializing module for:', tabName);
                await module.init();
            } else {
                console.error(`[Modular] Module for ${tabName} not found or has no init method`);
                console.log('[Modular] Tried both naming conventions:');
                console.log(`  - PascalCase: window.${getModuleName(tabName)}`);
                console.log(`  - camelCase: window.${getCamelCaseModuleName(tabName)}`);
                console.log('[Modular] Available modules:', Object.keys(window).filter(key => key.endsWith('Tab')).sort());
            }

            currentTab = tabName;
            window.location.hash = tabName;

        } catch (error) {
            console.error('[Modular] Tab loading error:', error);
            const container = document.getElementById('modular-tab-content');
            if (container) {
                showError(container, tabName, error);
            }
        } finally {
            isLoading = false;
        }
    };

    // Helper function to find module with flexible naming
    const findModule = (tabName) => {
        const pascalCaseName = getModuleName(tabName);
        const camelCaseName = getCamelCaseModuleName(tabName);
        
        // Try PascalCase first (e.g., MonitoringTab)
        if (window[pascalCaseName]) {
            console.log(`[Modular] Found PascalCase module: ${pascalCaseName}`);
            return window[pascalCaseName];
        }
        
        // Try camelCase (e.g., monitoringTab)
        if (window[camelCaseName]) {
            console.log(`[Modular] Found camelCase module: ${camelCaseName}`);
            return window[camelCaseName];
        }
        
        return null;
    };

    // Get PascalCase module name from tab name
    const getModuleName = (tabName) => {
        return tabName
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join('') + 'Tab';
    };

    // Get camelCase module name from tab name
    const getCamelCaseModuleName = (tabName) => {
        const parts = tabName.split('-');
        return parts[0] + parts.slice(1).map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('') + 'Tab';
    };

    // Update navigation buttons
    const updateNavigation = (tabName) => {
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.classList.remove('active');
            const btnTabName = btn.textContent.toLowerCase().replace(/\s+/g, '-');
            if (btnTabName === tabName) {
                btn.classList.add('active');
            }
        });
    };

    // Show loading state
    const showLoading = (container, tabName) => {
        const displayName = tabName.charAt(0).toUpperCase() + tabName.slice(1).replace(/-/g, ' ');
        container.innerHTML = `
            <div class="tab-loading">
                <div class="spinner"></div>
                <h3>Loading ${displayName}...</h3>
            </div>
        `;
    };

    // Show error state
    const showError = (container, tabName, error) => {
        const displayName = tabName.charAt(0).toUpperCase() + tabName.slice(1).replace(/-/g, ' ');
        container.innerHTML = `
            <div class="tab-error">
                <h3>Error Loading ${displayName}</h3>
                <p>${error.message || 'Unknown error occurred'}</p>
                <details style="margin-top: 20px;">
                    <summary style="cursor: pointer;">Technical Details</summary>
                    <pre style="text-align: left; background: rgba(0,0,0,0.3); padding: 10px; border-radius: 5px; overflow-x: auto; margin-top: 10px;">
${error.stack || 'No stack trace available'}

Tried module names:
- PascalCase: window.${getModuleName(tabName)}
- camelCase: window.${getCamelCaseModuleName(tabName)}
                    </pre>
                </details>
                <button class="btn btn-primary" onclick="switchTab('${tabName}')" style="margin-top: 20px;">
                    Retry
                </button>
            </div>
        `;
    };

    // Load tab CSS
    const loadTabCSS = async (tabName) => {
        const cssId = `${tabName}-module-css`;
        if (!document.getElementById(cssId)) {
            const css = document.createElement('link');
            css.id = cssId;
            css.rel = 'stylesheet';
            css.href = `/admin/monitoring/tabs/${tabName}/${tabName}.css`;
            document.head.appendChild(css);
            console.log('[Modular] Loading CSS:', css.href);

            // Wait for CSS to load
            await new Promise((resolve) => {
                css.onload = resolve;
                css.onerror = () => {
                    console.warn(`[Modular] CSS failed to load: ${css.href}`);
                    resolve(); // Continue anyway
                };
            });
        }
    };

    // Load tab HTML
    const loadTabHTML = async (tabName) => {
        const url = `/admin/monitoring/tabs/${tabName}/${tabName}.html`;

        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load ${tabName}.html (${response.status} ${response.statusText})`);
            }
            const html = await response.text();
            console.log(`[Modular] HTML loaded: ${url} (${html.length} bytes)`);
            return html;
        } catch (error) {
            console.error(`[Modular] Failed to fetch HTML: ${url}`, error);
            throw error;
        }
    };

    // Load tab JavaScript
    const loadTabJS = async (tabName) => {
        const pascalCaseName = getModuleName(tabName);
        const camelCaseName = getCamelCaseModuleName(tabName);

        // Skip if already loaded (check both naming conventions)
        if (window[pascalCaseName] || window[camelCaseName] || loadedTabs.has(tabName)) {
            console.log(`[Modular] Module for ${tabName} already loaded`);
            return;
        }

        const scriptUrl = `/admin/monitoring/tabs/${tabName}/${tabName}.js`;

        return new Promise((resolve, reject) => {
            const scriptElement = document.createElement('script');
            scriptElement.src = scriptUrl;
            scriptElement.dataset.tabModule = tabName;
            scriptElement.type = 'text/javascript';

            scriptElement.onload = () => {
                loadedTabs.add(tabName);
                console.log(`[Modular] JS loaded: ${scriptUrl}`);

                // Verify the module was actually created (check both naming conventions)
                const module = findModule(tabName);
                if (!module) {
                    console.error(`[Modular] ERROR: Module not found after loading ${tabName}.js`);
                    console.log('[Modular] Expected one of:');
                    console.log(`  - PascalCase: window.${pascalCaseName} = { init: function() { ... } }`);
                    console.log(`  - camelCase: window.${camelCaseName} = { init: function() { ... } }`);
                    console.log('[Modular] Available modules:', Object.keys(window).filter(key => key.endsWith('Tab')).sort());
                }

                resolve();
            };

            scriptElement.onerror = () => {
                const error = new Error(`Failed to load ${scriptUrl}`);
                console.error('[Modular]', error);
                reject(error);
            };

            document.body.appendChild(scriptElement);
        });
    };

    // Setup auto-refresh for current games
    const setupAutoRefresh = () => {
        // Clear any existing interval
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        // Set up new interval
        autoRefreshInterval = setInterval(() => {
            if (currentTab === 'current-games') {
                const module = findModule('current-games');
                if (module && typeof module.loadCurrentGames === 'function') {
                    console.log('[Modular] Auto-refreshing current games...');
                    module.loadCurrentGames();
                } else if (module && typeof module.refresh === 'function') {
                    console.log('[Modular] Auto-refreshing current games...');
                    module.refresh();
                }
            }
        }, 5000); // Refresh every 5 seconds
    };

    // Initialize the modular system
    const initialize = () => {
        console.log('[Modular] Initializing dashboard v2.1.0 with flexible naming support');
        console.log('[Modular] Debug tools available at window.modularDashboard');

        // Load initial tab based on URL hash or default
        const initialTab = window.location.hash.slice(1) || 'monitoring';
        console.log('[Modular] Initial tab:', initialTab);

        // Handle tab button clicks
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const tabName = btn.textContent.toLowerCase().replace(/\s+/g, '-');
                switchTab(tabName);
            });
        });

        // Load initial tab
        switchTab(initialTab);

        // Setup auto-refresh
        setupAutoRefresh();

        // Handle browser back/forward
        window.addEventListener('hashchange', () => {
            const tab = window.location.hash.slice(1);
            if (tab && tab !== currentTab) {
                switchTab(tab);
            }
        });
    };

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM is already loaded
        setTimeout(initialize, 0);
    }

    // Export utilities for debugging
    window.modularDashboard = {
        getCurrentTab: () => currentTab,
        getLoadedTabs: () => Array.from(loadedTabs),
        reload: () => currentTab && switchTab(currentTab),

        listModules: () => {
            const modules = Object.keys(window).filter(key => key.endsWith('Tab')).sort();
            console.log('=== Available Tab Modules ===');
            console.log('Module Name | Has init() | Naming Style');
            console.log('------------|------------|-------------');
            modules.forEach(module => {
                const hasInit = window[module] && typeof window[module].init === 'function';
                const isCapitalized = module[0] === module[0].toUpperCase();
                const style = isCapitalized ? 'PascalCase' : 'camelCase';
                console.log(`${module.padEnd(20)} | ${hasInit ? '✓' : '✗'}          | ${style}`);
            });
            return modules;
        },

        debugModules: () => {
            const tabs = [
                'monitoring', 'current-games', 'players', 'leaderboards',
                'theme', 'branding', 'questions', 'analytics',
                'venues', 'prizes', 'schedule', 'marketing', 'api', 'settings'
            ];
            
            console.log('=== Module Status Check ===');
            console.log('Tab Name | PascalCase | camelCase | Status');
            console.log('---------|------------|-----------|-------');
            
            tabs.forEach(tabName => {
                const pascalCase = getModuleName(tabName);
                const camelCase = getCamelCaseModuleName(tabName);
                
                const hasPascal = window[pascalCase] !== undefined;
                const hasCamel = window[camelCase] !== undefined;
                
                let status = '❌ Not loaded';
                if (hasPascal && hasCamel) {
                    status = '⚠️  Both exist!';
                } else if (hasPascal) {
                    status = '✅ PascalCase';
                } else if (hasCamel) {
                    status = '✅ camelCase';
                }
                
                console.log(`${tabName.padEnd(15)} | ${hasPascal ? '✓' : '✗'} | ${hasCamel ? '✓' : '✗'} | ${status}`);
            });
        },

        checkModule: (tabName) => {
            const pascalCaseName = getModuleName(tabName);
            const camelCaseName = getCamelCaseModuleName(tabName);
            const module = findModule(tabName);

            console.log(`=== Checking module for tab: ${tabName} ===`);
            console.log(`PascalCase name: ${pascalCaseName} - Exists: ${!!window[pascalCaseName]}`);
            console.log(`camelCase name: ${camelCaseName} - Exists: ${!!window[camelCaseName]}`);
            console.log(`Module found: ${!!module}`);

            if (module) {
                console.log(`Has init method: ${typeof module.init === 'function'}`);
                console.log('Module methods:', Object.keys(module).filter(key => typeof module[key] === 'function'));
            }

            return !!module;
        },

        debugTab: (tabName) => {
            console.log(`=== Debug info for tab: ${tabName} ===`);
            console.log(`Tab name: ${tabName}`);
            console.log(`Expected modules:`);
            console.log(`  - PascalCase: ${getModuleName(tabName)}`);
            console.log(`  - camelCase: ${getCamelCaseModuleName(tabName)}`);
            console.log(`CSS URL: /admin/monitoring/tabs/${tabName}/${tabName}.css`);
            console.log(`HTML URL: /admin/monitoring/tabs/${tabName}/${tabName}.html`);
            console.log(`JS URL: /admin/monitoring/tabs/${tabName}/${tabName}.js`);
            console.log(`Is loaded: ${loadedTabs.has(tabName)}`);
            console.log(`Is current: ${currentTab === tabName}`);
            
            const module = findModule(tabName);
            if (module) {
                console.log(`Module found using: ${window[getModuleName(tabName)] ? 'PascalCase' : 'camelCase'}`);
            }
        },

        forceReload: async (tabName) => {
            console.log(`[Modular] Force reloading tab: ${tabName}`);
            // Remove from loaded tabs
            loadedTabs.delete(tabName);
            // Remove the module (both naming conventions)
            const pascalCaseName = getModuleName(tabName);
            const camelCaseName = getCamelCaseModuleName(tabName);
            delete window[pascalCaseName];
            delete window[camelCaseName];
            // Remove the script tag
            const existingScript = document.querySelector(`script[data-tab-module="${tabName}"]`);
            if (existingScript) {
                existingScript.remove();
            }
            // Reload
            await switchTab(tabName);
        },

        version: '2.1.0'
    };

    console.log('[Modular] Loader ready. Use modularDashboard.debugModules() to check all modules.');

})();
