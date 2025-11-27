# Commander Deck Builder

A powerful Next.js application designed to help Magic: The Gathering players build Commander decks using their own card collection. Upload your collection from Manabox or any other source that exports a CSV or txt file, select a commander, and let the app help you brew the perfect deck.

## Features

- **Collection Management**: Easily upload your card collection using a Manabox CSV export or any other source that exports a CSV or txt file.
- **Commander Selection**: Browse your legendary creatures and planeswalkers to find your next commander. Filter by color identity to narrow down your choices.
- **Smart Deck Building**:
  - **Color Identity Enforcement**: Automatically filters your library to only show cards compatible with your commander's color identity.
  - **Singleton Rule**: Prevents adding duplicate cards (except basic lands) to ensure your deck is Commander legal.
- **Auto-Build**: Generate a deck list based on your commander using intelligent suggestions (powered by Scryfall data).
- **Deck Balancing**: Automatically fill your deck to 100 cards with a balanced mix of lands and spells from your available collection.
- **Search & Filter**: Quickly find specific cards in your collection with real-time search and filtering.

## Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **CSV Parsing**: [PapaParse](https://www.papaparse.com/)
- **Data Source**: [Scryfall API](https://scryfall.com/docs/api)

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm, yarn, pnpm, or bun

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/commander-deck-builder.git
   cd commander-deck-builder
   ```

2. Install dependencies:
   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

1. **Export Collection**: Export your card collection from Manabox as a CSV file.
2. **Upload**: On the home page, upload your CSV file.
3. **Choose Commander**: Select a legendary creature or planeswalker to lead your deck. Use the color filters to find specific color combinations.
4. **Build**:
   - Manually add cards from your library.
   - Use **Auto-Build** to get suggestions based on your commander.
   - Use **Balance Deck** to automatically fill remaining slots with appropriate lands and spells from your collection.
5. **Review**: Check your deck list in the sidebar and make final adjustments.

## Credits

Imagined and created by **Trashpanda** using **Gemini 3** and **Antigravity**.
