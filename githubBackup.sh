#!/bin/bash

# RSN8TV GitHub Branch Backup Script
# Creates a new branch with current state and timestamp

echo "🚀 RSN8TV GitHub Branch Backup"
echo "=============================="

# Get current date in YYYYMMDD format
DATE=$(date +%Y%m%d)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BRANCH_NAME="backup-$DATE"

# Step 1: Check current directory and git status
echo "Step 1: Checking current git status..."

# First, let's find where the git repository is
if [ -d ~/rsn8tv-trivia/.git ]; then
    echo "Found git repo in ~/rsn8tv-trivia"
    cd ~/rsn8tv-trivia
elif [ -d ~/rsn8tv-trivia/trivia-server/.git ]; then
    echo "Found git repo in ~/rsn8tv-trivia/trivia-server"
    cd ~/rsn8tv-trivia/trivia-server
elif [ -d /var/www/html/.git ]; then
    echo "Found git repo in /var/www/html"
    cd /var/www/html
else
    echo "❌ No git repository found. Let's check where it might be..."
    echo "Running: find ~ -name .git -type d 2>/dev/null | grep -v node_modules"
    find ~ -name .git -type d 2>/dev/null | grep -v node_modules
    echo ""
    echo "Please cd to your git repository directory and run this script again."
    exit 1
fi

echo "Current directory: $(pwd)"
echo ""

# Step 2: Fetch latest from remote
echo "Step 2: Fetching latest from remote..."
git fetch origin

# Step 3: Show current branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"
echo ""

# Step 4: Check for uncommitted changes
echo "Step 3: Checking for uncommitted changes..."
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  You have uncommitted changes:"
    git status --short
    echo ""
    echo "Do you want to:"
    echo "1) Commit these changes before creating backup branch"
    echo "2) Stash these changes temporarily"
    echo "3) Proceed without committing (changes will be included in backup branch)"
    echo "4) Cancel"
    read -p "Enter choice (1-4): " choice
    
    case $choice in
        1)
            echo "Creating commit with timestamp..."
            git add -A
            git commit -m "Backup commit: $TIMESTAMP"
            ;;
        2)
            echo "Stashing changes..."
            git stash push -m "Backup stash: $TIMESTAMP"
            ;;
        3)
            echo "Proceeding with uncommitted changes..."
            ;;
        4)
            echo "Cancelled."
            exit 0
            ;;
    esac
fi

# Step 5: Create new backup branch
echo ""
echo "Step 4: Creating backup branch: $BRANCH_NAME"

# Check if branch already exists
if git show-ref --verify --quiet refs/heads/$BRANCH_NAME; then
    # Branch exists, create with timestamp
    BRANCH_NAME="backup-$TIMESTAMP"
    echo "Branch with today's date exists. Using timestamp: $BRANCH_NAME"
fi

git checkout -b $BRANCH_NAME

# Step 6: Add all files (including untracked) to ensure complete backup
echo ""
echo "Step 5: Adding all files to backup..."

# If we have the trivia-server directory, add it
if [ -d ~/rsn8tv-trivia/trivia-server ]; then
    echo "Adding backend files..."
    git add ~/rsn8tv-trivia/trivia-server/
fi

# If we have the frontend directories, add them
if [ -d /var/www/html/trivia ]; then
    echo "Adding frontend files..."
    git add /var/www/html/trivia/
    git add /var/www/html/admin/
fi

# Add any other files in the current directory
git add -A

# Step 7: Create backup commit
echo ""
echo "Step 6: Creating backup commit..."
COMMIT_MSG="Complete system backup: $TIMESTAMP

This backup includes:
- Backend: Node.js server, routes, services, database migrations
- Frontend: Player interface, host interface, admin dashboard
- Configuration: All config files (sensitive data excluded via .gitignore)
- Documentation: All handoff documents and READMEs

Current system state:
- Core game engine: Functional
- Real-time multiplayer: Working
- Database: Complete with all tables
- Admin dashboard: Backend integration in progress"

git commit -m "$COMMIT_MSG" --allow-empty

# Step 8: Push to remote
echo ""
echo "Step 7: Pushing backup branch to GitHub..."
git push -u origin $BRANCH_NAME

# Step 9: Switch back to original branch
echo ""
echo "Step 8: Switching back to $CURRENT_BRANCH..."
git checkout $CURRENT_BRANCH

# Step 10: Summary
echo ""
echo "✅ Backup Complete!"
echo "=================="
echo "Backup branch: $BRANCH_NAME"
echo "Pushed to: origin/$BRANCH_NAME"
echo ""
echo "To view this backup later:"
echo "  git checkout $BRANCH_NAME"
echo ""
echo "To see all backup branches:"
echo "  git branch -r | grep backup-"
echo ""
echo "To compare with current branch:"
echo "  git diff $CURRENT_BRANCH..$BRANCH_NAME"
