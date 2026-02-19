
import { createDeck } from './src/lib/poker/game';

console.log("--- Validating Deck Constants ---");

const deck = createDeck();
const suits = new Set<string>();
const ranks = new Set<string>();

deck.forEach(c => {
    suits.add(c.suit);
    ranks.add(c.rank);
});

console.log("Suits found:", Array.from(suits));
console.log("Ranks found:", Array.from(ranks));

let errors = 0;

function checkString(str: string, name: string) {
    if (str.trim() !== str) {
        console.error(`ERROR: "${str}" (${name}) has leading/trailing whitespace!`);
        errors++;
    }
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i);
        if (code < 32 || code > 126) {
             console.error(`ERROR: "${str}" (${name}) contains non-printable character at index ${i}: ${code}`);
             errors++;
        }
    }
}

suits.forEach(s => checkString(s, 'suit'));
ranks.forEach(r => checkString(r, 'rank'));

if (errors === 0) {
    console.log("SUCCESS: All constants are clean ASCII strings.");
} else {
    console.error(`FAILED: Found ${errors} errors.`);
}
