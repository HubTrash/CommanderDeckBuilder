'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { CollectionCard, Deck, ScryfallCard } from '@/lib/types';
import { ColorPicker } from '@/components/ColorPicker';
import { CardGrid } from '@/components/CardGrid';
import { DeckSidebar } from '@/components/DeckSidebar';
import { ArrowLeft, Filter, Search, Sparkles } from 'lucide-react';

export default function BuilderPage() {
    const router = useRouter();
    const [collection, setCollection] = useState<CollectionCard[]>([]);
    const [selectedColors, setSelectedColors] = useState<string[]>([]);
    const [deck, setDeck] = useState<Deck>({ cards: [], colors: [], missingCards: [] });
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'commander' | 'library'>('commander');
    const [isAutoBuilding, setIsAutoBuilding] = useState(false);

    // Load collection on mount
    useEffect(() => {
        const fetchCollection = async () => {
            try {
                const res = await fetch('/api/collection');
                if (!res.ok) throw new Error('Failed to fetch collection');
                const data = await res.json();
                if (data.collection && data.collection.length > 0) {
                    setCollection(data.collection);
                } else {
                    // If no collection found, redirect to upload
                    router.push('/');
                }
            } catch (e) {
                console.error('Failed to load collection', e);
                router.push('/');
            }
        };

        fetchCollection();
    }, [router]);

    // Update deck colors when commander changes
    useEffect(() => {
        if (deck.commander) {
            setDeck(prev => ({ ...prev, colors: deck.commander?.color_identity || [] }));
            setSelectedColors(deck.commander.color_identity || []);
        }
    }, [deck.commander]);

    // Filter Logic
    const filteredCards = useMemo(() => {
        let filtered = collection;

        // 1. Filter by Search
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(c => c.name.toLowerCase().includes(q) || c.details?.type_line.toLowerCase().includes(q));
        }

        // 2. Filter by Mode (Commander vs Library)
        if (activeTab === 'commander') {
            return filtered.filter(c => {
                const type = c.details?.type_line || '';
                const isLegendaryCreature = type.includes('Legendary Creature');
                // Simple Planeswalker commander check (can be improved)
                const isPlaneswalkerCommander = type.includes('Planeswalker') && (c.details?.oracle_text?.includes('can be your commander') || false);

                if (!isLegendaryCreature && !isPlaneswalkerCommander) return false;

                // Color Identity Check: Must be EXACTLY within selected colors if colors are selected
                // Or just show all if no colors selected yet (to let user pick commander first)
                if (selectedColors.length > 0) {
                    const identity = c.details?.color_identity || [];
                    // Check if identity is a subset of selectedColors
                    return identity.every(color => selectedColors.includes(color));
                }
                return true;
            });
        } else {
            // Library Mode
            if (!deck.commander) return []; // Need commander first

            return filtered.filter(c => {
                // Exclude if it is the commander (by name)
                if (c.name === deck.commander?.name) return false;

                // Exclude cards already in deck (Singleton Rule by Name)
                // Exception: Basic Lands
                const isBasicLand = c.details?.type_line?.includes('Basic Land');

                if (!isBasicLand) {
                    const alreadyInDeck = deck.cards.some(dc => dc.name === c.name);
                    if (alreadyInDeck) return false;
                }

                // Color Identity Check: Must be subset of Commander's identity
                const identity = c.details?.color_identity || [];
                const commanderIdentity = deck.commander?.color_identity || [];

                // Card identity must be subset of Commander identity
                // Exception: Colorless cards (identity []) are always allowed
                return identity.every(color => commanderIdentity.includes(color));
            });
        }
    }, [collection, searchQuery, activeTab, selectedColors, deck.commander, deck.cards]);

    // Actions
    const setCommander = (card: CollectionCard) => {
        if (!card.details) return;
        setDeck(prev => ({ ...prev, commander: card.details as ScryfallCard }));
        setActiveTab('library');
    };

    const addToDeck = (card: CollectionCard) => {
        setDeck(prev => ({ ...prev, cards: [...prev.cards, card] }));
    };

    const removeFromDeck = (card: CollectionCard) => {
        setDeck(prev => {
            const idx = prev.cards.findIndex(c => c.scryfallId === card.scryfallId);
            if (idx === -1) return prev;
            const newCards = [...prev.cards];
            newCards.splice(idx, 1);
            return { ...prev, cards: newCards };
        });
    };

    const removeCommander = () => {
        setDeck(prev => ({ ...prev, commander: undefined }));
        setActiveTab('commander');
        setSelectedColors([]);
    };

    const handleAutoBuild = async () => {
        if (!deck.commander) return;

        setIsAutoBuilding(true);
        try {
            const response = await fetch('/api/auto-build', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    commanderName: deck.commander.name,
                    collection: collection
                }),
            });

            if (!response.ok) {
                throw new Error('Failed to auto-build');
            }

            const data = await response.json();
            const { cardNames, suggestedDetails = [] } = data;

            const addedCards: CollectionCard[] = [];
            const missing: ScryfallCard[] = [];

            // Track added counts to handle basic lands and singleton enforcement
            const addedCounts: Record<string, number> = {};

            // Match suggested cards with collection
            cardNames.forEach((cardName: string) => {
                const isBasicLand = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'].includes(cardName);

                // If not basic land and already added, skip (enforce singleton for non-basics)
                if (!isBasicLand && addedCounts[cardName]) return;

                const cardInCollection = collection.find(
                    c => c.name.toLowerCase() === cardName.toLowerCase()
                );

                if (cardInCollection) {
                    // Check if already in deck (for non-basics)
                    const alreadyInDeck = deck.cards.some(dc => dc.name === cardInCollection.name);

                    if (isBasicLand || !alreadyInDeck) {
                        // For basic lands, we can add multiple. For others, just one.
                        // If we are adding a basic land from collection, we clone it to ensure unique IDs if needed, 
                        // or just reuse if we don't care about unique IDs for collection items (but we should for React keys)
                        // Better to create a copy for the deck.
                        addedCards.push({
                            ...cardInCollection,
                            scryfallId: isBasicLand ? `${cardInCollection.scryfallId}-${Math.random()}` : cardInCollection.scryfallId
                        });
                        addedCounts[cardName] = (addedCounts[cardName] || 0) + 1;
                    }
                } else {
                    // Find details in suggestedDetails
                    const details = suggestedDetails.find((d: ScryfallCard) => d.name === cardName);
                    if (details) {
                        missing.push(details);
                        addedCounts[cardName] = (addedCounts[cardName] || 0) + 1;
                    } else if (isBasicLand) {
                        // Generate dummy basic land
                        const basicMap: Record<string, string> = {
                            'Plains': 'W', 'Island': 'U', 'Swamp': 'B', 'Mountain': 'R', 'Forest': 'G', 'Wastes': 'C'
                        };
                        const color = basicMap[cardName] || 'C';

                        addedCards.push({
                            quantity: 1,
                            name: cardName,
                            scryfallId: `basic-${cardName}-${Math.random()}`,
                            details: {
                                id: `basic-${cardName}-dummy`,
                                name: cardName,
                                cmc: 0,
                                type_line: `Basic Land — ${cardName}`,
                                color_identity: [color],
                                rarity: 'common',
                                set_name: 'Basic Lands',
                                set: 'basic',
                                collector_number: '0',
                                image_uris: {
                                    small: `https://cards.scryfall.io/large/front/dummy/${cardName.toLowerCase()}.jpg`, // Placeholder, won't load but prevents crash
                                    normal: `https://cards.scryfall.io/large/front/dummy/${cardName.toLowerCase()}.jpg`,
                                    large: '',
                                    png: '',
                                    art_crop: '',
                                    border_crop: ''
                                }
                            } as ScryfallCard
                        });
                        addedCounts[cardName] = (addedCounts[cardName] || 0) + 1;
                    } else {
                        console.warn(`No details found for missing card: ${cardName}`);
                    }
                }
            });

            // Update deck with new cards and missing list
            setDeck(prev => ({
                ...prev,
                cards: [...prev.cards, ...addedCards],
                missingCards: missing,
            }));

        } catch (error) {
            console.error('Auto-build failed:', error);
            alert('Failed to auto-build deck. Please try again.');
        } finally {
            setIsAutoBuilding(false);
        }
    };

    const handleBalanceDeck = () => {
        if (!deck.commander) return;

        const TARGET_LANDS = 35;
        const TARGET_TOTAL = 99; // 99 + 1 commander = 100

        // Separate lands from non-lands in current deck
        const currentLands = deck.cards.filter(c => c.details?.type_line?.includes('Land'));

        // Calculate needs
        const landsNeeded = Math.max(0, TARGET_LANDS - currentLands.length);
        const totalSlotsAvailable = TARGET_TOTAL - deck.cards.length;

        // Get available cards from collection
        const commanderIdentity = deck.commander.color_identity || [];

        console.log('Balance Deck Debug:', {
            currentLandsCount: currentLands.length,
            currentTotalCards: deck.cards.length,
            landsNeeded,
            totalSlotsAvailable,
            commanderIdentity
        });

        if (totalSlotsAvailable <= 0) {
            alert("Deck is already full!");
            return;
        }

        // Helper to check relevance
        const isCardRelevant = (card: CollectionCard) => {
            let text = card.details?.oracle_text || "";
            if (!text && card.details?.card_faces) {
                text = card.details.card_faces.map(f => f.oracle_text).join("\n");
            }

            const colorMap: Record<string, string> = {
                'White': 'W', 'Blue': 'U', 'Black': 'B', 'Red': 'R', 'Green': 'G'
            };

            for (const [colorName, colorCode] of Object.entries(colorMap)) {
                if (!commanderIdentity.includes(colorCode)) {
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

        const availableCards = collection.filter(c => {
            // Allow basic lands even if already in deck (infinite supply)
            const isBasicLand = c.details?.type_line?.includes('Basic Land');
            if (!isBasicLand && deck.cards.some(dc => dc.name === c.name)) return false;
            if (c.name === deck.commander?.name) return false;
            const identity = c.details?.color_identity || [];
            if (!identity.every(color => commanderIdentity.includes(color))) return false;
            if (!isCardRelevant(c)) return false;
            return true;
        });

        // Deduplicate available cards (but NOT basic lands)
        const uniqueAvailable = Array.from(
            new Map(
                availableCards
                    .filter(c => !c.details?.type_line?.includes('Basic Land'))
                    .map(c => [c.name, c])
            ).values()
        );

        const availableNonBasicLands = uniqueAvailable.filter(c => c.details?.type_line?.includes('Land'));
        const availableNonLands = uniqueAvailable.filter(c => !c.details?.type_line?.includes('Land'));

        // Sort non-lands by rarity
        const rarityScore = (rarity?: string) => {
            switch (rarity) {
                case 'mythic': return 4;
                case 'rare': return 3;
                case 'uncommon': return 2;
                default: return 1;
            }
        };
        availableNonLands.sort((a, b) => rarityScore(b.details?.rarity) - rarityScore(a.details?.rarity));

        const cardsToAdd: CollectionCard[] = [];
        let slotsLeft = totalSlotsAvailable;

        // 1. Fill Lands First
        // We want to add up to 'landsNeeded', but limited by 'slotsLeft'
        const landsToAddCount = Math.min(landsNeeded, slotsLeft);

        console.log('Land filling:', { landsToAddCount, availableNonBasicLands: availableNonBasicLands.length });

        // Add a mix: up to 50% non-basic lands, rest basic lands
        const maxNonBasics = Math.floor(landsToAddCount * 0.5); // 50% max non-basics
        const nonBasicsToAdd = Math.min(maxNonBasics, availableNonBasicLands.length);

        // Add non-basic lands from collection
        for (let i = 0; i < nonBasicsToAdd; i++) {
            cardsToAdd.push(availableNonBasicLands[i]);
        }

        // Fill remaining land slots with Basics (infinite supply)
        const landsStillNeeded = landsToAddCount - cardsToAdd.length;
        console.log('Basic lands needed:', landsStillNeeded, 'Non-basics added:', nonBasicsToAdd);

        if (landsStillNeeded > 0 && commanderIdentity.length > 0) {
            const basicMap: Record<string, string> = {
                W: "Plains",
                U: "Island",
                B: "Swamp",
                R: "Mountain",
                G: "Forest",
            };

            const perColor = Math.floor(landsStillNeeded / commanderIdentity.length);
            let extra = landsStillNeeded % commanderIdentity.length;

            console.log('Generating basics:', { perColor, extra, colors: commanderIdentity });

            commanderIdentity.forEach(color => {
                const count = perColor + (extra > 0 ? 1 : 0);
                extra--;
                const landName = basicMap[color];

                console.log(`Adding ${count} ${landName}`);

                const realLand = collection.find(c => c.name === landName && c.details?.type_line?.includes('Basic'));

                for (let k = 0; k < count; k++) {
                    cardsToAdd.push({
                        quantity: 1,
                        name: landName,
                        scryfallId: `basic-${landName}-${Math.random()}`,
                        details: realLand?.details || {
                            id: `basic-${landName}-dummy`,
                            name: landName,
                            cmc: 0,
                            type_line: `Basic Land — ${landName}`,
                            color_identity: [color],
                            rarity: 'common',
                            set_name: 'Basic Lands',
                            set: 'basic',
                            collector_number: '0',
                            image_uris: {
                                small: '',
                                normal: '',
                                large: '',
                                png: '',
                                art_crop: '',
                                border_crop: ''
                            }
                        } as ScryfallCard
                    });
                }
            });
        }

        // Update slotsLeft
        slotsLeft -= cardsToAdd.length;

        // 2. Fill remaining slots with Non-Lands
        if (slotsLeft > 0) {
            for (let i = 0; i < Math.min(slotsLeft, availableNonLands.length); i++) {
                cardsToAdd.push(availableNonLands[i]);
            }
        }

        console.log('Total cards to add:', cardsToAdd.length, 'Lands:', cardsToAdd.filter(c => c.details?.type_line?.includes('Land')).length);

        // Update deck
        setDeck(prev => ({
            ...prev,
            cards: [...prev.cards, ...cardsToAdd],
            missingCards: []
        }));

        alert(`Deck balanced! Added ${cardsToAdd.length} cards (${cardsToAdd.filter(c => c.details?.type_line?.includes('Land')).length} lands).`);
    };

    return (
        <div className="min-h-screen bg-slate-950 text-slate-200 flex">
            {/* Main Content */}
            <div className="flex-1 mr-80 flex flex-col h-screen overflow-hidden">
                {/* Header */}
                <header className="bg-slate-900/50 backdrop-blur border-b border-slate-800 p-4 flex items-center justify-between z-10">
                    <div className="flex items-center gap-4">
                        <button onClick={() => router.push('/')} className="p-2 hover:bg-slate-800 rounded-lg transition-colors">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-400 to-indigo-400">
                            Deck Builder
                        </h1>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Search */}
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Search cards..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-full pl-10 pr-4 py-1.5 text-sm focus:outline-none focus:border-violet-500 w-64 transition-colors"
                            />
                        </div>

                        {/* Color Picker (Only active in Commander selection mode) */}
                        <div className={`transition-opacity duration-200 ${activeTab === 'library' ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                            <ColorPicker selectedColors={selectedColors} onChange={setSelectedColors} />
                        </div>
                    </div>
                </header>

                {/* Tabs */}
                <div className="flex border-b border-slate-800 bg-slate-900/30">
                    <button
                        onClick={() => setActiveTab('commander')}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'commander' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'}`}
                    >
                        1. Choose Commander
                    </button>
                    <button
                        onClick={() => setActiveTab('library')}
                        disabled={!deck.commander}
                        className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'library' ? 'border-violet-500 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed'}`}
                    >
                        2. Build Library
                    </button>
                </div>

                {/* Content Area */}
                <main className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                    <div className="max-w-7xl mx-auto">
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-2xl font-bold text-white">
                                {activeTab === 'commander' ? 'Select Your Commander' : `Available Cards (${filteredCards.length})`}
                            </h2>
                            {activeTab === 'library' && deck.commander && (
                                <div className="flex items-center gap-4">
                                    <div className="text-sm text-slate-400 flex items-center gap-2">
                                        <Filter className="w-4 h-4" />
                                        Filtered by identity:
                                        <div className="flex gap-1">
                                            {deck.commander.color_identity.length === 0 ? 'Colorless' : deck.commander.color_identity.map(c => (
                                                <span key={c} className="font-bold">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <CardGrid
                            cards={filteredCards}
                            onAdd={activeTab === 'commander' ? setCommander : addToDeck}
                            actionLabel="add"
                        />
                    </div>
                </main>
            </div>

            {/* Floating Action Buttons */}
            {activeTab === 'library' && deck.commander && (
                <div className="fixed bottom-8 right-96 flex gap-4 z-50">
                    <button
                        onClick={handleAutoBuild}
                        disabled={isAutoBuilding}
                        className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-3 rounded-full font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl hover:shadow-violet-500/20 hover:-translate-y-1 border border-violet-400/20 backdrop-blur-sm"
                    >
                        <Sparkles className="w-5 h-5" />
                        {isAutoBuilding ? 'Building...' : 'Auto-Build'}
                    </button>
                    <button
                        onClick={handleBalanceDeck}
                        className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white px-6 py-3 rounded-full font-bold transition-all shadow-2xl hover:shadow-emerald-500/20 hover:-translate-y-1 border border-emerald-400/20 backdrop-blur-sm"
                    >
                        Balance Deck
                    </button>
                </div>
            )}

            {/* Sidebar */}
            <DeckSidebar
                deck={deck}
                onRemoveCard={removeFromDeck}
                onRemoveCommander={removeCommander}
                onRemoveMissingCard={(cardName) => {
                    setDeck(prev => ({
                        ...prev,
                        missingCards: prev.missingCards?.filter(c => c.name !== cardName)
                    }));
                }}
                onClearDeck={() => {
                    setDeck({ cards: [], colors: [], missingCards: [] });
                    setActiveTab('commander');
                    setSelectedColors([]);
                }}
            />
        </div>
    );
}
