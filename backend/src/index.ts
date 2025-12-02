import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import Papa from 'papaparse';
import { fetchCardCollection } from './scryfall';
import { CollectionCard, ScryfallCard } from './types';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

const DATA_DIR = path.join(process.cwd(), 'data');
const COLLECTION_PATH = path.join(DATA_DIR, 'collection.json');

// In-memory cache for enriched cards (simple version)
let cardCache: Record<string, ScryfallCard> = {};

// Ensure data dir exists
const initDataDir = async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (e) {
        console.error("Failed to create data dir", e);
    }
};
initDataDir();

//
// Routes
//

// GET /api/collection
app.get('/api/collection', async (req, res) => {
    try {
        const data = await fs.readFile(COLLECTION_PATH, 'utf-8');
        const collection = JSON.parse(data);
        res.json({ collection });
    } catch (error) {
        console.error('Error reading collection:', error);
        res.json({ collection: [] });
    }
});

// POST /api/upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const text = req.file.buffer.toString('utf-8');
        let rows: any[] = [];

        if (req.file.originalname.endsWith('.csv')) {
            // Parse CSV
            const parseResult = Papa.parse(text, {
                header: true,
                skipEmptyLines: true,
            });

            if (parseResult.errors.length > 0) {
                return res.status(400).json({ error: 'CSV parsing error', details: parseResult.errors });
            }
            rows = parseResult.data as any[];
        } else if (req.file.originalname.endsWith('.txt')) {
            // Parse TXT
            const lines = text.split('\n');
            console.log(`[TXT Import] Found ${lines.length} lines`);
            rows = lines.map(line => {
                const match = line.trim().match(/^(\d+)\s+(.+)\s+\(([A-Z0-9]+)\)\s+([A-Z0-9-]+)(?:\s+\*([A-Z]+)\*)?$/);
                if (match) {
                    return {
                        'Quantity': match[1],
                        'Name': match[2],
                        'Set Code': match[3].toLowerCase(),
                        'Collector Number': match[4],
                        'source': 'txt'
                    };
                }
                return null;
            }).filter(Boolean);
            console.log(`[TXT Import] Parsed ${rows.length} rows`);
        }

        // Extract Scryfall IDs and basic info
        const collection: CollectionCard[] = rows.map((row) => ({
            quantity: parseInt(row['Quantity'] || '1', 10),
            scryfallId: row['Scryfall ID'] || '',
            name: row['Name'],
            set: row['Set Code'],
            collectorNumber: row['Collector Number']
        })).filter(c => c.scryfallId || (c.set && c.collectorNumber));

        console.log(`[TXT Import] Collection size: ${collection.length}`);

        // Identify missing cards in cache
        const missingIdentifiers: any[] = [];

        collection.forEach(c => {
            if (c.scryfallId) {
                if (!cardCache[c.scryfallId]) {
                    missingIdentifiers.push({ id: c.scryfallId });
                }
            } else if (c.set && c.collectorNumber) {
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
            });
        }

        // Enrich collection
        const enrichedCollection = collection.map(c => {
            let details: ScryfallCard | undefined;
            if (c.scryfallId) {
                details = cardCache[c.scryfallId];
            } else if (c.set && c.collectorNumber) {
                details = Object.values(cardCache).find(card =>
                    card.set === c.set && card.collector_number === c.collectorNumber
                );
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
        await fs.writeFile(COLLECTION_PATH, JSON.stringify(enrichedCollection, null, 2));

        res.json({ success: true, count: enrichedCollection.length });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/auto-build
app.post('/api/auto-build', async (req, res) => {
    try {
        const { commanderName, collection = [] } = req.body;

        if (!commanderName) {
            return res.status(400).json({ error: "Commander name is required" });
        }

        console.log("Building deck for:", commanderName);
        console.log("Collection size:", collection.length);

        // Fetch commander data
        const commanderResponse = await fetch(
            `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderName)}`
        );

        if (!commanderResponse.ok) {
            console.error("Commander not found:", commanderName);
            return res.status(404).json({ error: "Commander not found" });
        }

        const commander: ScryfallCard = await commanderResponse.json();
        const commanderColors = commander.color_identity ?? [];

        console.log("Commander colors:", commanderColors);

        const TARGET_NON_LAND = 60;
        const TARGET_LANDS = 39;
        const cardNames: string[] = [];

        // Helper to check relevance
        const isCardRelevant = (cardObj: any) => {
            if (!cardObj) return true;
            let text = cardObj.oracle_text || "";
            if (!text && cardObj.card_faces) {
                text = cardObj.card_faces.map((f: any) => f.oracle_text || "").join("\n");
            }

            const colorMap: Record<string, string> = {
                'White': 'W', 'Blue': 'U', 'Black': 'B', 'Red': 'R', 'Green': 'G'
            };

            for (const [colorName, colorCode] of Object.entries(colorMap)) {
                if (!commanderColors.includes(colorCode)) {
                    const regex = new RegExp(`\\b${colorName}\\b`, 'i');
                    if (regex.test(text)) {
                        if (
                            /protection from/i.test(text) ||
                            /destroy/i.test(text) ||
                            /exile/i.test(text) ||
                            /opponent/i.test(text) ||
                            /choose a color/i.test(text) ||
                            /any color/i.test(text) ||
                            /landwalk/i.test(text)
                        ) {
                            continue;
                        }
                        return false;
                    }
                }
            }
            return true;
        };

        // Filter collection
        const eligible = collection.filter((card: CollectionCard) => {
            const type = card.details?.type_line ?? "";
            const ci = card.details?.color_identity ?? [];

            if (card.name.toLowerCase() === commanderName.toLowerCase()) return false;
            if (type.includes("Basic Land")) return false;
            if (!ci.every((c) => commanderColors.includes(c))) return false;

            return isCardRelevant(card.details);
        });

        const uniqueEligible = Array.from(new Map(eligible.map((c: CollectionCard) => [c.name, c])).values()) as CollectionCard[];

        console.log("Eligible:", uniqueEligible.length);

        // Fetch Staples
        const TARGET_STAPLES = 15;
        const staples: ScryfallCard[] = [];
        const suggestedDetails: ScryfallCard[] = [];

        try {
            const colorQuery = commanderColors.length === 0 ? "id:c" : `id<=${commanderColors.join("")}`;
            const staplesResp = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${colorQuery} legal:commander -t:land -t:basic`)}&order=edhrec&dir=asc&page=1`);
            if (staplesResp.ok) {
                const data = await staplesResp.json();
                const list = data.data.filter((c: any) =>
                    c.name !== commanderName &&
                    isCardRelevant(c)
                ).slice(0, TARGET_STAPLES);
                staples.push(...list);
                suggestedDetails.push(...list);
            }
        } catch (e) {
            console.error("Failed to fetch staples", e);
        }

        // Helper predicates
        const isCreature = (t: string, n: string) => t.includes("Creature") && !t.includes("Legendary");
        const isRemoval = (t: string, n: string) => /Instant|Sorcery/.test(t) && /destroy|exile|kill|terminate|path|swords|wrath|damnation|wipe/.test(n.toLowerCase());
        const isRamp = (t: string, n: string) => /(Artifact|Enchantment|Sorcery)/.test(t) && /(sol ring|mana|ramp|cultivate|kodama|reach|signet|talisman|arcane|fellwar)/.test(n.toLowerCase());
        const isDraw = (n: string) => /(draw|rhystic|study|mystic|remora|phyrexian arena|necropotence|sylvan library)/.test(n.toLowerCase());

        let rampCount = 0;
        let drawCount = 0;
        let removalCount = 0;
        let creatureCount = 0;

        staples.forEach(c => {
            cardNames.push(c.name);
            const t = c.type_line || "";
            const n = c.name;

            if (isRamp(t, n)) rampCount++;
            else if (isDraw(n)) drawCount++;
            else if (isRemoval(t, n)) removalCount++;
            else if (isCreature(t, n)) creatureCount++;
        });

        console.log(`Added ${staples.length} staples.`);

        // Categorize Collection
        const creatures = uniqueEligible.filter((c: CollectionCard) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isCreature(t, n);
        });

        const removal = uniqueEligible.filter((c: CollectionCard) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isRemoval(t, n);
        });

        const ramp = uniqueEligible.filter((c: CollectionCard) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isRamp(t, n);
        });

        const draw = uniqueEligible.filter((c: CollectionCard) => {
            if (cardNames.includes(c.name)) return false;
            const n = c.name;
            return isDraw(n);
        });

        const nonBasicLands = uniqueEligible.filter((c: CollectionCard) => {
            const t = c.details?.type_line ?? "";
            return t.includes("Land") && !t.includes("Basic");
        });

        const other = uniqueEligible.filter(
            (c: CollectionCard) => !cardNames.includes(c.name) &&
                !creatures.includes(c) && !removal.includes(c) &&
                !ramp.includes(c) && !draw.includes(c) && !nonBasicLands.includes(c)
        );

        const addCards = (list: CollectionCard[], max: number) => {
            const chosen = list.slice(0, max).map((c) => c.name);
            cardNames.push(...chosen);
            return chosen.length;
        };

        let added = 0;
        added += addCards(ramp, Math.max(0, 10 - rampCount));
        added += addCards(draw, Math.max(0, 5 - drawCount));
        added += addCards(removal, Math.max(0, 10 - removalCount));
        added += addCards(creatures, Math.max(0, 30 - creatureCount));

        const remainingSlots = Math.max(0, TARGET_NON_LAND - cardNames.length);
        added += addCards(other, remainingSlots);

        console.log("Added from collection:", added);

        // Suggest Scryfall fillers
        if (cardNames.length < TARGET_NON_LAND) {
            const need = TARGET_NON_LAND - cardNames.length;
            console.log("Need additional:", need);

            const colorQuery =
                commanderColors.length === 0
                    ? "id:c"
                    : `id<=${commanderColors.join("")}`;

            const scryQuery = `${colorQuery} -t:basic f:commander legal:commander usd<=2`;

            const resp = await fetch(
                `https://api.scryfall.com/cards/search?q=${encodeURIComponent(
                    scryQuery
                )}&order=edhrec&dir=asc&page=1`
            );

            if (resp.ok) {
                const data: { data: ScryfallCard[] } = await resp.json();

                const suggestions = data.data
                    .filter((c) =>
                        c.name.toLowerCase() !== commanderName.toLowerCase() &&
                        !cardNames.includes(c.name) &&
                        isCardRelevant(c)
                    )
                    .slice(0, need);

                suggestions.forEach(c => {
                    cardNames.push(c.name);
                    suggestedDetails.push(c);
                });
            }
        }

        // Add lands
        const basicMap: Record<string, string> = {
            W: "Plains",
            U: "Island",
            B: "Swamp",
            R: "Mountain",
            G: "Forest",
        };

        let landCount = 0;

        const eligibleNonBasicLands = uniqueEligible.filter((c: CollectionCard) => {
            const type = c.details?.type_line ?? "";
            const ci = c.details?.color_identity ?? [];
            return (
                type.includes("Land") &&
                !type.includes("Basic") &&
                ci.every((x) => commanderColors.includes(x))
            );
        });

        const nonBasicToAdd = Math.min(eligibleNonBasicLands.length, Math.floor(TARGET_LANDS / 2));
        eligibleNonBasicLands.slice(0, nonBasicToAdd).forEach((c: CollectionCard) => cardNames.push(c.name));
        landCount += nonBasicToAdd;

        const remaining = TARGET_LANDS - landCount;
        const perColor = commanderColors.length ? Math.floor(remaining / commanderColors.length) : 0;
        const extra = commanderColors.length ? remaining % commanderColors.length : 0;

        commanderColors.forEach((color, i) => {
            const landName = basicMap[color];
            if (!landName) return;

            let count = perColor + (i < extra ? 1 : 0);
            for (let x = 0; x < count; x++) cardNames.push(landName);
        });

        console.log("Total cards:", cardNames.length);

        res.json({
            success: true,
            deckName: `Auto-built ${commanderName} deck`,
            cardNames,
            suggestedDetails,
            deckUrl: `https://edhrec.com/commanders/${commander.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")}`,
        });

    } catch (err) {
        console.error("Auto-build error:", err);
        res.status(500).json({
            error: "Failed to build deck",
            details: err instanceof Error ? err.message : String(err),
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
