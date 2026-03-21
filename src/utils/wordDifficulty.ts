import { buildPronunciationGuide, normalizeWord } from './pronunciation';

export type DifficultyLevel = 'none' | 'moderate' | 'high';

export type WordDifficulty = {
  word: string;
  normalizedWord: string;
  score: number;
  isDifficult: boolean;
  level: DifficultyLevel;
  reasons: string[];
};

const COMPLEX_CLUSTERS = ['tion', 'sion', 'ough', 'eigh', 'phth', 'ture', 'cia', 'gue'];
const MORPHOLOGY_MARKERS = ['pre', 're', 'un', 'dis', 'mis', 'sub', 'inter', 'trans', 'ment', 'ness', 'able', 'ible'];

export function analyzeWordDifficulty(input: string): WordDifficulty {
  const normalizedWord = normalizeWord(input).toLowerCase();
  const reasons: string[] = [];

  if (!normalizedWord) {
    return {
      word: input,
      normalizedWord,
      score: 0,
      isDifficult: false,
      level: 'none',
      reasons,
    };
  }

  let score = 0;
  const chunks = buildPronunciationGuide(normalizedWord);

  if (normalizedWord.length >= 8) {
    score += 2;
    reasons.push('long word');
  } else if (normalizedWord.length >= 6) {
    score += 1;
    reasons.push('medium-long word');
  }

  if (chunks.length >= 3) {
    score += 2;
    reasons.push('many reading chunks');
  } else if (chunks.length === 2) {
    score += 1;
  }

  if (hasRepeatedConsonants(normalizedWord)) {
    score += 1;
    reasons.push('dense consonant pattern');
  }

  if (COMPLEX_CLUSTERS.some((cluster) => normalizedWord.includes(cluster))) {
    score += 2;
    reasons.push('irregular letter pattern');
  }

  if (MORPHOLOGY_MARKERS.some((marker) => normalizedWord.startsWith(marker) || normalizedWord.endsWith(marker))) {
    score += 1;
    reasons.push('prefix or suffix');
  }

  const level: DifficultyLevel = score >= 5 ? 'high' : score >= 3 ? 'moderate' : 'none';

  return {
    word: input,
    normalizedWord,
    score,
    isDifficult: level !== 'none',
    level,
    reasons,
  };
}

function hasRepeatedConsonants(word: string): boolean {
  return /[^aeiou]{3,}/i.test(word);
}
