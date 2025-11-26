import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import { fetchCardCollection } from '@/lib/scryfall';
import { CollectionCard, ScryfallCard } from '@/lib/types';
import fs from 'fs/promises';
import path from 'path';

// In-memory cache for enriched cards (simple version)
let cardCache: Record<string, ScryfallCard> = {};
const DATA_DIR = path.join(process.cwd(), 'data');
const COLLECTION_PATH = path.join(DATA_DIR, 'collection.json');

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
        }

        const text = await file.text();
        let rows: any[] = [];

        if (file.name.endsWith('.csv')) {
            // Parse CSV
            const parseResult = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
            });

            if (parseResult.errors.length > 0) {
                return NextResponse.json({ error: 'CSV parsing error', details: parseResult.errors }, { status: 400 });
            }
            rows = parseResult.data as any[];
        } else if (file.name.endsWith('.txt')) {
            // Parse TXT
            // Format: Quantity Name (SetCode) CollectorNumber [*F*]
            // Regex: ^(\d+)\s+(.+)\s+\(([A-Z0-9]+)\)\s+([A-Z0-9-]+)(?:\s+\*[A-Z]+\*)?$
            const lines = text.split('\n');
            console.log(`[TXT Import] Found ${lines.length} lines`);
            rows = lines.map(line => {
                // Relaxed regex to capture flags like *F*, *E*, etc. or just ignore trailing garbage
                const match = line.trim().match(/^(\d+)\s+(.+)\s+\(([A-Z0-9]+)\)\s+([A-Z0-9-]+)(?:\s+\*([A-Z]+)\*)?$/);
                if (match) {
                    return {
                        'Quantity': match[1],
                        'Name': match[2],
                        'Set Code': match[3].toLowerCase(), // Scryfall expects lowercase set codes
                        'Collector Number': match[4],
                        'source': 'txt'
                    };
                }
                console.log(`[TXT Import] Failed to parse line: ${line}`);
                return null;
            }).filter(Boolean);
            console.log(`[TXT Import] Parsed ${rows.length} rows`);
        }

        // Extract Scryfall IDs and basic info
        const collection: CollectionCard[] = rows.map((row) => ({
            quantity: parseInt(row['Quantity'] || '1', 10),
            scryfallId: row['Scryfall ID'] || '', // Placeholder
            name: row['Name'],
            set: row['Set Code'],
            collectorNumber: row['Collector Number']
        })).filter(c => c.scryfallId || (c.set && c.collectorNumber)); // Allow if we have set/cn

        console.log(`[TXT Import] Collection size: ${collection.length}`);


        // Identify missing cards in cache
        const missingIdentifiers: any[] = [];

        collection.forEach(c => {
            if (c.scryfallId) {
                if (!cardCache[c.scryfallId]) {
                    missingIdentifiers.push({ id: c.scryfallId });
                }
            } else if (c.set && c.collectorNumber) {
                // Check if we have it in cache (we might need a secondary cache or just check if we have a card with this set/cn)
                // For simplicity, let's just fetch it. Scryfall handles duplicates in response?
                // Actually, we need to map the result back to the collection item.
                // If we fetch by set/cn, the result will have an ID.
                // We should probably just fetch all missing ones.
                missingIdentifiers.push({ set: c.set, collector_number: c.collectorNumber });
            }
        });

        console.log(`[TXT Import] Missing identifiers: ${missingIdentifiers.length}`);

        // Fetch missing cards
        if (missingIdentifiers.length > 0) {
            const fetchedCards = await fetchCardCollection(missingIdentifiers);
            console.log(`[TXT Import] Fetched ${fetchedCards.length} cards from Scryfall`);
            fetchedCards.forEach(card => {
                cardCache[card.id] = card;
                // Also cache by set/cn if needed? 
                // We need to link the fetched card back to the collection item if it didn't have an ID.
            });
        }

        // Enrich collection
        const enrichedCollection = collection.map(c => {
            let details: ScryfallCard | undefined;
            if (c.scryfallId) {
                details = cardCache[c.scryfallId];
            } else if (c.set && c.collectorNumber) {
                // Find in cache by set/cn
                details = Object.values(cardCache).find(card =>
                    card.set === c.set && card.collector_number === c.collectorNumber
                );
                // If found, update the collection item with the ID
                if (details) {
                    c.scryfallId = details.id;
                }
            }
            return {
                ...c,
                details,
            };
        });

        // Save to file
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(COLLECTION_PATH, JSON.stringify(enrichedCollection, null, 2));

        return NextResponse.json({ success: true, count: enrichedCollection.length });

    } catch (error) {
        console.error('Upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
