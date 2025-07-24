// Players Tab Module - IIFE Pattern for Browser Compatibility
window.PlayersTab = (function() {
  'use strict';

  // Private variables
  let currentPage = 1;
  let currentFilters = {};
  let totalPlayers = 0;

  // Private methods
  async function loadPlayers(page = 1, filters = {}) {
    try {
      currentPage = page;
      currentFilters = filters;

      const queryParams = new URLSearchParams({
        page: page,
        limit: 20,
        ...filters
      });

      const response = await window.authManager.apiRequest(`/api/admin/players?${queryParams}`);
      
      if (!response.ok) {
        throw new Error('Failed to load players');
      }
      
      const data = await response.json();
      
      if (data.success) {
        displayPlayers(data.data.players);
        updatePagination(data.data.pagination);
        totalPlayers = data.data.pagination.total;
        updateStats(data.data.stats);
      } else {
        showError(data.error || 'Failed to load players');
      }
    } catch (error) {
      console.error('Error loading players:', error);
      showError('Failed to load players. Please try again.');
    }
  }

  function displayPlayers(players) {
    const tbody = document.getElementById('players-tbody');
    if (!tbody) return;

    if (players.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center">No players found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = players.map(player => {
      const isRegistered = player.email !== null;
      const registrationDate = player.registered_at ? 
        new Date(player.registered_at).toLocaleDateString() : 'N/A';
      const lastPlayed = player.last_played ? 
        new Date(player.last_played).toLocaleDateString() : 'Never';

      return `
        <tr>
          <td>${player.id}</td>
          <td>
            <div>
              <strong>${escapeHtml(player.nickname || player.temporary_name || 'Unknown')}</strong>
              ${player.real_name ? `<br><small>${escapeHtml(player.real_name)}</small>` : ''}
            </div>
          </td>
          <td>${player.email ? escapeHtml(player.email) : '<span class="text-muted">Not registered</span>'}</td>
          <td><span class="badge badge-${isRegistered ? 'success' : 'secondary'}">${isRegistered ? 'Yes' : 'No'}</span></td>
          <td>${player.games_played || 0}</td>
          <td>${player.highest_score || 0}</td>
          <td>${lastPlayed}</td>
          <td>
            <button class="btn btn-sm btn-info" onclick="PlayersTab.viewPlayer(${player.id})">
              <i class="fas fa-eye"></i> View
            </button>
            ${isRegistered ? `
              <button class="btn btn-sm btn-primary" onclick="PlayersTab.editPlayer(${player.id})">
                <i class="fas fa-edit"></i> Edit
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  }

  function updatePagination(pagination) {
    const paginationContainer = document.getElementById('players-pagination');
    if (!paginationContainer) return;

    const totalPages = pagination.totalPages;
    const currentPage = pagination.page;

    let html = `
      <nav aria-label="Players pagination">
        <ul class="pagination">
          <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="PlayersTab.changePage(${currentPage - 1}); return false;">Previous</a>
          </li>
    `;

    // Show max 5 page numbers
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }

    for (let i = startPage; i <= endPage; i++) {
      html += `
        <li class="page-item ${i === currentPage ? 'active' : ''}">
          <a class="page-link" href="#" onclick="PlayersTab.changePage(${i}); return false;">${i}</a>
        </li>
      `;
    }

    html += `
          <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="PlayersTab.changePage(${currentPage + 1}); return false;">Next</a>
          </li>
        </ul>
      </nav>
    `;

    paginationContainer.innerHTML = html;
  }

  function updateStats(stats) {
    const statsContainer = document.getElementById('players-stats');
    if (!statsContainer) return;

    statsContainer.innerHTML = `
      <div class="row">
        <div class="col-md-3">
          <div class="stat-card">
            <h4>${stats.totalPlayers || 0}</h4>
            <p>Total Players</p>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <h4>${stats.registeredPlayers || 0}</h4>
            <p>Registered Players</p>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <h4>${stats.activePlayers || 0}</h4>
            <p>Active This Week</p>
          </div>
        </div>
        <div class="col-md-3">
          <div class="stat-card">
            <h4>${stats.newRegistrations || 0}</h4>
            <p>New This Month</p>
          </div>
        </div>
      </div>
    `;
  }

  async function viewPlayer(playerId) {
    try {
      const response = await window.authManager.apiRequest(`/api/players/${playerId}`);
      
      if (!response.ok) {
        throw new Error('Failed to load player details');
      }
      
      const data = await response.json();
      
      if (data.success) {
        showPlayerModal(data.data);
      } else {
        showError(data.error || 'Failed to load player details');
      }
    } catch (error) {
      console.error('Error viewing player:', error);
      showError('Failed to load player details');
    }
  }

  function showPlayerModal(player) {
    const modalHtml = `
      <div class="modal fade" id="playerViewModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Player Details: ${escapeHtml(player.nickname || player.temporary_name)}</h5>
              <button type="button" class="close" data-dismiss="modal">
                <span>&times;</span>
              </button>
            </div>
            <div class="modal-body">
              <div class="row">
                <div class="col-md-6">
                  <h6>Profile Information</h6>
                  <table class="table table-sm">
                    <tr>
                      <th>ID:</th>
                      <td>${player.id}</td>
                    </tr>
                    <tr>
                      <th>Nickname:</th>
                      <td>${escapeHtml(player.nickname || 'N/A')}</td>
                    </tr>
                    <tr>
                      <th>Real Name:</th>
                      <td>${escapeHtml(player.real_name || 'N/A')}</td>
                    </tr>
                    <tr>
                      <th>Email:</th>
                      <td>${escapeHtml(player.email || 'Not registered')}</td>
                    </tr>
                    <tr>
                      <th>Marketing Consent:</th>
                      <td><span class="badge badge-${player.marketing_consent ? 'success' : 'secondary'}">${player.marketing
