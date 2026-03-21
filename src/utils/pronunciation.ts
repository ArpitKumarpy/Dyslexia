export type MorphologyHint = {
  prefix?: string;
  root: string;
  suffix?: string;
};

export type WordSupport = {
  normalizedWord: string;
  chunks: string[];
  phoneticHint: string;
  morphology: MorphologyHint;
};

const VOWEL_GROUP = /[^aeiouy]*[aeiouy]+(?:[^aeiouy](?=[aeiouy]))?/gi;
const PREFIXES = ['trans', 'inter', 'under', 'over', 'mis', 'dis', 'sub', 'pre', 're', 'un'];
const SUFFIXES = ['ation', 'ition', 'ment', 'ness', 'able', 'ible', 'tion', 'sion', 'ing', 'ed', 'ly', 'er', 'est'];

export function normalizeWord(input: string): string {
  return input.replace(/^[^a-zA-Z']+|[^a-zA-Z']+$/g, '').trim();
}

export function buildPronunciationGuide(input: string): string[] {
  return analyzeWordSupport(input).chunks;
}

export function analyzeWordSupport(input: string): WordSupport {
  const normalizedWord = normalizeWord(input).toLowerCase();
  const chunks = buildChunks(normalizedWord);
  const morphology = analyzeMorphology(normalizedWord);

  return {
    normalizedWord,
    chunks,
    phoneticHint: buildPhoneticHint(chunks),
    morphology,
  };
}

function buildChunks(word: string): string[] {
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

function buildPhoneticHint(chunks: string[]): string {
  if (chunks.length === 0) {
    return '';
  }

  return chunks
    .map((chunk) => phoneticizeChunk(chunk))
    .join(' + ');
}

function phoneticizeChunk(chunk: string): string {
  return chunk
    .replace(/tion/g, 'shun')
    .replace(/sion/g, 'zhun')
    .replace(/ough/g, 'uff')
    .replace(/ph/g, 'f')
    .replace(/tion$/g, 'shun')
    .replace(/qu/g, 'kw')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/g(?=[eiy])/g, 'j')
    .replace(/x/g, 'ks');
}

function analyzeMorphology(word: string): MorphologyHint {
  if (!word) {
    return { root: '' };
  }

  const prefix = PREFIXES.find((candidate) => word.startsWith(candidate) && word.length - candidate.length >= 3);
  const suffix = SUFFIXES.find((candidate) => word.endsWith(candidate) && word.length - candidate.length >= 3);

  const start = prefix ? prefix.length : 0;
  const end = suffix ? word.length - suffix.length : word.length;
  const root = word.slice(start, end) || word;

  return {
    prefix,
    root,
    suffix,
  };
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
