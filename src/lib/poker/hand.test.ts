
import { describe, it, expect } from 'vitest';
import { evaluateHand, compareHands, bestHand } from './hand';
import type { Card } from '$lib/types';

describe('Poker Hand Evaluation', () => {
    // Helper to create cards
    const createCard = (rank: string, suit: string): Card => ({ rank, suit } as Card);

    it('identifies High Card', () => {
        const cards = [
            createCard('2', 'hearts'),
            createCard('4', 'clubs'),
            createCard('6', 'diamonds'),
            createCard('8', 'spades'),
            createCard('10', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('high-card');
        expect(result.highCards[0]).toBe(10); // 10 is high
    });

    it('identifies Pair', () => {
        const cards = [
            createCard('2', 'hearts'),
            createCard('2', 'clubs'),
            createCard('6', 'diamonds'),
            createCard('8', 'spades'),
            createCard('10', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('pair');
        expect(result.highCards[0]).toBe(2);
    });

    it('identifies Two Pair', () => {
        const cards = [
            createCard('2', 'hearts'),
            createCard('2', 'clubs'),
            createCard('6', 'diamonds'),
            createCard('6', 'spades'),
            createCard('10', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('two-pair');
        expect(result.highCards).toEqual([6, 2, 10]); // Higher pair first, then lower pair, then kicker
    });

    it('identifies Three of a Kind', () => {
        const cards = [
            createCard('8', 'hearts'),
            createCard('8', 'clubs'),
            createCard('8', 'diamonds'),
            createCard('2', 'spades'),
            createCard('10', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('three-of-a-kind');
        expect(result.highCards[0]).toBe(8);
    });

    it('identifies Straight', () => {
        const cards = [
            createCard('2', 'hearts'),
            createCard('3', 'clubs'),
            createCard('4', 'diamonds'),
            createCard('5', 'spades'),
            createCard('6', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('straight');
        expect(result.highCards[0]).toBe(6);
    });
    
    it('identifies Ace-low Straight', () => {
        const cards = [
            createCard('A', 'hearts'),
            createCard('2', 'clubs'),
            createCard('3', 'diamonds'),
            createCard('4', 'spades'),
            createCard('5', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('straight');
        expect(result.highCards[0]).toBe(5); // 5 is high in A-5 straight
    });

    it('identifies Flush', () => {
         const cards = [
            createCard('2', 'hearts'),
            createCard('4', 'hearts'),
            createCard('6', 'hearts'),
            createCard('8', 'hearts'),
            createCard('10', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('flush');
    });

    it('identifies Full House', () => {
        const cards = [
            createCard('3', 'hearts'),
            createCard('3', 'clubs'),
            createCard('3', 'diamonds'),
            createCard('K', 'spades'),
            createCard('K', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('full-house');
        expect(result.highCards).toEqual([3, 13]); // 3s over Ks
    });

    it('identifies Four of a Kind', () => {
        const cards = [
            createCard('9', 'hearts'),
            createCard('9', 'clubs'),
            createCard('9', 'diamonds'),
            createCard('9', 'spades'),
            createCard('K', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('four-of-a-kind');
        expect(result.highCards[0]).toBe(9);
    });

    it('identifies Straight Flush', () => {
        const cards = [
            createCard('7', 'hearts'),
            createCard('8', 'hearts'),
            createCard('9', 'hearts'),
            createCard('10', 'hearts'),
            createCard('J', 'hearts')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('straight-flush');
        expect(result.highCards[0]).toBe(11); // J is 11
    });

    it('identifies Royal Flush', () => {
        const cards = [
            createCard('10', 'spades'),
            createCard('J', 'spades'),
            createCard('Q', 'spades'),
            createCard('K', 'spades'),
            createCard('A', 'spades')
        ];
        const result = evaluateHand(cards);
        expect(result.rank).toBe('royal-flush');
    });
});
