# Today's Work Summary

This document captures the feature work completed in this project today, with a detailed explanation of the major tools, utilities, components, and functions involved.

## Overview

We implemented four user-facing reading support features:

1. Hover word support
2. Difficult-word highlighting
3. Read-aloud follow mode
4. Sentence simplification mode

These features were built to support dyslexic readers by reducing decoding effort, improving visual tracking, and lowering sentence-level reading overload.

## Files Touched

### Main app flow

- `src/App.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/TextEditor/TextEditor.tsx`
- `src/index.css`

### New or expanded utilities

- `src/utils/pronunciation.ts`
- `src/utils/wordDifficulty.ts`
- `src/utils/sentences.ts`

## 1. Hover Word Support

### Goal

Allow the user to hover over a word and see a popup with:

- a pronunciation button
- pronunciation speed control
- chunked word breakdown
- phonetic hint
- morphology hints
- difficulty explanation when relevant

### Main files involved

- `src/components/TextEditor/TextEditor.tsx`
- `src/utils/pronunciation.ts`
- `src/utils/wordDifficulty.ts`

### How it works

#### `TextEditor` hover handling

The editor detects which word is under the mouse using DOM caret APIs instead of relying only on static span wrapping. This makes hover support work more reliably inside the `contentEditable` editor.

Important internal functions in `TextEditor.tsx`:

- `handleEditorMouseMove`
  - Finds the hovered word under the cursor.
  - Computes popup position.
  - Builds the hover card state.

- `pronounceHoveredWord`
  - Uses `SpeechSynthesisUtterance`.
  - Speaks only the hovered word.
  - Uses the user-controlled hover pronunciation speed.

- `getWordAtPoint`
  - Uses the caret position/range under the mouse cursor.
  - Expands left and right to find the full word boundary.

- `getRangeAtPoint`
  - Uses browser caret APIs:
    - `caretRangeFromPoint`
    - `caretPositionFromPoint`

- `findWordIndex`
  - Chooses the correct character index when the cursor lands next to a word edge.

- `isWordCharacter`
  - Defines which characters count as part of a word.

### Hover popup data

The popup is driven by the `hoverCard` state in `TextEditor.tsx`.

It stores:

- `word`
- `breakdown`
- `phoneticHint`
- `morphology`
- `top`
- `left`

### Pronunciation utility

The file `src/utils/pronunciation.ts` now provides a reusable word analysis layer.

Important exports:

- `normalizeWord(input)`
  - Removes leading and trailing punctuation.

- `buildPronunciationGuide(input)`
  - Returns chunked syllable-like parts.
  - This is a convenience wrapper around the deeper analysis.

- `analyzeWordSupport(input)`
  - Returns a richer structure containing:
    - normalized word
    - chunks
    - phonetic hint
    - morphology

Important internal helpers:

- `buildChunks`
  - Generates syllable-like chunking.

- `buildPhoneticHint`
  - Produces a simplified "sounds like" style hint.

- `phoneticizeChunk`
  - Applies lightweight spelling-to-sound approximations such as:
    - `tion -> shun`
    - `ph -> f`
    - soft/hard `c`
    - soft `g`

- `analyzeMorphology`
  - Detects basic prefixes and suffixes.
  - Extracts an approximate root.

- `rebalanceTrailingSilentE`
  - Prevents chunking errors around terminal `e`.

- `attachTrailingConsonants`
  - Prevents the last consonants from being dropped from the final chunk.

### Why this matters

This feature reduces decoding friction by letting the user inspect a word in place without leaving the reading flow.

## 2. Difficult-Word Highlighting

### Goal

Allow the user to toggle difficult-word highlighting from the sidebar so visually challenging words stand out.

### Main files involved

- `src/App.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/TextEditor/TextEditor.tsx`
- `src/utils/wordDifficulty.ts`
- `src/index.css`

### App state

In `App.tsx`, we added:

- `showDifficultWords`

This state controls whether the editor should visually mark difficult words.

### Sidebar integration

In `ControlPanel.tsx`, we added:

- `showDifficultWords`
- `onToggleDifficultWords`

This renders the `Difficult Words` button in the Reading Assistance section.

### Difficulty analysis utility

The file `src/utils/wordDifficulty.ts` provides heuristic difficulty scoring.

Important exports:

- `DifficultyLevel`
  - `none`
  - `moderate`
  - `high`

- `WordDifficulty`
  - stores word-level scoring output

- `analyzeWordDifficulty(input)`
  - scores a word and returns:
    - normalized word
    - score
    - difficulty level
    - reasons

Important heuristics used:

- long word length
- multiple reading chunks
- dense consonant sequences
- irregular letter clusters
- visible prefixes or suffixes

Important internal helper:

- `hasRepeatedConsonants`
  - detects dense consonant runs that may raise decoding difficulty

### Editor rendering

In `TextEditor.tsx`, difficult words are marked during HTML generation.

Important function:

- `buildTokenMarkup`
  - wraps word tokens in spans
  - conditionally adds difficulty classes when highlighting is enabled

### Styling

In `src/index.css`, we added:

- `.difficult-word`
- `.difficult-word--moderate`
- `.difficult-word--high`

These provide visible but readable emphasis instead of overwhelming the text.

### Why this matters

This feature gives readers a quick visual warning about words that may require extra decoding effort.

## 3. Read-Aloud Follow Mode

### Goal

When text-to-speech is active, highlight the currently spoken sentence and keep it visible while speech progresses.

### Main files involved

- `src/App.tsx`
- `src/components/TextEditor/TextEditor.tsx`
- `src/utils/sentences.ts`
- `src/index.css`

### App state and playback flow

In `App.tsx`, we added:

- `activeSentenceIndex`

This tracks which sentence is currently being spoken.

### Main playback logic

Important functions in `App.tsx`:

- `handleTextToSpeech`
  - starts or stops speech
  - splits text into sentences
  - begins sentence-by-sentence playback

- `speakSentenceSequence(sentences, index)`
  - speaks one sentence at a time
  - updates `activeSentenceIndex`
  - advances to the next sentence when speech ends
  - clears speaking state when playback completes

### Why sentence-by-sentence playback was necessary

The older approach read the full document as one utterance, which made it hard to track where the reader was. Sentence-by-sentence playback gives the UI a stable sentence index to highlight.

### Sentence utility

The file `src/utils/sentences.ts` now provides reusable sentence segmentation.

Important exports:

- `SentenceSegment`
  - `{ index, text }`

- `splitIntoSentences(input)`
  - breaks content into sentence-like segments

### Editor behavior

In `TextEditor.tsx`:

- the editor wraps each sentence in a sentence span
- the sentence matching `activeSentenceIndex` gets special styling
- the active sentence is scrolled into view

Important function:

- `buildSentenceMarkup`
  - renders sentence-level wrappers
  - applies sentence-state classes

### Styling

In `src/index.css`, we added:

- `.sentence-segment`
- `.sentence-active`

These visually indicate the sentence currently being read aloud.

### Why this matters

This feature helps readers maintain their place while listening and reading at the same time.

## 4. Sentence Simplification Mode

### Goal

Provide a safer version of simplification by breaking long, multi-clause sentences into focusable clause units instead of rewriting the sentence.

### Important note

This is intentionally not aggressive paraphrasing. Rewriting sentence meaning would require a more careful language-processing pipeline. The current version lowers reading load while preserving the original wording.

### Main files involved

- `src/App.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/TextEditor/TextEditor.tsx`
- `src/utils/sentences.ts`
- `src/index.css`

### App state

In `App.tsx`, we added:

- `showSentenceSimplification`

This controls whether simplification mode is enabled.

### Sidebar integration

In `ControlPanel.tsx`, we added:

- `showSentenceSimplification`
- `onToggleSentenceSimplification`

This renders the `Sentence Simplification` button.

### Sentence analysis

In `src/utils/sentences.ts`, we added:

- `SentenceAnalysis`
  - stores clause list
  - stores word count
  - stores whether the sentence is complex enough to simplify

- `analyzeSentence(text)`
  - returns clause structure and complexity signal

- `splitSentenceIntoClauses(text)`
  - splits a sentence into clause-sized segments
  - uses punctuation and connector cues

Important internal helper:

- `countWords`
  - counts lexical tokens in a sentence

### Editor clause focus

In `TextEditor.tsx`, we added:

- `clauseFocusBySentence`
  - local state that tracks which clause is currently emphasized for each complex sentence

Important function:

- `handleEditorClick`
  - when simplification mode is on
  - clicking a complex sentence cycles the active clause

### Sentence rendering behavior

When simplification mode is enabled:

- long, multi-clause sentences are wrapped in special sentence markup
- their clauses are rendered separately
- one clause is highlighted
- the others are muted
- a small inline hint tells the user they can click to step through clauses

This is implemented inside:

- `buildSentenceMarkup`

### Styling

In `src/index.css`, we added:

- `.sentence-segment--simplified`
- `.sentence-clause`
- `.sentence-clause--active`
- `.sentence-clause--muted`
- `.sentence-clause-break`
- `.sentence-simplification-hint`

### Why this matters

Long sentences are a major overload point for dyslexic readers. Clause focus makes the sentence easier to process one unit at a time.

## Shared Editor Rendering Strategy

The editor uses a `contentEditable` surface rather than a plain textarea. That means most of the feature work today depends on HTML rendering and DOM-aware interaction.

Important shared functions in `TextEditor.tsx`:

- `handleInput`
  - syncs typed DOM content back into React state

- `escapeHtml`
  - prevents unsafe raw HTML injection when rebuilding the editor markup

- `buildTokenMarkup`
  - central place where word-level visual classes are added

- `buildSentenceMarkup`
  - central place where sentence-level wrappers and simplification logic are applied

This structure is important because:

- word-level features now plug into token rendering
- sentence-level features now plug into sentence rendering
- hover, difficulty, TTS follow, and clause focus all share the same visual pipeline

## Feature Progression Across the Day

The work naturally built in layers:

1. Hover word support created the popup and word-analysis path.
2. Difficult-word highlighting introduced reusable word scoring.
3. Read-aloud follow mode introduced sentence segmentation and active sentence tracking.
4. Sentence simplification mode reused that sentence pipeline to add clause focus.

This progression matters because the later features now sit on a stronger foundation instead of each one reinventing rendering logic.

## Current Limitations

### Hover word analysis

- chunking is heuristic, not dictionary-accurate
- phonetic hints are simplified, not IPA
- morphology detection is approximate

### Difficult-word highlighting

- scoring is heuristic, not model-backed
- it does not yet use the trained ZuCo artifact

### Read-aloud follow mode

- it reads sentence by sentence
- it does not yet support pause/resume state beyond stop/start behavior

### Sentence simplification

- it focuses clauses
- it does not rewrite or paraphrase text

## Recommended Next Improvements

If work continues from here, the strongest next steps are:

1. Replace heuristic difficult-word scoring with a real lexical model or service.
2. Improve hover analysis with better syllable and phonetic logic.
3. Add pause/resume and sentence navigation controls to read-aloud follow mode.
4. Make simplification and read-aloud modes cooperate more tightly.
5. Add keyboard shortcuts for accessibility.

## Summary

Today's work significantly expanded the app from a customizable text editor into a much richer dyslexia-support reading tool.

The most important architectural outcome is this:

- word-level assistance now has a reusable analysis layer
- sentence-level assistance now has a reusable segmentation layer
- the editor rendering path can now support both reading and comprehension features in a structured way
