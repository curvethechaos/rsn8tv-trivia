(function() {
    'use strict';
    
    window.marketingTab = {
        campaigns: [],
        selectedRecipients: [],
        
        init() {
            console.log('Marketing tab initialized');
            this.loadCampaigns();
            this.setupEventListeners();
        },
        
        setupEventListeners() {
            document.getElementById('create-campaign-btn')?.addEventListener('click', () => {
                this.showCampaignModal();
            });
            
            document.getElementById('recipient-filter')?.addEventListener('change', (e) => {
                this.filterRecipients(e.target.value);
            });
        },
        
        async loadCampaigns() {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/marketing/campaigns`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.campaigns = await response.json();
                    this.displayCampaigns();
                }
            } catch (error) {
                console.error('Error loading campaigns:', error);
            }
        },
        
        displayCampaigns() {
            const container = document.getElementById('campaigns-list');
            if (!container) return;
            
            container.innerHTML = this.campaigns.map(campaign => `
                <div class="campaign-card">
                    <h3>${campaign.name}</h3>
                    <p>Subject: ${campaign.subject}</p>
                    <p>Recipients: ${campaign.recipient_count}</p>
                    <p>Status: <span class="status ${campaign.status}">${campaign.status}</span></p>
                    <p>Sent: ${campaign.sent_at ? new Date(campaign.sent_at).toLocaleString() : 'Not sent'}</p>
                    <div class="campaign-stats">
                        <span>Opens: ${campaign.open_rate || 0}%</span>
                        <span>Clicks: ${campaign.click_rate || 0}%</span>
                    </div>
                    <div class="campaign-actions">
                        <button onclick="marketingTab.viewCampaign(${campaign.id})">View</button>
                        ${campaign.status === 'draft' ? `
                            <button onclick="marketingTab.editCampaign(${campaign.id})">Edit</button>
                            <button onclick="marketingTab.sendCampaign(${campaign.id})">Send</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        },
        
        showCampaignModal(campaignId = null) {
            const modal = document.getElementById('campaign-modal');
            if (!modal) return;
            
            if (campaignId) {
                const campaign = this.campaigns.find(c => c.id === campaignId);
                if (campaign) {
                    document.getElementById('campaign-name').value = campaign.name;
                    document.getElementById('campaign-subject').value = campaign.subject;
                    document.getElementById('campaign-content').value = campaign.content;
                    document.getElementById('campaign-id').value = campaign.id;
                }
            } else {
                document.getElementById('campaign-form').reset();
                document.getElementById('campaign-id').value = '';
            }
            
            modal.style.display = 'block';
        },
        
        async saveCampaign() {
            const authToken = localStorage.getItem('authToken');
            const campaignId = document.getElementById('campaign-id').value;
            
            const campaignData = {
                name: document.getElementById('campaign-name').value,
                subject: document.getElementById('campaign-subject').value,
                content: document.getElementById('campaign-content').value,
                recipients: this.selectedRecipients
            };
            
            try {
                const url = campaignId 
                    ? `${API_BASE}/admin/marketing/campaigns/${campaignId}`
                    : `${API_BASE}/admin/marketing/campaigns`;
                    
                const method = campaignId ? 'PUT' : 'POST';
                
                const response = await fetch(url, {
                    method: method,
                    headers: {
                        'Authorization': `Bearer ${authToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(campaignData)
                });
                
                if (response.ok) {
                    this.closeCampaignModal();
                    this.loadCampaigns();
                    this.showMessage('Campaign saved successfully', 'success');
                }
            } catch (error) {
                console.error('Error saving campaign:', error);
                this.showMessage('Error saving campaign', 'error');
            }
        },
        
        async sendCampaign(campaignId) {
            if (!confirm('Are you sure you want to send this campaign?')) return;
            
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/marketing/campaigns/${campaignId}/send`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    this.loadCampaigns();
                    this.showMessage('Campaign sent successfully', 'success');
                }
            } catch (error) {
                console.error('Error sending campaign:', error);
                this.showMessage('Error sending campaign', 'error');
            }
        },
        
        async filterRecipients(filter) {
            const authToken = localStorage.getItem('authToken');
            try {
                const response = await fetch(`${API_BASE}/admin/marketing/recipients?filter=${filter}`, {
                    headers: {
                        'Authorization': `Bearer ${authToken}`
                    }
                });
                
                if (response.ok) {
                    const recipients = await response.json();
                    this.displayRecipients(recipients);
                }
            } catch (error) {
                console.error('Error loading recipients:', error);
            }
        },
        
        displayRecipients(recipients) {
            const container = document.getElementById('recipients-list');
            if (!container) return;
            
            container.innerHTML = `
                <p>Total recipients: ${recipients.length}</p>
                <button onclick="marketingTab.selectAllRecipients(${JSON.stringify(recipients.map(r => r.id))})">
                    Select All
                </button>
            `;
        },
        
        selectAllRecipients(recipientIds) {
            this.selectedRecipients = recipientIds;
            this.showMessage(`Selected ${recipientIds.length} recipients`, 'success');
        },
        
        viewCampaign(campaignId) {
            console.log('View campaign:', campaignId);
            // Implement campaign detail view
        },
        
        editCampaign(campaignId) {
            this.showCampaignModal(campaignId);
        },
        
        closeCampaignModal() {
            const modal = document.getElementById('campaign-modal');
            if (modal) {
                modal.style.display = 'none';
            }
        },
        
        showMessage(message, type) {
            const messageEl = document.getElementById('marketing-message');
            if (messageEl) {
                messageEl.textContent = message;
                messageEl.className = `message ${type} show`;
                setTimeout(() => {
                    messageEl.classList.remove('show');
                }, 3000);
            }
        },
        
        cleanup() {
            this.closeCampaignModal();
            this.selectedRecipients = [];
        }
    };
})();
