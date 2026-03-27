# Developer Log: 2026-03-27

This document is a detailed engineering log of the work completed during this development cycle. It is written for future development, research review, onboarding, and product handoff. The goal is to explain not only what changed, but why those changes were made, how the implementation works, which tradeoffs were chosen, and what limitations still remain.

## 1. High-Level Outcome

By the end of today, the project evolved from a customizable dyslexia-support reading interface into a more production-ready reading workspace with:

- a calmer reading-mode experience
- clearer visual hierarchy for dyslexic readers
- a richer word-help panel
- document persistence with corrected save/load behavior
- a curated Support Hub for trusted dyslexia resources
- significantly improved mobile responsiveness
- browser-based webcam-assisted line tracking
- hybrid head + iris guidance
- a lightweight calibration step that learns the user’s natural reading posture
- a successful production deployment path using Vercel

The work was both product-facing and architectural. Several major features were added, but just as importantly, the app’s structure became more coherent:

- the control panel became more intentional and readable
- the reading surface became more central and less cluttered
- support resources became data-driven
- tracking logic moved from unstable experimental ideas toward a more usable hybrid approach
- mobile behavior was redesigned instead of merely “shrunk”

## 2. Product Direction for the Day

The original request trajectory started from webcam-based gaze interaction. The target behavior was to highlight the word a user was looking at, follow that attention live, and trigger the existing hover support after dwell.

After implementation attempts and testing, it became clear that direct browser-based eye tracking was not stable enough for the actual reading context. The key issues were:

- browser support inconsistency
- fragile startup behavior
- heavy dependency cost
- privacy sensitivity
- poor stability for exact word targeting
- natural reading posture not producing enough variation for reliable movement

Because of that, the feature direction was deliberately reframed:

- from exact word gaze tracking
- toward soft reading guidance based on head position first
- then later augmented with a smaller iris component

This was a product decision as much as a technical one. The goal changed from “simulate a cursor with the eyes” to “infer reading attention in a stable, accessible way.”

That shift shaped almost every major implementation choice that followed.

## 3. Main Files Affected

The following files now carry most of the work from today.

### Application shell and state

- `src/App.tsx`
- `src/lib/supabase.ts`

### Reading UI and editor behavior

- `src/components/TextEditor/TextEditor.tsx`
- `src/components/ControlPanel.tsx`
- `src/components/DocumentModal.tsx`
- `src/components/SupportHub.tsx`
- `src/index.css`

### Supporting data and utility layers

- `src/data/supportResources.ts`
- `src/utils/simpleDefinitions.ts`
- existing utilities such as:
  - `src/utils/sentences.ts`
  - `src/utils/pronunciation.ts`
  - `src/utils/tokenizeText.ts`
  - `src/utils/wordDifficulty.ts`
  - `src/utils/pdfParser.ts`

### Persistence and schema context

- `supabase/migrations/20251204065349_create_dyslexia_reader_schema.sql`

### Build and deployment context

- `.env`
- `package.json`

## 4. Reading Workspace and UX Refactor

One of the biggest themes of the day was moving the app away from feeling like a technical control panel and toward feeling like a guided reading environment for dyslexic users.

### 4.1 App-level reading mode

`src/App.tsx` already managed the main feature state, but the user experience needed a more focused mode. A dedicated `readingMode` state is now part of the top-level app shell.

When `readingMode` is enabled:

- the full left tools panel is hidden
- the editor takes the primary visual role
- a slimmer top action bar appears
- the top bar exposes only high-value reading actions:
  - `Support Hub`
  - `Read Aloud`
  - `Exit Reading Mode`

This reduces decision fatigue and visual clutter for users who are already reading, rather than configuring.

### 4.2 Sidebar reorganization

`src/components/ControlPanel.tsx` was reworked into clearer sections with stronger information architecture:

- `Reading`
- `Color`
- `Support`
- `Trusted outside help`
- `Documents`

The labels were intentionally rewritten into plain-language phrasing, such as:

- `Reading Ruler`
- `Dim Other Lines`
- `Add Word Spacing`
- `Highlight Tricky Words`
- `Break Long Sentences`
- `Head Tracking`

This matters for a dyslexic audience because abstract UI language increases friction. The revised panel tries to describe effects, not implementation details.

### 4.3 Opaque surfaces and calmer visual tone

Some interface regions previously used semi-transparent styling. The user preferred these surfaces to be opaque, and this also aligns well with accessibility goals. Floating surfaces now use more solid visual grounding so content remains easier to scan:

- reading-mode top bar
- hover help panel
- head-tracking status panel
- sidebar icon bubbles and card areas

The effect is a more stable, less glassy interface.

## 5. Word Help Panel Improvements

The word-help flow was already present in earlier work, but today it was made more usable and more product-ready.

### 5.1 Hover preview plus click-to-pin

The main issue reported was that the panel appeared beneath a hovered word, but disappeared or jumped when the user moved the mouse toward the panel. This happened because the hover system was following whichever word the cursor crossed next.

The solution added two states:

- hover preview
- pinned inspection

The behavior now works like this:

1. hover a word to preview support
2. click a word to pin the panel
3. interact with the panel without the target changing
4. click outside the panel and outside word targets to close it

This logic lives in `src/components/TextEditor/TextEditor.tsx`, primarily through:

- `hoverCard`
- `isHoverCardPinned`
- `handleEditorMouseMove`
- `handleEditorClick`
- the document-level pointer handler that dismisses the panel when clicking elsewhere

### 5.2 Positioning logic

The help panel is positioned relative to the selected word target. A `WordTarget` stores:

- the word element
- normalized word text
- bounding rectangle

The panel position is then computed relative to the editor container, not the page as a whole. Later in the day, this was improved for smaller screens by:

- constraining width to the available container width
- keeping side padding
- flipping upward when there is not enough vertical room below

### 5.3 Word-help content

The panel includes:

- word title
- speech button
- chunked pronunciation support
- simple pronunciation hint
- easy meaning
- morphology summary
- adjustable pronunciation speed
- optional difficulty explanation

The speech button uses the browser `SpeechSynthesisUtterance` API and reads only the selected word. The adjustable speech rate is persisted through `hoverPronunciationRate`.

### 5.4 Easy Meaning layer

`src/utils/simpleDefinitions.ts` was added as a lightweight local definition source.

Its purpose is not to function as a full dictionary. Instead, it supports fast, low-friction contextual help in plain language. It currently uses:

- a local lookup table for common support-related vocabulary
- simple morphological fallback rules for patterns like:
  - `-tion`
  - `-sion`
  - `-ment`
  - prefixes such as `un-`, `re-`, and `pre-`

This was intentionally kept local and lightweight to preserve speed and avoid adding a remote dependency just to prototype the UX.

## 6. Sentence-Level Reading Support

The app already had sentence-level infrastructure from earlier work, but today it was carried forward into the more polished reading workspace.

### 6.1 Read-aloud follow mode

`src/App.tsx` manages:

- `isSpeaking`
- `activeSentenceIndex`

Read-aloud works by:

1. splitting the content into sentence segments with `splitIntoSentences`
2. speaking one sentence at a time
3. updating `activeSentenceIndex`
4. letting the editor highlight and scroll the active sentence

This sentence-by-sentence approach is more controllable than reading the entire document as a single utterance.

### 6.2 Sentence chunking and clause focus

Sentence simplification remains intentionally conservative. The system does not rewrite meaning. Instead, it uses `analyzeSentence` to identify clause structure, then visually separates clause-like chunks and allows step-through focus.

The implementation is still in `TextEditor.tsx`, where:

- complex sentences can be marked as simplified
- a single clause is emphasized
- the sentence can be clicked to cycle focus across clauses

This makes longer sentences more approachable without changing the source content.

## 7. Document Persistence and Save/Load Bug Fix

One important production bug surfaced during the day: saving a document appeared to succeed, but the saved item did not appear in the load dialog.

### 7.1 Root cause

The earlier logic was writing a local guest session string into `documents.user_id`, while the Supabase schema expected a true `uuid`. That mismatch could cause the insert to fail even though the UI implied success.

### 7.2 Fix applied

`src/App.tsx` was corrected so guest document inserts no longer send the incompatible `user_id` value. At the same time, error handling was hardened for all document operations:

- save
- load
- delete

The revised flow now:

- only shows a success alert when Supabase actually succeeds
- shows real backend error messages on failure
- updates local document state only after confirmed inserts

### 7.3 Shared Supabase client usage

`src/lib/supabase.ts` reads:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

and creates the shared browser client used throughout the app.

That client powers:

- user preference persistence
- document save/load/delete

The app is therefore dependent on these environment variables both locally and in production deployment.

## 8. Support Hub

The user wanted a support section that gave people access to trusted dyslexia resources, especially:

- YouTube and video material
- helplines
- trusted guides
- location-specific support
- Indian resources in addition to international ones

### 8.1 Design approach

Instead of building a generic internet link page, a curated Support Hub was created. The rationale was:

- trust matters more than volume
- random “latest” results are risky for support contexts
- the developer should be able to update resources in code when links change

### 8.2 Architecture

The Support Hub is split into two parts:

- UI: `src/components/SupportHub.tsx`
- data source: `src/data/supportResources.ts`

This separation is important. The UI never hardcodes resource content. All trusted sources live in a single typed dataset so they can be reviewed and updated later.

### 8.3 Resource model

Each resource entry in `supportResources.ts` includes:

- id
- title
- source
- url
- section
- audiences
- region
- format
- summary
- trustedWhy
- lastChecked

The four main sections are:

- `trusted-guides`
- `videos`
- `helplines`
- `find-local-help`

### 8.4 Filters

The Support Hub UI supports filtering by:

- all
- India
- Global
- Adults
- Parents
- Teachers
- Students
- Videos
- Helplines

It also supports free-text search across title, source, and summary.

### 8.5 Included resources

The curated list includes international and Indian resources such as:

- International Dyslexia Association
- Yale Center for Dyslexia & Creativity
- Understood
- Child Mind Institute
- NHS
- Dyslexia Association of India
- Madras Dyslexia Association
- ChangeInkk
- Saadya
- Tele-MANAS
- NIMHANS
- 988
- 211

This gave the product a trust-oriented support layer, which is a meaningful step toward broader real-world usefulness.

## 9. Mobile Responsiveness Pass

After deployment, the next major concern was mobile usability.

### 9.1 Why the old layout was weak on mobile

The original desktop-first layout used:

- a fixed-width left control panel
- an editor area sized for large screens
- floating cards positioned with desktop assumptions

That would not compress well onto narrow devices.

### 9.2 Mobile shell strategy

Rather than trying to squeeze desktop UI into a phone width, the app shell was adjusted in `src/App.tsx`:

- desktop keeps the full sidebar
- mobile gets a compact top bar
- mobile tools open in a slide-over drawer

This is a structural change, not just a style tweak.

### 9.3 Control panel support for mobile

`src/components/ControlPanel.tsx` now accepts:

- `className`
- `onCloseMobile`

This allows the same panel component to be reused both as:

- a static desktop sidebar
- a mobile slide-over panel with its own close button

### 9.4 Reading surface and floating panels

`src/components/TextEditor/TextEditor.tsx` was updated to improve mobile behavior:

- responsive editor padding
- responsive min-height behavior
- head-tracking status panel that can span the safe width on small screens
- hover help panel width clamped to available space
- smarter top/bottom placement when the panel would overflow

### 9.5 Modal updates

`src/components/DocumentModal.tsx` and `src/components/SupportHub.tsx` were also improved to behave better on smaller screens:

- reduced outer padding
- more mobile-friendly radii
- better stacking
- more tolerant content widths
- flexible card layouts

This work does not make the app “fully mobile-optimized” yet, but it removes several serious layout blockers and gives the app a usable responsive baseline.

## 10. Evolution of Camera-Based Tracking

This was the most iterative technical area of the day.

### 10.1 Initial direction: direct gaze tracking

The first idea was to track gaze and use it to infer the word being viewed. A browser-side eye-tracking library was initially explored, but several issues emerged:

- difficult browser compatibility
- startup brittleness
- inaccurate or inconsistent behavior
- a heavy dependency stack
- poor product feel for real reading

The idea was not wrong, but it was too fragile for the desired experience.

### 10.2 Pivot to head-guided line tracking

The next design decision was to stop trying to track exact word-level gaze and instead infer a likely reading line from the user’s head pose or attention area.

This pivot was valuable because it changed the target from “precision cursor control” to “attention-aware reading guidance.” For reading support, that is much more realistic.

### 10.3 Browser API dead end

A first implementation tried to use `window.FaceDetector`, but that API was not reliably available even in Chrome environments where the user expected it to work. The app failed before camera prompt in such cases because the capability check rejected the environment too early.

This path was abandoned in favor of a more reliable cross-browser approach.

### 10.4 MediaPipe-based tracking

The tracking stack was rebuilt around `@mediapipe/tasks-vision`, loaded dynamically in `TextEditor.tsx`.

The startup sequence now roughly does:

1. request webcam with `getUserMedia`
2. mount the stream into a hidden `<video>`
3. dynamically import `@mediapipe/tasks-vision`
4. resolve the wasm assets using `FilesetResolver.forVisionTasks`
5. create a `FaceLandmarker`
6. start a requestAnimationFrame loop that samples the webcam periodically

MediaPipe assets are currently loaded from:

- jsDelivr for wasm
- Google storage for the face landmarker task model

### 10.5 GPU fallback to CPU

On some machines the GPU delegate fails during MediaPipe startup. To avoid a hard failure, the code now tries:

1. GPU
2. CPU fallback if GPU initialization fails

This is handled in `createFaceLandmarkerWithFallback`.

### 10.6 Privacy position

The feature is designed as opt-in and browser-local:

- camera starts only when explicitly toggled on
- video frames remain in the browser session
- media tracks are stopped when the feature is turned off
- the status messaging explicitly communicates this

This is not a formal privacy guarantee, but the implementation intentionally avoids uploading frames or sending them to a backend.

## 11. Head Tracking Implementation Details

The active implementation lives in `src/components/TextEditor/TextEditor.tsx`.

### 11.1 Main refs and state

Important refs include:

- `webcamRef`
- `mediaStreamRef`
- `faceLandmarkerRef`
- `trackingFrameRef`
- `lastTrackingSampleRef`
- `activeHeadSentenceIndexRef`
- `pendingHeadSentenceIndexRef`
- `pendingHeadSentenceHitsRef`

Important state includes:

- `headTrackingStatus`
- `headTrackingError`
- later, `calibrationProgress`

### 11.2 Tracking loop

The tracking loop runs via `requestAnimationFrame`, but sampling is throttled using `HEAD_TRACKING_SAMPLE_MS`. This prevents expensive per-frame processing and reduces jitter.

For each sample:

1. `detectForVideo` is called on the current webcam frame
2. a reading target Y coordinate is inferred
3. visible sentences are gathered from the editor DOM
4. the nearest visible sentence center is chosen
5. stability gating is applied before changing the active head-tracked sentence

### 11.3 Sentence selection strategy

The editor already renders each sentence with `data-sentence-index`. The tracking logic uses these sentence spans as addressable visual targets.

The logic only considers visible sentences, determined by comparing sentence bounds with the editor scroll viewport. That matters because:

- the visible page is the actual interaction context
- off-screen sentences should not compete for selection

The nearest sentence to the computed target Y wins.

### 11.4 Stability threshold

To prevent flicker, a sentence is not immediately accepted when first detected. Instead:

- the system keeps a pending sentence index
- it counts repeated hits
- it only switches once `HEAD_TRACKING_STABILITY_THRESHOLD` is reached

This is a simple hysteresis mechanism that significantly improves feel.

## 12. Sensitivity Tuning and Upward Bias

After testing, the user observed that the head-tracking line often remained in the middle region. This made sense because a straight reading posture usually produces limited vertical movement.

### 12.1 Why neutral posture landed too centrally

The early mapping treated the vertical face center too directly. In effect, “normal straight posture” was interpreted as “middle of the editor.”

### 12.2 Upward remapping

The mapping was then changed so neutral head posture no longer maps to roughly `50%` of the visible area. Instead, it maps to a preferred upper reading zone:

- `HEAD_TRACKING_NEUTRAL_TARGET_Y = 0.34`

In addition, a gain was applied:

- `HEAD_TRACKING_VERTICAL_GAIN = 1.35`

This means small user movements now shift the active line more noticeably, while still being clamped to:

- `HEAD_TRACKING_MIN_Y`
- `HEAD_TRACKING_MAX_Y`

This change was a product tuning decision, not a bug fix. It intentionally reflects how users often read slightly above center rather than directly through the vertical midpoint.

## 13. Iris Tracking as a Hybrid Signal

The user later asked whether iris tracking could be added as well. The answer was yes, but not as a full replacement for head tracking.

### 13.1 Rationale

Pure iris tracking in-browser is noisier than head tracking. For this reason, a hybrid model was chosen:

- head posture remains the stable base signal
- iris motion adds a smaller vertical adjustment

This creates a more responsive line-following system without turning the line highlight into a jittery cursor.

### 13.2 Landmark usage

The implementation uses known face mesh landmark indices for the eye region:

- left eye:
  - top: `159`
  - bottom: `145`
  - iris center: `468`
- right eye:
  - top: `386`
  - bottom: `374`
  - iris center: `473`

For each eye, the code estimates the iris center’s vertical position relative to the eye opening. This produces a normalized vertical offset from the eye’s midpoint.

### 13.3 Blending

The vertical iris offset is averaged across both eyes when available and then scaled with:

- `IRIS_VERTICAL_GAIN = 0.16`

This is intentionally much smaller than the head signal so the system remains stable.

## 14. Adaptive Baseline and Calibration

Once hybrid tracking worked, the next improvement was personalization.

### 14.1 Problem

Even with upward bias, a fixed neutral baseline still assumes every user’s natural head position is the same. In practice it is not. Camera angle, screen position, user posture, and seating all shift the apparent face center.

### 14.2 Solution

An adaptive baseline was introduced so the app learns the user’s personal neutral posture before active tracking begins.

### 14.3 New status flow

`HeadTrackingStatus` now includes:

- `idle`
- `starting`
- `calibrating`
- `active`
- `error`

### 14.4 Calibration behavior

When the user enables tracking:

1. webcam starts
2. MediaPipe is prepared
3. the app enters `calibrating`
4. a centered overlay card appears
5. the user is asked to hold their natural reading posture steady
6. the app collects face-center samples for a short duration
7. once enough samples exist and the timer completes, the average becomes the learned baseline
8. the UI switches into `active`
9. the calibration card disappears

### 14.5 Calibration-specific refs and state

New tracking data structures include:

- `calibrationStartedAtRef`
- `calibrationSamplesRef`
- `learnedBaselineRef`
- `calibrationProgress`

### 14.6 Duration and sample thresholds

Current tuning values:

- `HEAD_TRACKING_CALIBRATION_MS = 2800`
- `HEAD_TRACKING_MIN_CALIBRATION_SAMPLES = 6`

These values were chosen to keep calibration short and lightweight while still collecting enough data to be meaningful.

### 14.7 Mapping formula after calibration

Before calibration, the face center was effectively centered around a fixed midpoint.

Now the neutral offset is:

- `faceCenterY - learnedBaselineY`

That offset is then mapped into the reading area using the upward-biased neutral target. This means:

- each user’s normal posture becomes their zero point
- the preferred reading focus still sits around the upper-middle region

### 14.8 Why this matters

This is one of the highest-value tracking improvements from the day because it converts the feature from a generic demo into a more user-specific interaction model.

## 15. Head Tracking UI and Messaging

There are now two main UI surfaces related to tracking:

### 15.1 Status panel

The status panel appears while tracking is enabled or when an error exists. It explains:

- startup state
- calibration state
- active state
- error state
- privacy reminder that frames stay in browser

### 15.2 Calibration card

During calibration, a centered setup card appears with:

- title
- explanation of what the user should do
- progress bar
- remaining time estimate

This card disappears automatically when calibration completes, which matches the requested “set it once, then get out of the way” behavior.

## 16. Deployment and Production Notes

The app was deployed during this cycle.

### 16.1 Hosting recommendation

The recommended deployment target was Vercel because this is a Vite frontend app that benefits from:

- static hosting
- automatic HTTPS
- simple Git-based deploys
- easy preview builds

HTTPS is especially important because webcam APIs require a secure context outside localhost.

### 16.2 Deployment issue encountered

The first Vercel build failed with:

- `vite: command not found`

The root cause was a misconfigured Vercel install command. Vercel was trying to run:

- `npm run build`

as the install step instead of actually installing dependencies first.

### 16.3 Correct Vercel settings

The working configuration is:

- Install Command: `npm install` or left blank
- Build Command: `npm run build`
- Output Directory: `dist`

### 16.4 Environment variables

For deployed Supabase access, Vercel must define:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

The local `.env` file remains ignored via `.gitignore`, which is correct.

### 16.5 Production branch

The user also asked how to switch the deployment branch. The relevant Vercel setting is:

- `Settings -> Git -> Production Branch`

This allows the production deployment branch to be changed without changing the repository’s default branch.

## 17. Current Architecture Overview

At the end of today, the app architecture can be summarized like this:

### 17.1 `App.tsx`

Owns top-level application state for:

- content
- reader settings
- feature toggles
- document modal visibility
- support hub visibility
- text-to-speech state
- current document id
- mobile panel open state
- reading mode state

It also owns:

- Supabase persistence flows
- PDF import entry point
- text-to-speech orchestration

### 17.2 `ControlPanel.tsx`

Owns the tools UI for:

- visual reading settings
- color themes
- support toggles
- reading mode entry
- support hub launch
- document actions

It is now reusable across desktop and mobile contexts.

### 17.3 `TextEditor.tsx`

This is the most feature-dense component. It owns:

- contentEditable editor rendering
- sentence markup generation
- word token markup generation
- hover panel generation
- pinned help behavior
- reading ruler behavior
- focus-mode overlays
- difficult-word styling hooks
- sentence chunk stepping
- active sentence scroll/follow
- webcam tracking startup/teardown
- line inference from face/iris signals
- calibration flow

This file has become the central behavioral engine of the reading experience.

### 17.4 `SupportHub.tsx`

Owns the curated support UI:

- modal shell
- search
- filters
- resource sections
- summary cards
- resource cards

### 17.5 `supportResources.ts`

Owns the source of truth for external resources.

This is important for maintainability and future content review.

## 18. Verification Performed

Throughout the work, the codebase was repeatedly verified with:

- `npm run typecheck`
- `npm run build`

Both commands pass at the end of this cycle.

The build still emits a chunk-size warning for large bundles, especially around:

- PDF handling
- the main app bundle
- MediaPipe-related assets

This is not a blocking issue for deployment, but it is relevant future technical debt.

## 19. Key Tradeoffs Chosen

Several deliberate tradeoffs were made:

### 19.1 Exact word gaze was deprioritized

Reason:

- unstable
- difficult in browser-only conditions
- poor product feel

### 19.2 Head-guided reading line was prioritized

Reason:

- more stable
- more realistic
- better aligned with reading support

### 19.3 Iris tracking is secondary, not primary

Reason:

- it improves responsiveness
- but should not dominate because of jitter risk

### 19.4 Calibration is lightweight

Reason:

- better personalization
- without burdening the user with a long onboarding step

### 19.5 Definitions remain local and heuristic for now

Reason:

- fast prototype value
- no dependency on a remote dictionary
- lower privacy and availability risk

### 19.6 Support Hub is curated and code-driven

Reason:

- trusted content matters more than unreviewed freshness
- safer for a support-oriented product

## 20. Known Limitations at End of Day

Despite strong progress, several limitations remain.

### 20.1 Tracking limitations

- line inference is still approximate
- no explicit confidence score is shown to users
- calibration assumes the user stays fairly steady for a short window
- there is not yet a manual recalibration button

### 20.2 Mobile limitations

- the word-help panel is more responsive now, but not yet a dedicated bottom sheet on phones
- touch-first interaction patterns could be improved further

### 20.3 Content support limitations

- simple definitions are intentionally lightweight
- pronunciation breakdown remains heuristic
- no remote dictionary or comprehension API is integrated yet

### 20.4 Performance limitations

- bundle size is still large
- MediaPipe assets are still remotely loaded rather than self-hosted

### 20.5 Security limitations

- Supabase access uses the public anon key correctly, but the long-term production security posture still depends on strong row-level policies

## 21. Recommended Next Steps

If development continues from here, the most valuable next moves are:

1. Add a `Recalibrate` control to head tracking.
2. Add optional advanced tracking settings:
   - head sensitivity
   - iris sensitivity
   - smoothing
   - neutral line height
3. Improve mobile-specific interaction for the word-help panel.
4. Expand or upgrade the simple definition layer.
5. Self-host MediaPipe assets if stronger privacy and reliability control is desired.
6. Add a landing page if the app is going to be shared publicly beyond a direct workspace audience.
7. Tighten Supabase RLS policies before broad release.
8. Consider code-splitting to reduce main bundle pressure.

## 22. Closing Summary

Today’s work was not just a sequence of isolated features. It was a meaningful shift in the app’s maturity.

The app now has:

- a clearer reading-first identity
- stronger dyslexia-oriented UX choices
- a reliable persistence path
- a real support-resource system
- a deployable production build
- a more thoughtful and adaptive webcam-guided reading aid

The most significant architectural outcome is that the app now has a layered model of reading assistance:

- visual reading adjustments
- word-level help
- sentence-level support
- speech follow mode
- curated external support
- browser-local attention guidance

That gives future work a stronger foundation than earlier iterations. The system is now much better positioned for further research, product refinement, and user testing.
