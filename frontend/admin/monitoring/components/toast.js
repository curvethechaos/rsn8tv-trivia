// components/toast.js - Toast notification system

class ToastManager {
    constructor() {
        this.container = null;
        this.init();
    }

    init() {
        this.container = document.getElementById('toastContainer');
        if (!this.container) {
            console.warn('Toast container not found');
        }
    }

    show(message, type = 'info', duration = 3000) {
        if (!this.container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        const icon = this.getIcon(type);
        
        toast.innerHTML = `
            <div class="toast-icon">${icon}</div>
            <div class="toast-message">${message}</div>
            <button class="toast-close" onclick="this.parentElement.remove()">×</button>
        `;

        this.container.appendChild(toast);

        setTimeout(() => toast.classList.add('show'), 10);

        if (duration > 0) {
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }
}

const toastManager = new ToastManager();

window.showToast = (message, type, duration) => {
    toastManager.show(message, type, duration);
};
