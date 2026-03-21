export type SentenceSegment = {
  index: number;
  text: string;
};

export type SentenceAnalysis = {
  clauses: string[];
  isComplex: boolean;
  wordCount: number;
};

const SENTENCE_SPLIT_REGEX = /[^.!?\n]+(?:[.!?]+["')\]]*)?|\n+/g;
const CLAUSE_SPLIT_REGEX = /(?:,|;|:|\s+(?:because|which|that|while|although|but|and|or|so)\s+)/i;

export function splitIntoSentences(input: string): SentenceSegment[] {
  const matches = input.match(SENTENCE_SPLIT_REGEX) ?? [];
  const segments = matches
    .map((text, index) => ({ index, text }))
    .filter((segment) => segment.text.length > 0);

  return segments.length > 0 ? segments : [{ index: 0, text: input }];
}

export function analyzeSentence(text: string): SentenceAnalysis {
  const clauses = splitSentenceIntoClauses(text);
  const wordCount = countWords(text);

  return {
    clauses,
    wordCount,
    isComplex: clauses.length > 1 && wordCount >= 12,
  };
}

export function splitSentenceIntoClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT_REGEX)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function countWords(text: string): number {
  return text.match(/[A-Za-z']+/g)?.length ?? 0;
}
