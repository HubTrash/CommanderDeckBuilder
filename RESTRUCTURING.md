# Project Restructuring Summary

## Changes Made

### Structure
- Split monolithic Next.js app into **frontend** and **backend** directories
- Backend: Express.js server (port 3001)
- Frontend: Next.js app (port 3000)

### Backend (`/backend`)
**Created:**
- `src/index.ts` - Main Express server with all API routes
- `src/types.ts` - Shared TypeScript types
- `src/scryfall.ts` - Scryfall API integration
- `package.json` - Backend dependencies
- `tsconfig.json` - TypeScript configuration
- `.gitignore` - Backend-specific ignores
- `README.md` - Backend documentation

**API Routes:**
- `GET /api/collection` - Retrieve card collection
- `POST /api/upload` - Upload Manabox CSV/TXT files
- `POST /api/auto-build` - Generate deck suggestions

**Dependencies:**
- express
- cors
- multer (file uploads)
- papaparse (CSV parsing)
- TypeScript + types

### Frontend (`/frontend`)
**Moved from root:**
- `app/` - Next.js pages and layouts
- `components/` - React components
- `lib/` - Utilities and types
- `public/` - Static assets
- All Next.js config files

**Removed:**
- `app/api/upload/` - Moved to backend
- `app/api/collection/` - Moved to backend
- `app/api/auto-build/` - Moved to backend
- `lib/scryfall.ts` - Moved to backend
- `papaparse` dependency - Moved to backend

**Kept:**
- `app/api/auth/` - NextAuth routes (must stay in frontend)

**Updated:**
- `app/page.tsx` - Now uses `API_BASE_URL` for upload
- `app/builder/page.tsx` - Now uses `API_BASE_URL` for collection and auto-build
- Created `lib/api.ts` - API configuration

**Dependencies Removed:**
- papaparse (now backend-only)
- @types/papaparse (now backend-only)

### Data Storage
- Moved `data/` directory to backend
- Collection JSON files stored in `backend/data/`

## Unused/Removed Files

None identified - all components and files are actively used:
- ✅ All components referenced in pages
- ✅ SessionProvider used in layout
- ✅ All API routes moved to backend
- ✅ Auth routes kept in frontend (required for NextAuth)

## Running the Application

### Development
```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend  
cd frontend
npm install
npm run dev
```

### Production
```bash
# Backend
cd backend
npm install
npm run build
npm start

# Frontend
cd frontend
npm install
npm run build
npm start
```

## Environment Configuration

**Backend** (`.env`):
```
PORT=3001
```

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Next Steps for Deployment

### Option 1: Keep as Monorepo
- Deploy backend to Railway/Render/Fly.io
- Deploy frontend to Vercel/Netlify
- Update `NEXT_PUBLIC_API_URL` to production backend URL

### Option 2: Split into Separate Repos
1. Create new repo for backend, move `backend/` contents
2. Create new repo for frontend, move `frontend/` contents
3. Update API URL configuration

## Benefits of This Structure

1. **Clear Separation**: Frontend and backend are independent
2. **Scalability**: Can deploy and scale separately
3. **Development**: Can work on frontend/backend independently
4. **Type Safety**: Shared types between frontend and backend
5. **Flexibility**: Easy to split into separate repos if needed
