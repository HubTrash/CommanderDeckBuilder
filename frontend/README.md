# Commander Deck Builder - Frontend

Next.js frontend application for building Magic: The Gathering Commander decks.

## Features

- **Collection Upload**: Upload Manabox CSV or TXT files
- **Commander Selection**: Filter and select legendary creatures/planeswalkers
- **Deck Building**: Add cards from your collection with color identity validation
- **Auto-Build**: AI-powered deck suggestions
- **Balance Deck**: Automatically fill remaining slots with lands and spells
- **Chaos Orb**: Add random cards for fun
- **Goldfish Testing**: Test opening hands
- **Salt Meter**: Track deck power level
- **Export**: Download deck as TXT file

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure the API URL:
   - The default API URL is `http://localhost:3001/api`
   - To change it, set `NEXT_PUBLIC_API_URL` environment variable

3. Run the development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
npm start
```

## Environment Variables

Create a `.env.local` file (optional):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

## Authentication

The app uses NextAuth.js with Google OAuth. Authentication is optional - the app works without signing in, but you can add authentication for future features like saving decks to the cloud.

## Tech Stack

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- NextAuth.js
- Lucide Icons

## Project Structure

```
frontend/
├── app/
│   ├── api/auth/         # NextAuth API routes
│   ├── builder/          # Deck builder page
│   ├── page.tsx          # Home/upload page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── CardGrid.tsx      # Card display grid
│   ├── ColorPicker.tsx   # Color filter
│   ├── DeckSidebar.tsx   # Deck list sidebar
│   ├── FileUpload.tsx    # File upload component
│   ├── GoldfishModal.tsx # Hand testing modal
│   └── SaltMeter.tsx     # Power level indicator
└── lib/
    ├── api.ts            # API configuration
    └── types.ts          # TypeScript types
```

## Development Notes

- The app expects a backend server running on port 3001
- Basic lands are treated as infinite supply
- Singleton rule is enforced (except for basic lands)
- Color identity validation follows Commander rules
