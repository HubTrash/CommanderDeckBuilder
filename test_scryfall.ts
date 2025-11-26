
import { fetchCardCollection } from './lib/scryfall';

async function test() {
    const identifiers = [
        { set: 'clb', collector_number: '511' }, // Tavern Brawler
        { set: 'dmc', collector_number: '55' }   // Jasmine Boreal
    ];
    console.log('Testing fetchCardCollection with identifiers:', JSON.stringify(identifiers));
    try {
        const cards = await fetchCardCollection(identifiers);
        console.log('Fetched count:', cards.length);
        if (cards.length > 0) {
            console.log('First card:', cards[0].name);
            console.log('Set:', cards[0].set);
            console.log('CN:', cards[0].collector_number);
        } else {
            console.log('No cards fetched.');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

test();
