import { NextRequest, NextResponse } from 'next/server';

//
// ---- Types ----
//

interface ScryfallCard {
    id: string;
    name: string;
    type_line: string;
    color_identity: string[];
    edhrec_rank?: number;
    mana_cost?: string;
}

interface CollectionCard {
    name: string;
    scryfallId: string;
    details?: {
        type_line?: string;
        color_identity?: string[];
        mana_cost?: string;
    };
}

interface BuildRequestBody {
    commanderName: string;
    collection: CollectionCard[];
}

//
// ---- Route Handler ----
//

export async function POST(request: NextRequest) {
    try {
        //
        // Parse request safely
        //
        const body = (await request.json()) as BuildRequestBody;
        const { commanderName, collection = [] } = body;

        if (!commanderName) {
            return NextResponse.json({ error: "Commander name is required" }, { status: 400 });
        }

        console.log("Building deck for:", commanderName);
        console.log("Collection size:", collection.length);

        //
        // Fetch commander data
        //
        const commanderResponse = await fetch(
            `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(commanderName)}`
        );

        if (!commanderResponse.ok) {
            console.error("Commander not found:", commanderName);
            return NextResponse.json({ error: "Commander not found" }, { status: 404 });
        }

        const commander: ScryfallCard = await commanderResponse.json();
        const commanderColors = commander.color_identity ?? [];

        console.log("Commander colors:", commanderColors);

        //
        // Deck container
        //
        const TARGET_NON_LAND = 60;
        const TARGET_LANDS = 39;
        const cardNames: string[] = [];

        //
        // ---- STEP 1: Filter collection ----
        //

        const eligible = collection.filter((card) => {
            const type = card.details?.type_line ?? "";
            const ci = card.details?.color_identity ?? [];

            if (card.name.toLowerCase() === commanderName.toLowerCase()) return false;
            if (type.includes("Basic Land")) return false;
            return ci.every((c) => commanderColors.includes(c));
        });

        // Singleton rule: dedupe by name
        const uniqueEligible = Array.from(new Map(eligible.map((c) => [c.name, c])).values());

        console.log("Eligible:", uniqueEligible.length);

        //
        // Categorize
        //
        //
        // ---- STEP 1.5: Fetch Staples (NEW) ----
        //
        const TARGET_STAPLES = 15;
        const staples: ScryfallCard[] = [];
        const suggestedDetails: ScryfallCard[] = [];

        try {
            const colorQuery = commanderColors.length === 0 ? "id:c" : `id<=${commanderColors.join("")}`;
            // Fetch slightly more to ensure we get non-lands
            const staplesResp = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`${colorQuery} legal:commander -t:land -t:basic`)}&order=edhrec&dir=asc&page=1`);
            if (staplesResp.ok) {
                const data = await staplesResp.json();
                // Filter out commander itself just in case
                const list = data.data.filter((c: any) => c.name !== commanderName).slice(0, TARGET_STAPLES);
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

        // Add staples and count
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

        console.log(`Added ${staples.length} staples. Ramp: ${rampCount}, Draw: ${drawCount}, Removal: ${removalCount}, Creatures: ${creatureCount}`);

        //
        // Categorize Collection (excluding staples)
        //
        const creatures = uniqueEligible.filter((c) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isCreature(t, n);
        });

        const removal = uniqueEligible.filter((c) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isRemoval(t, n);
        });

        const ramp = uniqueEligible.filter((c) => {
            if (cardNames.includes(c.name)) return false;
            const t = c.details?.type_line ?? "";
            const n = c.name;
            return isRamp(t, n);
        });

        const draw = uniqueEligible.filter((c) => {
            if (cardNames.includes(c.name)) return false;
            const n = c.name;
            return isDraw(n);
        });

        const nonBasicLands = uniqueEligible.filter((c) => {
            const t = c.details?.type_line ?? "";
            return t.includes("Land") && !t.includes("Basic");
        });

        const other = uniqueEligible.filter(
            (c) => !cardNames.includes(c.name) &&
                !creatures.includes(c) && !removal.includes(c) &&
                !ramp.includes(c) && !draw.includes(c) && !nonBasicLands.includes(c)
        );

        //
        // Card-adding helper
        //
        const addCards = (list: CollectionCard[], max: number) => {
            const chosen = list.slice(0, max).map((c) => c.name);
            cardNames.push(...chosen);
            return chosen.length;
        };

        //
        // Build non-land section using ratios (adjusted for staples)
        //
        let added = 0;
        added += addCards(ramp, Math.max(0, 10 - rampCount));
        added += addCards(draw, Math.max(0, 5 - drawCount));
        added += addCards(removal, Math.max(0, 10 - removalCount));
        added += addCards(creatures, Math.max(0, 30 - creatureCount));

        // Fill remainder with other cards from collection
        const remainingSlots = Math.max(0, TARGET_NON_LAND - cardNames.length);
        added += addCards(other, remainingSlots);

        console.log("Added from collection:", added);

        //
        // ---- STEP 2: Suggest Scryfall fillers if needed ----
        //
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
                        !cardNames.includes(c.name)
                    )
                    .slice(0, need);

                suggestions.forEach(c => {
                    cardNames.push(c.name);
                    suggestedDetails.push(c);
                });
            }
        }

        //
        // ---- STEP 3: Add lands ----
        //
        const basicMap: Record<string, string> = {
            W: "Plains",
            U: "Island",
            B: "Swamp",
            R: "Mountain",
            G: "Forest",
        };

        let landCount = 0;

        // add non-basic from collection
        const eligibleNonBasicLands = uniqueEligible.filter((c) => {
            const type = c.details?.type_line ?? "";
            const ci = c.details?.color_identity ?? [];
            return (
                type.includes("Land") &&
                !type.includes("Basic") &&
                ci.every((x) => commanderColors.includes(x))
            );
        });

        const nonBasicToAdd = Math.min(eligibleNonBasicLands.length, Math.floor(TARGET_LANDS / 2));
        eligibleNonBasicLands.slice(0, nonBasicToAdd).forEach((c) => cardNames.push(c.name));
        landCount += nonBasicToAdd;

        // fill with basics
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

        //
        // Return deck
        //
        return NextResponse.json({
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
        return NextResponse.json(
            {
                error: "Failed to build deck",
                details: err instanceof Error ? err.message : String(err),
            },
            { status: 500 }
        );
    }
}
