# Commander Deck Builder - Backend

Express.js backend server for the Commander Deck Builder application.

## Features

- **File Upload**: Process Manabox CSV and TXT collection files
- **Collection Management**: Store and retrieve user card collections
- **Auto-Build**: Generate deck suggestions using Scryfall API and EDHREC data
- **Scryfall Integration**: Fetch card details and enrich collection data

## Setup

1. Install dependencies:
```bash
npm install
```

2. Build the TypeScript code:
```bash
npm run build
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### `GET /api/collection`
Retrieve the stored card collection.

**Response:**
```json
{
  "collection": [...]
}
```

### `POST /api/upload`
Upload a Manabox CSV or TXT file to create/update the collection.

**Request:** `multipart/form-data` with `file` field

**Response:**
```json
{
  "success": true,
  "count": 1234
}
```

### `POST /api/auto-build`
Generate a deck based on a commander and collection.

**Request:**
```json
{
  "commanderName": "Atraxa, Praetors' Voice",
  "collection": [...]
}
```

**Response:**
```json
{
  "success": true,
  "deckName": "Auto-built Atraxa, Praetors' Voice deck",
  "cardNames": [...],
  "suggestedDetails": [...],
  "deckUrl": "https://edhrec.com/commanders/..."
}
```

## Environment Variables

- `PORT`: Server port (default: 3001)

## Data Storage

Card collections are stored in `data/collection.json`.

## Tech Stack

- Express.js
- TypeScript
- Multer (file uploads)
- PapaParse (CSV parsing)
- Scryfall API
