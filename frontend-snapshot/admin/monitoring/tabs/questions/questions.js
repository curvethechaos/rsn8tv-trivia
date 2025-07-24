(function() {
    'use strict';
    
    window.questionsTab = {
        currentPage: 1,
        pageSize: 50,
        filters: {
            difficulty: 'all',
            category: 'all',
            status: 'all',
            search: ''
        },
        
        init() {
            console.log('Questions tab initialized');
            this.loadQuestionStats();
            this.loadQuestions();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            // Filter handlers
            document.getElementById('question-difficulty')?.addEventListener('change', (e) => {
                this.filters.difficulty = e.target.value;
                this.currentPage = 1;
                this.loadQuestions();
            });
            
            document.getElementById('question-category')?.addEventListener('change', (e) => {
                this.filters.category = e.target.value;
                this.currentPage = 1;
                this.loadQuestions();
            });
            
            document.getElementById('question-search')?.addEventListener('input', (e) => {
                this.filters.search = e.target.value;
                this.currentPage = 1;
                this.loadQuestions();
            });
            
            // Import/Export handlers
            document.getElementById('import-questions')?.addEventListener('change', (e) => {
                this.handleImport(e.target.files[0]);
            });
        },
        
        async loadQuestionStats() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/questions/stats`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const stats = await response.json();
                    this.displayStats(stats);
                }
            } catch (error) {
                console.error('Error loading question stats:', error);
            }
        },
        
        displayStats(stats) {
            document.getElementById('total-questions').textContent = stats.total || 0;
            document.getElementById('flagged-questions').textContent = stats.flagged || 0;
            document.getElementById('custom-questions').textContent = stats.custom || 0;
        },
        
        async loadQuestions() {
            const authToken = localStorage.getItem('authToken');
            const params = new URLSearchParams({
                page: this.currentPage,
                limit: this.pageSize,
                difficulty: this.filters.difficulty,
                category: this.filters.category,
                status: this.filters.status,
                search: this.filters.search
            });
            
            try {
                const response = await fetch(`${API_BASE}/admin/questions?${params}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this.displayQuestions(data.questions);
                    this.updatePagination(data.totalCount);
                }
            } catch (error) {
                console.error('Error loading questions:', error);
            }
        },
        
        displayQuestions(questions) {
            const container = document.getElementById('questions-table-body');
            if (!container) return;
            
            container.innerHTML = questions.map(q => `
                <tr>
                    <td>${q.id}</td>
                    <td>${this.escapeHtml(q.question)}</td>
                    <td>${q.category}</td>
                    <td>${q.difficulty}</td>
                    <td>${q.times_used || 0}</td>
                    <td>${q.success_rate ? (q.success_rate * 100).toFixed(1) + '%' : 'N/A'}</td>
                    <td><span class="status-badge ${q.status}">${q.status}</span></td>
                    <td>
                        <button onclick="questionsTab.editQuestion(${q.id})">Edit</button>
                        <button onclick="questionsTab.toggleFlag(${q.id})">${q.status === 'flagged' ? 'Unflag' : 'Flag'}</button>
                    </td>
                </tr>
            `).join('');
        },
        
        updatePagination(total) {
            const totalPages = Math.ceil(total / this.pageSize);
            const paginationContainer = document.getElementById('questions-pagination');
            if (!paginationContainer) return;
            
            paginationContainer.innerHTML = `
                <button ${this.currentPage === 1 ? 'disabled' : ''} 
                        onclick="questionsTab.changePage(${this.currentPage - 1})">Previous</button>
                <span>Page ${this.currentPage} of ${totalPages}</span>
                <button ${this.currentPage === totalPages ? 'disabled' : ''} 
                        onclick="questionsTab.changePage(${this.currentPage + 1})">Next</button>
            `;
        },
        
        changePage(page) {
            this.currentPage = page;
            this.loadQuestions();
        },
        
        async toggleFlag(questionId) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/questions/${questionId}/flag`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.loadQuestions();
                    this.loadQuestionStats();
                }
            } catch (error) {
                console.error('Error toggling flag:', error);
            }
        },
        
        editQuestion(questionId) {
            console.log('Edit question:', questionId);
            // Implement edit modal
        },
        
        async handleImport(file) {
            if (!file) return;
            
            const authToken = localStorage.getItem('authToken');
            const formData = new FormData();
            formData.append('file', file);
            
            try {
                const response = await fetch(`${API_BASE}/admin/questions/import`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    },
                    body: formData
                });
                
                if (response.ok) {
                    const result = await response.json();
                    this.showMessage(`Imported ${result.imported} questions successfully`, 'success');
                    this.loadQuestions();
                    this.loadQuestionStats();
                }
            } catch (error) {
                console.error('Error importing questions:', error);
                this.showMessage('Import failed', 'error');
            }
        },
        
        async exportQuestions() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/questions/export`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'questions-export.csv';
                    a.click();
                    window.URL.revokeObjectURL(url);
                }
            } catch (error) {
                console.error('Error exporting questions:', error);
            }
        },
        
        escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('questions-message');
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
