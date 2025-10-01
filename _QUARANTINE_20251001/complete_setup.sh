#!/bin/bash

echo "🚀 Completing RSN8TV Phase 1 Setup..."

# Run migrations
echo "Running database migrations..."
npm run migrate:latest

# Seed initial data
echo "Seeding initial data..."
npx knex seed:run

# Create S3 bucket (requires AWS CLI)
if command -v aws &> /dev/null; then
  echo "Creating S3 bucket..."
  aws s3 mb s3://rsn8tv-exports --region us-east-1 || true
  
  # Set bucket policy
  aws s3api put-bucket-policy --bucket rsn8tv-exports --policy '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Principal": {"AWS": "*"},
        "Action": "s3:GetObject",
        "Resource": "arn:aws:s3:::rsn8tv-exports/assets/*"
      }
    ]
  }' || true
  
  # Enable versioning
  aws s3api put-bucket-versioning --bucket rsn8tv-exports --versioning-configuration Status=Enabled || true
else
  echo "⚠️  AWS CLI not found. Please create S3 bucket manually."
fi

# Install Redis if not present
if ! command -v redis-server &> /dev/null; then
  echo "⚠️  Redis not found. Please install Redis for background jobs:"
  echo "    sudo apt-get install redis-server"
fi

echo "✅ Phase 1 setup complete!"
echo ""
echo "Next steps:"
echo "1. Update .env file with AWS credentials"
echo "2. Start Redis: redis-server"
echo "3. Start the server: npm start"
echo "4. Access admin dashboard at http://localhost:3000/admin/monitoring/dashboard.html"
