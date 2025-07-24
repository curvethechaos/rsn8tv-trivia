// components/modal.js - Modal management system

class ModalManager {
    constructor() {
        this.container = null;
        this.activeModals = new Map();
        this.init();
    }

    init() {
        this.container = document.getElementById('modalContainer');
        if (!this.container) {
            console.warn('Modal container not found');
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeModals.size > 0) {
                const topModal = Array.from(this.activeModals.values()).pop();
                if (topModal) topModal.close();
            }
        });
    }

    async load(modalName, data = {}) {
        try {
            const response = await fetch(`modals/${modalName}/${modalName}.html`);
            if (!response.ok) throw new Error('Failed to load modal');
            
            const html = await response.text();
            
            const modal = new Modal(modalName, html, data);
            this.activeModals.set(modalName, modal);
            
            if (!document.getElementById(`${modalName}-modal-css`)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = `modals/${modalName}/${modalName}.css`;
                link.id = `${modalName}-modal-css`;
                document.head.appendChild(link);
            }
            
            try {
                const jsResponse = await fetch(`modals/${modalName}/${modalName}.js`);
                if (jsResponse.ok) {
                    const jsText = await jsResponse.text();
                    const script = document.createElement('script');
                    script.textContent = jsText;
                    document.body.appendChild(script);
                }
            } catch (e) {
                // Modal JS is optional
            }
            
            return modal;
            
        } catch (error) {
            console.error(`Failed to load modal ${modalName}:`, error);
            throw error;
        }
    }

    remove(modalName) {
        this.activeModals.delete(modalName);
    }
}

class Modal {
    constructor(name, html, data) {
        this.name = name;
        this.data = data;
        this.element = null;
        this.render(html);
    }

    render(html) {
        const wrapper = document.createElement('div');
        wrapper.className = 'modal-wrapper';
        wrapper.innerHTML = `
            <div class="modal-backdrop" onclick="this.parentElement.querySelector('.modal').dispatchEvent(new Event('close'))"></div>
            <div class="modal" data-modal="${this.name}">
                ${html}
            </div>
        `;
        
        this.element = wrapper.querySelector('.modal');
        
        this.element.querySelectorAll('[data-close-modal]').forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });
        
        this.element.addEventListener('close', () => this.close());
        
        document.getElementById('modalContainer').appendChild(wrapper);
        
        setTimeout(() => {
            wrapper.classList.add('show');
        }, 10);
    }

    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    close() {
        const wrapper = this.element.closest('.modal-wrapper');
        wrapper.classList.remove('show');
        
        setTimeout(() => {
            wrapper.remove();
            window.modalManager.remove(this.name);
        }, 300);
    }

    update(data) {
        this.data = { ...this.data, ...data };
        this.element.dispatchEvent(new CustomEvent('modalUpdate', { detail: data }));
    }
}

window.modalManager = new ModalManager();
window.loadModal = (name, data) => window.modalManager.load(name, data);
