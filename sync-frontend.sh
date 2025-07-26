#!/bin/bash
# Sync frontend files from /var/www/html to repo
rsync -av --delete /var/www/html/admin/ ~/rsn8tv-trivia/frontend/admin/
rsync -av --delete /var/www/html/trivia/ ~/rsn8tv-trivia/frontend/trivia/
echo "Frontend files synced from /var/www/html"
