# Subsquid Indexer for Solana Drive

## Introduction
This project sets up an indexer for Solana Drive using Subsquid, fetching data from the Solana blockchain, processing it, and storing it in a PostgreSQL database. The data includes information about files and users associated with Solana Drive.

## Prerequisites
- Node.js
- Docker
- Docker Compose

## Setup

```bash
# Install dependencies
npm ci

# Compile the project
npx tsc

# Launch PostgreSQL database
docker compose up -d


# Create database migrations to create the target schema
npx squid-typeorm-migration apply
# Apply database migrations to create the target schema
npx squid-typeorm-migration apply

# Run the indexer
node -r dotenv/config lib/main.js

# GraphQL Queries
## Get all files
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getAllFiles { id slot timestamp file_id name weight file_parent_id cid typ from to } }"}'

## Get file by file_id
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getFile(file_id: \"your_file_id\") { id slot timestamp file_id name weight file_parent_id cid typ from to } }"}'

## Get all users
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getAllUsers { id user_solana did_public_address } }"}'

## Get user by user_solana
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getUser(user_solana: \"your_user_solana\") { id user_solana did_public_address } }"}'

## Get file by CID
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getFileByCID(CID: \"your_CID\") { id slot timestamp file_id name weight file_parent_id cid typ from to } }"}'

## Get files by from and to
curl -X POST http://localhost:4000/graphql -H "Content-Type: application/json" -d '{"query": "{ getFilesByFromAndTo(from: \"your_from\", to: \"your_to\") { id slot timestamp file_id name weight file_parent_id cid typ } }"}'
```curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash
