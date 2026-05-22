import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSeverityFromScore,
  getSeverityEmoji,
  getRemorseEmoji,
  timeAgo,
} from './types.js';

describe('Shared Utility Helpers', () => {
  describe('getSeverityFromScore', () => {
    it('returns low for scores <= 33', () => {
      expect(getSeverityFromScore(0)).toBe('low');
      expect(getSeverityFromScore(15)).toBe('low');
      expect(getSeverityFromScore(33)).toBe('low');
    });

    it('returns medium for scores between 34 and 66', () => {
      expect(getSeverityFromScore(34)).toBe('medium');
      expect(getSeverityFromScore(50)).toBe('medium');
      expect(getSeverityFromScore(66)).toBe('medium');
    });

    it('returns high for scores between 67 and 90', () => {
      expect(getSeverityFromScore(67)).toBe('high');
      expect(getSeverityFromScore(80)).toBe('high');
      expect(getSeverityFromScore(90)).toBe('high');
    });

    it('returns extreme for scores > 90', () => {
      expect(getSeverityFromScore(91)).toBe('extreme');
      expect(getSeverityFromScore(99)).toBe('extreme');
      expect(getSeverityFromScore(100)).toBe('extreme');
    });
  });

  describe('getSeverityEmoji', () => {
    it('returns green for low', () => {
      expect(getSeverityEmoji('low')).toBe('🟢');
    });

    it('returns yellow for medium', () => {
      expect(getSeverityEmoji('medium')).toBe('🟡');
    });

    it('returns red for high and extreme', () => {
      expect(getSeverityEmoji('high')).toBe('🔴');
      expect(getSeverityEmoji('extreme')).toBe('🔴');
    });
  });

  describe('getRemorseEmoji', () => {
    it('returns checkmark for genuine', () => {
      expect(getRemorseEmoji('genuine')).toBe('✅');
    });

    it('returns caution warning for performative', () => {
      expect(getRemorseEmoji('performative')).toBe('⚠️');
    });

    it('returns cross mark for absent', () => {
      expect(getRemorseEmoji('absent')).toBe('❌');
    });
  });

  describe('timeAgo', () => {
    let nowSpy: any;

    beforeEach(() => {
      // Pin Date.now() to a constant timestamp for deterministic tests
      // 2026-05-22T10:00:00.000Z -> 1779444000000
      const mockNow = 1779444000000;
      nowSpy = vi.spyOn(Date, 'now').mockReturnValue(mockNow);
    });

    afterEach(() => {
      nowSpy.mockRestore();
    });

    it('returns just now for differences under 60 seconds', () => {
      const mockNow = 1779444000000;
      expect(timeAgo(mockNow - 1000)).toBe('just now');
      expect(timeAgo(mockNow - 59000)).toBe('just now');
    });

    it('returns m ago for differences under 60 minutes', () => {
      const mockNow = 1779444000000;
      expect(timeAgo(mockNow - 60000)).toBe('1m ago');
      expect(timeAgo(mockNow - 59 * 60000)).toBe('59m ago');
    });

    it('returns h ago for differences under 24 hours', () => {
      const mockNow = 1779444000000;
      expect(timeAgo(mockNow - 60 * 60 * 1000)).toBe('1h ago');
      expect(timeAgo(mockNow - 23 * 60 * 60 * 1000)).toBe('23h ago');
    });

    it('returns d ago for differences 24 hours and above', () => {
      const mockNow = 1779444000000;
      expect(timeAgo(mockNow - 24 * 60 * 60 * 1000)).toBe('1d ago');
      expect(timeAgo(mockNow - 10 * 24 * 60 * 60 * 1000)).toBe('10d ago');
    });
  });
});
