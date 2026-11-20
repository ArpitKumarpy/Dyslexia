export type SentenceSegment = {
  index: number;
  text: string;
  paragraphIndex: number | null;
  isNewline: boolean;
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
  let currentParagraphIndex = 0;
  let hasContentInParagraph = false;

  const segments = matches
    .filter((text) => text.length > 0)
    .map((text, index) => {
      const isNewline = /^\n+$/.test(text);
      if (isNewline) {
        if (hasContentInParagraph) {
          currentParagraphIndex += 1;
          hasContentInParagraph = false;
        }
        return {
          index,
          text,
          paragraphIndex: null,
          isNewline: true,
        };
      }

      if (text.trim().length > 0) {
        hasContentInParagraph = true;
      }

      return {
        index,
        text,
        paragraphIndex: currentParagraphIndex,
        isNewline: false,
      };
    });

  return segments.length > 0
    ? segments
    : [
        {
          index: 0,
          text: input,
          paragraphIndex: input.trim().length > 0 ? 0 : null,
          isNewline: false,
        },
      ];
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
