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

            // Match suggested cards with collection
            cardNames.forEach((cardName: string) => {
                const cardInCollection = collection.find(
                    c => c.name.toLowerCase() === cardName.toLowerCase()
                );

                if (cardInCollection) {
                    // Check if already in deck
                    const alreadyInDeck = deck.cards.some(dc => dc.scryfallId === cardInCollection.scryfallId);
                    if (!alreadyInDeck) {
                        addedCards.push(cardInCollection);
                    }
                } else {
                    // Find details in suggestedDetails
                    const details = suggestedDetails.find((d: ScryfallCard) => d.name === cardName);
                    if (details) {
                        missing.push(details);
                    } else {
                        // Fallback for cards without details (shouldn't happen often)
                        // We create a minimal ScryfallCard object or skip
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

        // Separate lands from non-lands
        const lands = deck.cards.filter(c => c.details?.type_line?.includes('Land'));
        const nonLands = deck.cards.filter(c => !c.details?.type_line?.includes('Land'));

        // Keep only TARGET_LANDS lands (prioritize non-basic lands)
        const basicLands = lands.filter(c => c.details?.type_line?.includes('Basic Land'));
        const nonBasicLands = lands.filter(c => !c.details?.type_line?.includes('Basic Land'));

        let keptLands: CollectionCard[] = [];
        if (nonBasicLands.length >= TARGET_LANDS) {
            keptLands = nonBasicLands.slice(0, TARGET_LANDS);
        } else {
            keptLands = [...nonBasicLands, ...basicLands.slice(0, TARGET_LANDS - nonBasicLands.length)];
        }

        // Calculate how many more cards we need
        const currentTotal = keptLands.length + nonLands.length;
        const cardsNeeded = TARGET_TOTAL - currentTotal;

        if (cardsNeeded <= 0) {
            // We have enough or too many cards, just update with balanced lands
            setDeck(prev => ({
                ...prev,
                cards: [...keptLands, ...nonLands.slice(0, TARGET_TOTAL - keptLands.length)],
                missingCards: [] // Clear missing cards since deck is now complete
            }));
            return;
        }

        // Get available cards from collection that match commander's color identity
        const commanderIdentity = deck.commander.color_identity || [];
        const availableCards = collection.filter(c => {
            // Skip if already in deck
            if (deck.cards.some(dc => dc.name === c.name)) return false;
            // Skip if it's the commander
            if (c.name === deck.commander?.name) return false;
            // Check color identity
            const identity = c.details?.color_identity || [];
            return identity.every(color => commanderIdentity.includes(color));
        });

        // Prioritize non-land cards
        const availableNonLands = availableCards.filter(c => !c.details?.type_line?.includes('Land'));
        const availableLands = availableCards.filter(c => c.details?.type_line?.includes('Land'));

        // Sort by rarity: Mythic > Rare > Uncommon > Common
        const rarityScore = (rarity?: string) => {
            switch (rarity) {
                case 'mythic': return 4;
                case 'rare': return 3;
                case 'uncommon': return 2;
                default: return 1;
            }
        };

        availableNonLands.sort((a, b) => {
            return rarityScore(b.details?.rarity) - rarityScore(a.details?.rarity);
        });

        // Add cards to fill the deck
        const cardsToAdd: CollectionCard[] = [];

        // First, add non-lands
        for (let i = 0; i < Math.min(cardsNeeded, availableNonLands.length); i++) {
            cardsToAdd.push(availableNonLands[i]);
        }

        // If we still need more, add lands
        const stillNeeded = cardsNeeded - cardsToAdd.length;
        if (stillNeeded > 0) {
            for (let i = 0; i < Math.min(stillNeeded, availableLands.length); i++) {
                cardsToAdd.push(availableLands[i]);
            }
        }

        // Update deck
        setDeck(prev => ({
            ...prev,
            cards: [...keptLands, ...nonLands, ...cardsToAdd],
            missingCards: [] // Clear missing cards since deck is now complete with available cards
        }));

        alert(`Deck balanced! Lands: ${keptLands.length}, Non-lands: ${nonLands.length + cardsToAdd.length}, Total: ${keptLands.length + nonLands.length + cardsToAdd.length + 1} (including commander)`);
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
