// components/sorting.js - Multi-column sorting system

class MultiColumnSort {
    constructor(tableId, fetchDataFunction, renderDataFunction) {
        this.tableId = tableId;
        this.fetchData = fetchDataFunction;
        this.renderData = renderDataFunction;
        this.sortState = [];
        this.data = [];
    }

    init() {
        const table = document.querySelector(`#${this.tableId}`);
        if (!table) {
            setTimeout(() => this.init(), 500);
            return;
        }

        const headers = table.querySelectorAll('th.sortable');
        
        headers.forEach((header) => {
            if (!header.querySelector('.sort-indicator')) {
                const indicator = document.createElement('span');
                indicator.className = 'sort-indicator';
                header.appendChild(indicator);
            }
            
            header.addEventListener('click', (e) => this.handleSort(e));
        });

        if (!document.querySelector(`#${this.tableId}-sort-info`)) {
            const infoContainer = document.createElement('div');
            infoContainer.id = `${this.tableId}-sort-info`;
            infoContainer.className = 'sort-info';
            infoContainer.style.display = 'none';
            table.parentNode.insertBefore(infoContainer, table);
        }
    }

    handleSort(event) {
        const column = event.currentTarget.dataset.column;
        const isShiftKey = event.shiftKey;

        if (!isShiftKey) {
            const existingSort = this.sortState.find(s => s.column === column);
            if (existingSort && this.sortState[0].column === column) {
                this.sortState[0].direction = existingSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortState = this.sortState.filter(s => s.column !== column);
                this.sortState.unshift({ column, direction: 'asc' });
            }
        } else {
            const existingIndex = this.sortState.findIndex(s => s.column === column);
            if (existingIndex !== -1) {
                this.sortState[existingIndex].direction = 
                    this.sortState[existingIndex].direction === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortState.push({ column, direction: 'asc' });
            }
        }

        this.updateUI();
        this.applySortAndRender();
    }

    clearSort() {
        this.sortState = [];
        this.updateUI();
        this.applySortAndRender();
    }

    updateUI() {
        const table = document.querySelector(`#${this.tableId}`);
        if (!table) return;

        table.querySelectorAll('.sort-indicator').forEach(indicator => {
            indicator.innerHTML = '';
        });

        this.sortState.forEach((sort, index) => {
            const header = table.querySelector(`.sortable[data-column="${sort.column}"]`);
            if (header) {
                const indicator = header.querySelector('.sort-indicator');
                if (indicator) {
                    const arrow = sort.direction === 'asc' ? '▲' : '▼';
                    const priority = this.sortState.length > 1 ? `<span class="sort-priority">${index + 1}</span>` : '';
                    indicator.innerHTML = `${priority}<span class="sort-arrow">${arrow}</span>`;
                }
            }
        });

        this.updateSortInfo();
    }

    updateSortInfo() {
        const infoContainer = document.querySelector(`#${this.tableId}-sort-info`);
        if (!infoContainer) return;

        if (this.sortState.length > 0) {
            const sortDescriptions = this.sortState.map((sort, index) => 
                `${index + 1}. ${this.getColumnDisplayName(sort.column)} (${sort.direction === 'asc' ? 'A→Z' : 'Z→A'})`
            ).join(', ');
            
            infoContainer.innerHTML = `
                <span class="sort-info-text">Sorted by: ${sortDescriptions}</span>
                <button onclick="window.sorters['${this.tableId}'].clearSort()" class="btn btn-sm">Clear Sort</button>
            `;
            infoContainer.style.display = 'flex';
        } else {
            infoContainer.style.display = 'none';
        }
    }

    getColumnDisplayName(column) {
        // Override in subclasses for custom names
        return column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, ' ');
    }

    async applySortAndRender() {
        try {
            const data = await this.fetchData();
            this.data = data;
            const sortedData = this.multiColumnSort(this.data);
            this.renderData(sortedData);
        } catch (error) {
            console.error('Error applying sort:', error);
        }
    }

    multiColumnSort(data) {
        if (this.sortState.length === 0) return data;

        return [...data].sort((a, b) => {
            for (const sort of this.sortState) {
                let aVal = this.getValue(a, sort.column);
                let bVal = this.getValue(b, sort.column);

                if (typeof aVal === 'string') aVal = aVal.toLowerCase();
                if (typeof bVal === 'string') bVal = bVal.toLowerCase();

                let comparison = 0;
                if (aVal < bVal) comparison = -1;
                else if (aVal > bVal) comparison = 1;

                if (comparison !== 0) {
                    return sort.direction === 'asc' ? comparison : -comparison;
                }
            }
            return 0;
        });
    }

    getValue(obj, column) {
        if (column.includes('.')) {
            const parts = column.split('.');
            let value = obj;
            for (const part of parts) {
                value = value?.[part];
            }
            return value;
        }
        return obj[column];
    }
}

// Global sorters registry
window.sorters = {};
