#!/bin/bash

# RSN8TV Players Tab Fix Script - Part 2 (with proper sudo handling)

set -e  # Exit on error

echo "========================================="
echo "RSN8TV Players Tab Fix - Resuming"
echo "========================================="
echo ""

# Configuration
BACKEND_DIR="$HOME/rsn8tv-trivia/trivia-server"
FRONTEND_DIR="/var/www/html/admin/monitoring"

echo "Step 4: Updating frontend players.js (with proper sudo)..."
echo "----------------------------------------------------------"

# Create the enhanced players.js content
cat > /tmp/players_update.js << 'EOF'
// Add this to the existing initPlayersTab function
function enhancePlayersTab() {
  // Add period filter to the filters section
  const filterContainer = document.querySelector('.filters-container');
  if (filterContainer && !document.getElementById('periodFilter')) {
    const periodFilterGroup = document.createElement('div');
    periodFilterGroup.className = 'filter-group';
    periodFilterGroup.innerHTML = `
      <label for="periodFilter">Time Period:</label>
      <select id="periodFilter" class="filter-select">
        <option value="">All Time</option>
        <option value="weekly">Current Week</option>
        <option value="monthly">Current Month</option>
        <option value="quarterly">Current Quarter</option>
        <option value="yearly">Current Year</option>
      </select>
    `;
    
    // Insert at the beginning of filters
    filterContainer.insertBefore(periodFilterGroup, filterContainer.firstChild);
    
    // Add event listener
    document.getElementById('periodFilter').addEventListener('change', handlePeriodChange);
  }
}

function handlePeriodChange(e) {
  const period = e.target.value;
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  
  if (period) {
    // Disable date inputs when period is selected
    startDateInput.disabled = true;
    endDateInput.disabled = true;
    startDateInput.value = '';
    endDateInput.value = '';
  } else {
    // Enable date inputs
    startDateInput.disabled = false;
    endDateInput.disabled = false;
  }
  
  // Reload players with new filter
  currentPage = 1;
  loadPlayers();
}

// Replace the existing loadPlayers function
async function loadPlayers() {
  try {
    showLoadingState();
    
    const params = new URLSearchParams({
      page: currentPage,
      limit: itemsPerPage
    });
    
    // Add period filter
    const period = document.getElementById('periodFilter')?.value;
    if (period) {
      params.append('period', period);
    } else {
      // Only use date filters if no period selected
      const startDate = document.getElementById('startDate')?.value;
      const endDate = document.getElementById('endDate')?.value;
      if (startDate && endDate) {
        params.append('startDate', startDate);
        params.append('endDate', endDate);
      }
    }
    
    // Add search
    const search = document.getElementById('playerSearch')?.value;
    if (search) {
      params.append('search', search);
    }
    
    const response = await authenticatedFetch(`/api/admin/players?${params}`);
    if (!response.ok) throw new Error('Failed to fetch players');
    
    const data = await response.json();
    
    displayPlayers(data.players);
    updatePagination(data.pagination);
    
    // Show active filters
    const activeFilters = [];
    if (data.filters.period) {
      activeFilters.push(`Period: ${data.filters.period}`);
    } else if (data.filters.dateRange) {
      activeFilters.push(`Date Range: ${new Date(data.filters.dateRange.start).toLocaleDateString()} - ${new Date(data.filters.dateRange.end).toLocaleDateString()}`);
    }
    
    const filterDisplay = document.getElementById('activeFilters');
    if (filterDisplay) {
      filterDisplay.textContent = activeFilters.length ? activeFilters.join(', ') : 'No filters applied';
    }
    
  } catch (error) {
    console.error('Error loading players:', error);
    showError('Failed to load players data');
  } finally {
    hideLoadingState();
  }
}

// Call enhance function when tab loads
if (typeof initPlayersTab === 'function') {
  const originalInit = initPlayersTab;
  initPlayersTab = function() {
    originalInit();
    enhancePlayersTab();
  };
} else {
  document.addEventListener('DOMContentLoaded', enhancePlayersTab);
}
EOF

# Create a combined file with newlines and comment
{
  echo ""
  echo "// Period filter enhancements - Added $(date)"
  cat /tmp/players_update.js
} > /tmp/players_complete_update.js

# Append everything at once using sudo tee
cat /tmp/players_complete_update.js | sudo tee -a "$FRONTEND_DIR/tabs/players/players.js" > /dev/null

echo "Updated players.js"

echo ""
echo "Step 5: Adding CSS for period filter..."
echo "---------------------------------------"

# Create CSS content
cat > /tmp/players_css_update.css << 'EOF'

/* Period filter styles - Added by fix script */
.filter-select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 14px;
    background-color: white;
    cursor: pointer;
    min-width: 150px;
}

.filter-select:disabled {
    background-color: #f5f5f5;
    cursor: not-allowed;
    opacity: 0.6;
}

.filter-group {
    margin-bottom: 15px;
}

.filter-group label {
    display: inline-block;
    margin-right: 10px;
    font-weight: 600;
    min-width: 100px;
}

#activeFilters {
    margin-top: 10px;
    padding: 5px 10px;
    background-color: #f0f0f0;
    border-radius: 4px;
    font-size: 12px;
    color: #666;
}
EOF

# Add CSS using sudo tee
cat /tmp/players_css_update.css | sudo tee -a "$FRONTEND_DIR/tabs/players/players.css" > /dev/null

echo "Updated players.css"

echo ""
echo "Step 6: Running database migration..."
echo "------------------------------------"

cd "$BACKEND_DIR"
npx knex migrate:latest
echo "Migration completed"

echo ""
echo "Step 7: Restarting the server..."
echo "--------------------------------"

pm2 restart rsn8tv
echo "Server restarted"

echo ""
echo "Step 8: Testing the new endpoint..."
echo "------------------------------------"

# Get auth token
TOKEN=$(curl -s -X POST https://trivia.rsn8tv.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "axiom", "password": "HirschF843"}' | \
  grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
  echo "Testing /api/admin/players endpoint..."
  curl -s -H "Authorization: Bearer $TOKEN" \
    "https://trivia.rsn8tv.com/api/admin/players?limit=2" | \
    python3 -m json.tool | head -20
else
  echo "Could not obtain auth token for testing"
fi

echo ""
echo "Step 9: Verifying database scores..."
echo "-------------------------------------"

sudo -u postgres psql rsn8tv_trivia -c "SELECT nickname, total_score, total_games_played FROM player_profiles WHERE total_score > 0 OR total_games_played > 0 LIMIT 5;"

echo ""
echo "Step 10: Cleaning up temporary files..."
echo "----------------------------------------"

rm -f /tmp/players_update.js /tmp/players_complete_update.js /tmp/players_css_update.css

echo ""
echo "========================================="
echo "Implementation Complete!"
echo "========================================="
echo ""
echo "Next steps to verify:"
echo "1. Visit https://trivia.rsn8tv.com/admin/monitoring/dashboard.html"
echo "2. Login with axiom/HirschF843"
echo "3. Go to Players tab"
echo "4. Look for the new 'Time Period' dropdown at the top of filters"
echo "5. Check if player scores are now showing correctly"
echo ""
echo "If scores are still 0, check PM2 logs:"
echo "  pm2 logs rsn8tv --lines 50"
echo ""
