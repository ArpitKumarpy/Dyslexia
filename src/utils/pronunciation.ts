const VOWEL_GROUP = /[^aeiouy]*[aeiouy]+(?:[^aeiouy](?=[aeiouy]))?/gi;

export function normalizeWord(input: string): string {
  return input.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '').trim();
}

export function buildPronunciationGuide(input: string): string[] {
  const word = normalizeWord(input).toLowerCase();

  if (!word) {
    return [];
  }

  if (word.length <= 3) {
    return [word];
  }

  const matches = word.match(VOWEL_GROUP)?.filter(Boolean) ?? [];

  if (matches.length >= 2) {
    return attachTrailingConsonants(word, rebalanceTrailingSilentE(matches));
  }

  return fallbackChunks(word);
}

function rebalanceTrailingSilentE(chunks: string[]): string[] {
  if (chunks.length < 2) {
    return chunks;
  }

  const lastChunk = chunks[chunks.length - 1];
  if (lastChunk === 'e') {
    chunks[chunks.length - 2] += lastChunk;
    return chunks.slice(0, -1);
  }

  return chunks;
}

function fallbackChunks(word: string): string[] {
  const size = word.length <= 6 ? 2 : 3;
  const chunks: string[] = [];

  for (let index = 0; index < word.length; index += size) {
    chunks.push(word.slice(index, index + size));
  }

  return chunks;
}

function attachTrailingConsonants(word: string, chunks: string[]): string[] {
  const combined = chunks.join('');
  if (!combined || combined.length >= word.length) {
    return chunks;
  }

  const trailing = word.slice(combined.length);
  if (!trailing) {
    return chunks;
  }

  const nextChunks = [...chunks];
  nextChunks[nextChunks.length - 1] += trailing;
  return nextChunks;
}
