#!/bin/bash

# RSN8TV Trivia System Analyzer
# Outputs all database tables and API endpoints from the entire system
# Usage: ./analyze_system.sh

echo "=================================================="
echo "RSN8TV TRIVIA SYSTEM - COMPLETE SYSTEM ANALYSIS"
echo "=================================================="
echo "Generated: $(date)"
echo ""

# Configuration
DB_NAME="rsn8tv_trivia"
DB_USER="axiom"
SERVER_DIR="$HOME/rsn8tv-trivia/trivia-server"
FRONTEND_DIR="/var/www/html"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to check if database is accessible
check_database() {
    if psql -U $DB_USER -d $DB_NAME -c '\q' 2>/dev/null; then
        return 0
    else
        echo -e "${RED}❌ Cannot connect to database${NC}"
        return 1
    fi
}

# Function to extract all database tables
extract_database_tables() {
    echo -e "${BLUE}📊 DATABASE TABLES${NC}"
    echo "=================="
    
    if check_database; then
        # Get all tables with row counts
        psql -U $DB_USER -d $DB_NAME -t -c "
            SELECT 
                schemaname,
                tablename,
                COALESCE((SELECT COUNT(*) FROM \"\" || schemaname || '\".\"' || tablename || '\"')::text, 'N/A') as row_count
            FROM pg_tables 
            WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
            ORDER BY schemaname, tablename;
        " 2>/dev/null | while read -r schema table count; do
            if [ ! -z "$table" ]; then
                printf "%-30s %10s rows\n" "$table" "$count"
            fi
        done
        
        # Get table details
        echo ""
        echo -e "${YELLOW}Table Structures:${NC}"
        echo "-----------------"
        
        psql -U $DB_USER -d $DB_NAME -t -c "
            SELECT tablename 
            FROM pg_tables 
            WHERE schemaname = 'public' 
            ORDER BY tablename;
        " 2>/dev/null | while read -r table; do
            if [ ! -z "$table" ]; then
                echo ""
                echo -e "${GREEN}Table: $table${NC}"
                psql -U $DB_USER -d $DB_NAME -c "\d $table" 2>/dev/null | grep -E "^ [a-z_]+" | head -20
            fi
        done
    fi
}

# Function to extract API endpoints from route files
extract_api_endpoints() {
    echo ""
    echo -e "${BLUE}🌐 API ENDPOINTS${NC}"
    echo "================"
    
    cd $SERVER_DIR 2>/dev/null || {
        echo -e "${RED}Cannot access server directory${NC}"
        return
    }
    
    # Function to parse route files
    parse_routes() {
        local file=$1
        local prefix=$2
        
        if [ -f "$file" ]; then
            echo ""
            echo -e "${YELLOW}From $file:${NC}"
            
            # Extract GET routes
            grep -E "router\.(get|GET)\(" "$file" | grep -v "^//" | while read -r line; do
                route=$(echo "$line" | grep -oE "'[^']+'" | head -1 | tr -d "'")
                if [ ! -z "$route" ]; then
                    echo -e "${GREEN}GET${NC}    $prefix$route"
                fi
            done
            
            # Extract POST routes
            grep -E "router\.(post|POST)\(" "$file" | grep -v "^//" | while read -r line; do
                route=$(echo "$line" | grep -oE "'[^']+'" | head -1 | tr -d "'")
                if [ ! -z "$route" ]; then
                    echo -e "${GREEN}POST${NC}   $prefix$route"
                fi
            done
            
            # Extract PUT routes
            grep -E "router\.(put|PUT)\(" "$file" | grep -v "^//" | while read -r line; do
                route=$(echo "$line" | grep -oE "'[^']+'" | head -1 | tr -d "'")
                if [ ! -z "$route" ]; then
                    echo -e "${GREEN}PUT${NC}    $prefix$route"
                fi
            done
            
            # Extract DELETE routes
            grep -E "router\.(delete|DELETE)\(" "$file" | grep -v "^//" | while read -r line; do
                route=$(echo "$line" | grep -oE "'[^']+'" | head -1 | tr -d "'")
                if [ ! -z "$route" ]; then
                    echo -e "${GREEN}DELETE${NC} $prefix$route"
                fi
            done
            
            # Extract PATCH routes
            grep -E "router\.(patch|PATCH)\(" "$file" | grep -v "^//" | while read -r line; do
                route=$(echo "$line" | grep -oE "'[^']+'" | head -1 | tr -d "'")
                if [ ! -z "$route" ]; then
                    echo -e "${GREEN}PATCH${NC}  $prefix$route"
                fi
            done
        fi
    }
    
    # Parse main server.js for route prefixes
    echo -e "${YELLOW}Route Prefixes from server.js:${NC}"
    grep -E "app\.use\('\/" "$SERVER_DIR/server.js" | grep -v "^//" | while read -r line; do
        prefix=$(echo "$line" | grep -oE "'[^']+'" | head -1)
        route_file=$(echo "$line" | grep -oE "[a-zA-Z]+Routes" | head -1)
        if [ ! -z "$prefix" ] && [ ! -z "$route_file" ]; then
            echo "$prefix -> $route_file"
        fi
    done
    
    # Parse each route file
    parse_routes "routes/sessionRoutes.js" "/api/sessions"
    parse_routes "routes/playerRoutes.js" "/api/players"
    parse_routes "routes/leaderboardRoutes.js" "/api/leaderboards"
    parse_routes "routes/adminRoutes.js" "/api/admin"
    parse_routes "routes/authRoutes.js" "/api/auth"
    parse_routes "routes/exportRoutes.js" "/api/admin/exports"
    parse_routes "routes/themeRoutes.js" "/api/admin/themes"
    parse_routes "routes/questionRoutes.js" "/api/admin/questions"
    parse_routes "routes/prizeRoutes.js" "/api/admin/prizes"
    parse_routes "routes/brandingRoutes.js" "/api/admin/branding"
}

# Function to extract WebSocket events
extract_websocket_events() {
    echo ""
    echo -e "${BLUE}🔌 WEBSOCKET EVENTS${NC}"
    echo "==================="
    
    cd $SERVER_DIR 2>/dev/null || return
    
    echo -e "${YELLOW}Client to Server Events:${NC}"
    grep -r "socket\.on(" ws/ 2>/dev/null | grep -v "^//" | while read -r line; do
        event=$(echo "$line" | grep -oE "'[^']+'" | head -1)
        if [ ! -z "$event" ] && [ "$event" != "connection" ] && [ "$event" != "disconnect" ]; then
            echo "  - $event"
        fi
    done | sort -u
    
    echo ""
    echo -e "${YELLOW}Server to Client Events:${NC}"
    grep -r "socket\.emit\|io\.emit\|io\.to" ws/ services/ 2>/dev/null | grep -v "^//" | while read -r line; do
        event=$(echo "$line" | grep -oE "'[^']+'" | head -1)
        if [ ! -z "$event" ]; then
            echo "  - $event"
        fi
    done | sort -u
}

# Function to extract database migrations
extract_migrations() {
    echo ""
    echo -e "${BLUE}📁 DATABASE MIGRATIONS${NC}"
    echo "====================="
    
    if check_database; then
        psql -U $DB_USER -d $DB_NAME -t -c "
            SELECT filename, migrated_at 
            FROM knex_migrations 
            ORDER BY migrated_at DESC;
        " 2>/dev/null | while read -r migration date; do
            if [ ! -z "$migration" ]; then
                printf "%-50s %s\n" "$migration" "$date"
            fi
        done
    fi
}

# Function to count total system stats
system_stats() {
    echo ""
    echo -e "${BLUE}📈 SYSTEM STATISTICS${NC}"
    echo "===================="
    
    # Count files
    if [ -d "$SERVER_DIR" ]; then
        js_files=$(find $SERVER_DIR -name "*.js" -not -path "*/node_modules/*" 2>/dev/null | wc -l)
        route_files=$(find $SERVER_DIR/routes -name "*.js" 2>/dev/null | wc -l)
        service_files=$(find $SERVER_DIR/services -name "*.js" 2>/dev/null | wc -l)
        
        echo "Backend Files:"
        echo "  - JavaScript files: $js_files"
        echo "  - Route files: $route_files"
        echo "  - Service files: $service_files"
    fi
    
    if [ -d "$FRONTEND_DIR" ]; then
        html_files=$(find $FRONTEND_DIR -name "*.html" -not -path "*/node_modules/*" 2>/dev/null | wc -l)
        css_files=$(find $FRONTEND_DIR -name "*.css" -not -path "*/node_modules/*" 2>/dev/null | wc -l)
        
        echo ""
        echo "Frontend Files:"
        echo "  - HTML files: $html_files"
        echo "  - CSS files: $css_files"
    fi
    
    # Database stats
    if check_database; then
        table_count=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public';" 2>/dev/null | tr -d ' ')
        echo ""
        echo "Database:"
        echo "  - Total tables: $table_count"
    fi
}

# Function to check system health
check_system_health() {
    echo ""
    echo -e "${BLUE}🏥 SYSTEM HEALTH CHECK${NC}"
    echo "======================"
    
    # Check if server is running
    if pm2 list 2>/dev/null | grep -q "rsn8tv"; then
        echo -e "${GREEN}✅ Server is running${NC}"
    else
        echo -e "${RED}❌ Server is not running${NC}"
    fi
    
    # Check database connection
    if check_database; then
        echo -e "${GREEN}✅ Database is accessible${NC}"
    else
        echo -e "${RED}❌ Database is not accessible${NC}"
    fi
    
    # Check if API is responding
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health 2>/dev/null | grep -q "200"; then
        echo -e "${GREEN}✅ API is responding${NC}"
    else
        echo -e "${RED}❌ API is not responding${NC}"
    fi
}

# Main execution
main() {
    extract_database_tables
    extract_api_endpoints
    extract_websocket_events
    extract_migrations
    system_stats
    check_system_health
    
    echo ""
    echo "=================================================="
    echo "Analysis complete!"
    echo ""
    echo "To save this output to a file:"
    echo "./analyze_system.sh > system_analysis_$(date +%Y%m%d_%H%M%S).txt"
    echo "=================================================="
}

# Run main function
main
