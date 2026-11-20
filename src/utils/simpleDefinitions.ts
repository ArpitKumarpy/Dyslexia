import { normalizeWord } from './pronunciation';

type SimpleDefinition = {
  meaning: string;
  example?: string;
};

const SIMPLE_DEFINITIONS: Record<string, SimpleDefinition> = {
  access: { meaning: 'a way to reach or use something', example: 'You have access when you are allowed to open or use it.' },
  analyze: { meaning: 'to look at something carefully to understand it better' },
  attention: { meaning: 'careful focus on one thing' },
  clause: { meaning: 'a smaller part of a sentence' },
  complex: { meaning: 'made of many parts and harder to understand' },
  confidence: { meaning: 'a feeling that something will work or is correct' },
  consistent: { meaning: 'the same in a steady way over time' },
  context: { meaning: 'the words or situation around something that help explain it' },
  definition: { meaning: 'a short explanation of what a word means' },
  detect: { meaning: 'to notice that something is there' },
  difficult: { meaning: 'hard to do or understand' },
  focus: { meaning: 'to pay close attention to one thing' },
  guidance: { meaning: 'help that shows you what to do next' },
  infer: { meaning: 'to work something out from clues' },
  meaning: { meaning: 'what a word or sentence is trying to say' },
  morphology: { meaning: 'how a word is built from smaller parts' },
  paragraph: { meaning: 'a group of sentences about one main idea' },
  phrase: { meaning: 'a small group of words that go together' },
  plain: { meaning: 'simple and easy to understand' },
  pronunciation: { meaning: 'the way a word is said out loud' },
  reader: { meaning: 'a person who is reading' },
  sentence: { meaning: 'a complete thought written with words' },
  simplify: { meaning: 'to make something easier to understand' },
  support: { meaning: 'help that makes something easier' },
  surface: { meaning: 'the visible outer part of something' },
  syllable: { meaning: 'one beat or chunk in a word' },
  track: { meaning: 'to follow something as it moves or changes' },
  visible: { meaning: 'able to be seen' },
  word: { meaning: 'a single unit of language with meaning' },
};

export function getSimpleDefinition(word: string): SimpleDefinition | null {
  const normalized = normalizeWord(word);
  if (!normalized) {
    return null;
  }

  if (SIMPLE_DEFINITIONS[normalized]) {
    return SIMPLE_DEFINITIONS[normalized];
  }

  if (normalized.endsWith('tion') || normalized.endsWith('sion')) {
    return {
      meaning: 'This word is likely naming an action, process, or result.',
    };
  }

  if (normalized.endsWith('ment')) {
    return {
      meaning: 'This word is likely naming a state, result, or thing that comes from an action.',
    };
  }

  if (normalized.startsWith('un')) {
    return {
      meaning: 'The beginning "un-" often means "not" or "the opposite of".',
    };
  }

  if (normalized.startsWith('re')) {
    return {
      meaning: 'The beginning "re-" often means "again" or "back".',
    };
  }

  if (normalized.startsWith('pre')) {
    return {
      meaning: 'The beginning "pre-" often means "before".',
    };
  }

  return null;
}
