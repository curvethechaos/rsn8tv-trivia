// components/utils.js - Utility functions

window.dashboardUtils = {
    formatDate: (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString();
    },

    formatDateTime: (date) => {
        if (!date) return '-';
        return new Date(date).toLocaleString();
    },

    formatNumber: (num) => {
        if (num === null || num === undefined) return '0';
        return num.toLocaleString();
    },

    escapeHtml: (text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    truncateText: (text, maxLength) => {
        if (!text) return '';
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    downloadBlob: (blob, filename) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    },

    downloadCSV: (data, filename) => {
        const blob = new Blob([data], { type: 'text/csv' });
        dashboardUtils.downloadBlob(blob, filename);
    },

    copyToClipboard: async (text) => {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Copied to clipboard', 'success');
        } catch (err) {
            showToast('Failed to copy to clipboard', 'error');
        }
    }
};
