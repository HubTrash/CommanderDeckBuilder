# Commander Deck Builder

A full-stack web application for building Magic: The Gathering Commander decks using your personal card collection.

## Features

- 📤 **Upload Collection**: Import your Manabox CSV or TXT collection files
- 📚 **View Collection**: Browse your entire card collection with advanced filters
- 🎯 **Smart Commander Selection**: Filter by color identity
- 🃏 **Deck Building**: Add cards with automatic color identity validation
- 🤖 **Auto-Build**: AI-powered deck suggestions using EDHREC data
- ⚖️ **Balance Deck**: Automatically fill remaining slots with optimal lands and spells
- 🎲 **Chaos Orb**: Add random legal cards for variety
- 🧪 **Goldfish Testing**: Test opening hands
- 📊 **Salt Meter**: Track your deck's power level
- 💾 **Export**: Download your deck as a TXT file

## Project Structure

This project is split into two parts:

```
CommanderDeckBuilder/
├── frontend/          # Next.js React application
└── backend/           # Express.js API server
```

## Quick Start

### Backend Setup

```bash
cd backend
npm install
npm run build
npm start
```

The backend will run on `http://localhost:3001`

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000`

## Deployment

### Option 1: Monorepo (Current Structure)

Keep both frontend and backend in the same repository. Deploy them separately:
- Backend: Deploy to a Node.js hosting service (Railway, Render, Fly.io, etc.)
- Frontend: Deploy to Vercel, Netlify, or similar

### Option 2: Separate Repositories

Split into two repos:
1. Move `backend/` to a new repository
2. Move `frontend/` to another repository
3. Update the `NEXT_PUBLIC_API_URL` in the frontend to point to your deployed backend

## Environment Variables

### Backend
- `PORT`: Server port (default: 3001)

### Frontend
- `NEXT_PUBLIC_API_URL`: Backend API URL (default: http://localhost:3001/api)
- `GOOGLE_CLIENT_ID`: Google OAuth client ID (optional)
- `GOOGLE_CLIENT_SECRET`: Google OAuth secret (optional)
- `NEXTAUTH_SECRET`: NextAuth secret (optional)
- `NEXTAUTH_URL`: Frontend URL (optional)

## Tech Stack

**Frontend:**
- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- NextAuth.js

**Backend:**
- Express.js
- TypeScript
- Multer
- PapaParse
- Scryfall API

## How It Works

1. **Upload**: User uploads their Manabox collection file
2. **Enrich**: Backend fetches card details from Scryfall API
3. **Select Commander**: User chooses a commander from their collection
4. **Build Deck**: User manually adds cards or uses auto-build features
5. **Balance**: App suggests lands and fills remaining slots
6. **Export**: Download the final decklist

## API Integration

The app integrates with:
- **Scryfall API**: Card data and images
- **EDHREC**: Deck building recommendations (via Scryfall queries)

## License

MIT License - See LICENSE file for details

## Credits

Created by Trashpanda using Gemini 3 and Antigravity
