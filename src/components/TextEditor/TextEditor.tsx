import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Crosshair,
  FileText,
  Pencil,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { FaceLandmarker, NormalizedLandmark } from '@mediapipe/tasks-vision';
import { HeadTrackingStatus, ReaderSettings } from '../../types';
import { MlPredictionLab } from '../MlPredictionLab';
import { tokenizeText } from '../../utils/tokenizeText';
import { analyzeWordSupport, normalizeWord } from '../../utils/pronunciation';
import { analyzeWordDifficulty } from '../../utils/wordDifficulty';
import { analyzeSentence, splitIntoSentences, type SentenceSegment } from '../../utils/sentences';
import { getSimpleDefinition } from '../../utils/simpleDefinitions';
import {
  evaluateZucoWordCognitiveLoad,
  type WordBehavioralObservation,
} from '../../utils/zucoFeatureModel';

interface TextEditorProps {
  content: string;
  onContentChange: (content: string) => void;
  settings: ReaderSettings;
  onSettingsChange: (settings: ReaderSettings) => void;
  showReadingGuide: boolean;
  focusMode: boolean;
  wordHighlight: boolean;
  showDifficultWords: boolean;
  showSentenceSimplification: boolean;
  adaptiveEngineEnabled: boolean;
  onToggleAdaptiveEngine: () => void;
  onHighLoadSentencesChange: (sentenceIndices: number[]) => void;
  showMlPredictionLab: boolean;
  onOpenMlPredictionLab: () => void;
  onCloseMlPredictionLab: () => void;
  pdfFallbackMessage: string | null;
  onDismissPdfFallback: () => void;
  headTrackingEnabled: boolean;
  recalibrateTrigger: number;
  onHeadTrackingStatusChange: (status: HeadTrackingStatus) => void;
  onTrackingPositionInitializedChange: (initialized: boolean) => void;
  onHeadTrackedSentenceChange: (sentenceIndex: number | null) => void;
  onReadFromSentence: (sentenceIndex: number) => void;
  isSpeaking: boolean;
  readingMode: boolean;
  activeSentenceIndex: number | null;
  sentenceTtsPlayCounts: Record<number, number>;
  hoverPronunciationRate: number;
  onHoverPronunciationRateChange: (rate: number) => void;
}

type HoverCard = {
  word: string;
  breakdown: string[];
  phoneticHint: string;
  morphology: {
    prefix?: string;
    root: string;
    suffix?: string;
  };
  top: number;
  left: number;
  width: number;
};

type WordTarget = {
  element: HTMLElement;
  word: string;
  rect: DOMRect;
};

type AttentionPoint = {
  x: number;
  y: number;
};

type HeadPoseSample = {
  upperFaceX: number;
  upperFaceY: number;
  pitchRatio: number;
  yawRatio: number;
  interOcularDist: number;
};

type IrisSample = {
  x: number;
  y: number;
};

type VisualLineFragment = {
  sentenceIndex: number;
  paragraphIndex: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type VisualLine = {
  lineIndex: number;
  paragraphIndex: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  centerY: number;
  height: number;
  fragments: VisualLineFragment[];
};

type ParagraphBox = {
  paragraphIndex: number;
  top: number;
  bottom: number;
  left: number;
  right: number;
  height: number;
  width: number;
  lineCount: number;
};

type OverlayLineBox = {
  lineIndex: number;
  paragraphIndex: number;
  sentenceIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
  gazeXPercent: number;
  isCalibrationTarget: boolean;
};

type OverlayParagraphBox = {
  paragraphIndex: number;
  top: number;
  left: number;
  width: number;
  height: number;
  lineCount: number;
};

type TrackedSelection = {
  lineIndex: number;
  sentenceIndex: number;
  paragraphIndex: number;
  attentionPoint: AttentionPoint;
  trackedWord?: string | null;
  trackedWordElement?: HTMLElement | null;
  fusionConfidence?: number;
  fusionSource?: 'Gaze + Caret' | 'Gaze (Iris + Head)' | 'Gaze (Head)' | 'Caret Anchor';
  isReturnSweepAdvance?: boolean;
};

type CaretAnchorState = {
  word: string | null;
  wordElement: HTMLElement | null;
  sentenceIndex: number | null;
  paragraphIndex: number | null;
  normX: number;
  normY: number;
  startedAt: number;
  lastMovedAt: number;
  triggeredSupportForWord: string | null;
};

type HesitationWordPrompt = {
  word: string;
  breakdown: string[];
  phoneticHint: string;
  isDifficult: boolean;
  lineIndex: number;
  sentenceIndex: number;
};

type AutoGainStage = 'idle' | 'top' | 'bottom';

const HEAD_TRACKING_SAMPLE_MS = 80;
const RETURN_SWEEP_COOLDOWN_MS = 850;
const HESITATION_DWELL_MS = 2400;
const AUTO_GAIN_STAGE_MS = 1400;
const AUTO_GAIN_MIN_SAMPLES = 9;
const POSITION_AUTO_LOCK_STEADY_SAMPLES = 9;
const HEAD_TRACKING_CALIBRATION_MS = 2100;
const HEAD_TRACKING_MIN_CALIBRATION_SAMPLES = 12;
const HEAD_TRACKING_MIN_Y = 0.04;
const HEAD_TRACKING_MAX_Y = 0.96;

const SAMPLE_PASSAGE = `Reading feels much easier when each line and paragraph stay clearly anchored in view. Many readers with dyslexia lose their place when moving from the end of one visual line to the beginning of the next line. By combining gentle head posture guidance with calibrated iris tracking, the reading workspace can highlight both your current line and your active paragraph at the same time.

In the first initialization step, you simply look at your starting reading line so the tracker learns your natural posture and eye angle. Once your reading position is locked, the fine-tuning sliders unlock so you can adjust eye sensitivity, head sensitivity, and line steadiness at your own pace.

As you continue reading into a new paragraph, the paragraph frame and line guide glide with your attention. You can click any word for syllable pronunciation support, or re-initialize your reading position anytime you shift how you sit.`;

const LEFT_EYE_INDICES = {
  topLids: [159, 158, 160],
  bottomLids: [145, 144, 153],
  iris: [468, 469, 470, 471, 472],
  outer: 33,
  inner: 133,
};

const RIGHT_EYE_INDICES = {
  topLids: [386, 385, 387],
  bottomLids: [374, 373, 380],
  iris: [473, 474, 475, 476, 477],
  outer: 263,
  inner: 362,
};

const MEDIAPIPE_VERSION = '0.10.34';
const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export function TextEditor({
  content,
  onContentChange,
  settings,
  onSettingsChange,
  showReadingGuide,
  focusMode,
  wordHighlight,
  showDifficultWords,
  showSentenceSimplification,
  adaptiveEngineEnabled,
  onToggleAdaptiveEngine,
  onHighLoadSentencesChange,
  showMlPredictionLab,
  onOpenMlPredictionLab,
  onCloseMlPredictionLab,
  pdfFallbackMessage,
  onDismissPdfFallback,
  headTrackingEnabled,
  recalibrateTrigger,
  onHeadTrackingStatusChange,
  onTrackingPositionInitializedChange,
  onHeadTrackedSentenceChange,
  onReadFromSentence,
  isSpeaking,
  readingMode,
  activeSentenceIndex,
  sentenceTtsPlayCounts,
  hoverPronunciationRate,
  onHoverPronunciationRateChange,
}: TextEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hoverCardRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const webcamRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);

  const settingsRef = useRef<ReaderSettings>(settings);
  const onSettingsChangeRef = useRef(onSettingsChange);
  const onHeadTrackedSentenceChangeRef = useRef(onHeadTrackedSentenceChange);

  const activeHeadSentenceElementRef = useRef<HTMLElement | null>(null);
  const activeHeadSentenceIndexRef = useRef<number | null>(null);
  const activeHeadParagraphIndexRef = useRef<number | null>(null);
  const activeVisualLineIndexRef = useRef<number | null>(null);

  const pendingLineKeyRef = useRef<string | null>(null);
  const pendingLineHitsRef = useRef(0);
  const edgeScrollSteadyHitsRef = useRef(0);

  const trackingFrameRef = useRef<number | null>(null);
  const lastTrackingSampleRef = useRef(0);
  const isTrackingFramePendingRef = useRef(false);
  const headTrackingStatusRef = useRef<HeadTrackingStatus>('idle');

  const calibrationTargetLineIndexRef = useRef<number>(0);
  const calibrationTargetSentenceIndexRef = useRef<number | null>(null);
  const positioningRecentSamplesRef = useRef<HeadPoseSample[]>([]);
  const calibrationStartedAtRef = useRef<number | null>(null);
  const calibrationHeadSamplesRef = useRef<HeadPoseSample[]>([]);
  const calibrationIrisSamplesRef = useRef<IrisSample[]>([]);
  const learnedHeadBaselineRef = useRef<HeadPoseSample | null>(null);
  const learnedIrisBaselineRef = useRef<IrisSample | null>(null);
  const latestHeadSampleRef = useRef<HeadPoseSample | null>(null);
  const previousHeadSampleRef = useRef<HeadPoseSample | null>(null);
  const lastValidIrisSampleRef = useRef<IrisSample | null>(null);
  const smoothedAttentionPointRef = useRef<AttentionPoint | null>(null);
  const latestAttentionPointRef = useRef<AttentionPoint>({ x: 0.5, y: settings.trackingNeutralLineHeight });
  const lineMaxProgressXRef = useRef<number>(0);
  const lineSamplesCountRef = useRef<number>(0);
  const lineRightHalfSamplesRef = useRef<number>(0);
  const returnSweepYOffsetRef = useRef<number>(0);
  const lastReturnSweepAtRef = useRef<number>(0);
  const returnSweepBadgeTimerRef = useRef<number | null>(null);
  const recenterNoticeTimerRef = useRef<number | null>(null);
  const autoGainStageRef = useRef<AutoGainStage>('idle');
  const autoGainDataRef = useRef<{
    topLineIndex: number;
    bottomLineIndex: number;
    topLineNormY: number;
    bottomLineNormY: number;
    stageStartedAt: number;
    headSamples: HeadPoseSample[];
    irisSamples: IrisSample[];
    topHead: HeadPoseSample | null;
    topIris: IrisSample | null;
  } | null>(null);
  const hesitationDwellRef = useRef<{
    lineIndex: number;
    anchorX: number;
    startedAt: number;
    triggeredWord: string | null;
  } | null>(null);
  const hesitationElementRef = useRef<HTMLElement | null>(null);
  const activeGazeWordElementRef = useRef<HTMLElement | null>(null);
  const activeCaretWordElementRef = useRef<HTMLElement | null>(null);
  const caretAnchorRef = useRef<CaretAnchorState | null>(null);
  const lastScrollTopRef = useRef<number>(0);
  const lastScrollMoveAtRef = useRef<number>(performance.now());
  const lastRegressionCountedAtRef = useRef<number>(0);
  const hasScrolledSincePauseCountedRef = useRef<boolean>(false);
  const wordBehavioralMapRef = useRef<Map<string, WordBehavioralObservation>>(new Map());
  const activeWordObservationRef = useRef<{
    word: string;
    startedAt: number;
    lastTickAt: number;
    isFirstPass: boolean;
  } | null>(null);
  const visitedSentenceIndicesRef = useRef<Set<number>>(new Set());
  const readingStartedAtRef = useRef<number>(performance.now());

  const isUserTyping = useRef(false);
  const hideTimerRef = useRef<number | null>(null);

  const [hoverCard, setHoverCard] = useState<HoverCard | null>(null);
  const [isHoverCardPinned, setIsHoverCardPinned] = useState(false);
  const [clauseFocusBySentence, setClauseFocusBySentence] = useState<Record<number, number>>({});
  const [headTrackingStatus, setHeadTrackingStatus] = useState<HeadTrackingStatus>('idle');
  const [headTrackingError, setHeadTrackingError] = useState<string | null>(null);
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [positioningStability, setPositioningStability] = useState(0);
  const [faceDetectedLive, setFaceDetectedLive] = useState(false);
  const [irisDetectedLive, setIrisDetectedLive] = useState(false);
  const [showCameraPreview, setShowCameraPreview] = useState(true);
  const [isPositionInitialized, setIsPositionInitialized] = useState(false);
  const [showSliderStepPanel, setShowSliderStepPanel] = useState(false);
  const [overlayLineBox, setOverlayLineBox] = useState<OverlayLineBox | null>(null);
  const [overlayParagraphBox, setOverlayParagraphBox] = useState<OverlayParagraphBox | null>(null);
  const [returnSweepTargetLine, setReturnSweepTargetLine] = useState<number | null>(null);
  const [recenterNotice, setRecenterNotice] = useState<string | null>(null);
  const [autoGainStage, setAutoGainStage] = useState<AutoGainStage>('idle');
  const [autoGainProgress, setAutoGainProgress] = useState(0);
  const [autoGainTargetLineIndex, setAutoGainTargetLineIndex] = useState<number>(0);
  const [hesitationPrompt, setHesitationPrompt] = useState<HesitationWordPrompt | null>(null);
  const [trackedWord, setTrackedWord] = useState<string | null>(null);
  const [fusionConfidence, setFusionConfidence] = useState<number>(0);
  const [fusionSource, setFusionSource] = useState<
    'Gaze + Caret' | 'Gaze (Iris + Head)' | 'Gaze (Head)' | 'Caret Anchor'
  >('Gaze (Iris + Head)');
  const [caretWord, setCaretWord] = useState<string | null>(null);
  const [caretSentenceIndex, setCaretSentenceIndex] = useState<number | null>(null);
  const [caretDwellMs, setCaretDwellMs] = useState<number>(0);
  const [caretFrictionEvents, setCaretFrictionEvents] = useState<number>(0);
  const [gazeHesitationEvents, setGazeHesitationEvents] = useState<number>(0);
  const [scrollPauseMs, setScrollPauseMs] = useState<number>(0);
  const [scrollPauseCount, setScrollPauseCount] = useState<number>(0);
  const [scrollRegressionCount, setScrollRegressionCount] = useState<number>(0);
  const [wordTtsPlayCounts, setWordTtsPlayCounts] = useState<Record<string, number>>({});
  const [showBehavioralSignalsPanel, setShowBehavioralSignalsPanel] = useState<boolean>(false);
  const [selectedPhrase, setSelectedPhrase] = useState<{
    text: string;
    top: number;
    left: number;
  } | null>(null);
  const [isSpeakingSelection, setIsSpeakingSelection] = useState<boolean>(false);
  const [tunnelCenterPercent, setTunnelCenterPercent] = useState<number>(38);
  const [adaptiveSentenceIndices, setAdaptiveSentenceIndices] = useState<number[]>([]);
  const [estimatedWpm, setEstimatedWpm] = useState<number>(0);
  const [trackedMetrics, setTrackedMetrics] = useState<{
    lineIndex: number;
    paragraphIndex: number;
    sentenceIndex: number;
    totalLines: number;
    totalParagraphs: number;
  } | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [mobileEditingEnabled, setMobileEditingEnabled] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    onSettingsChangeRef.current = onSettingsChange;
  }, [onSettingsChange]);

  useEffect(() => {
    onHeadTrackedSentenceChangeRef.current = onHeadTrackedSentenceChange;
  }, [onHeadTrackedSentenceChange]);

  useEffect(() => {
    headTrackingStatusRef.current = headTrackingStatus;
    onHeadTrackingStatusChange(headTrackingStatus);
  }, [headTrackingStatus, onHeadTrackingStatusChange]);

  useEffect(() => {
    onTrackingPositionInitializedChange(isPositionInitialized);
  }, [isPositionInitialized, onTrackingPositionInitializedChange]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updateTouchState = () => {
      setIsTouchDevice(mediaQuery.matches || 'ontouchstart' in window);
    };

    updateTouchState();
    mediaQuery.addEventListener('change', updateTouchState);

    return () => mediaQuery.removeEventListener('change', updateTouchState);
  }, []);

  useEffect(() => {
    if (!isTouchDevice) {
      setMobileEditingEnabled(false);
    }
  }, [isTouchDevice]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const y = event.clientY - rect.top;

      if (showReadingGuide && guideRef.current) {
        guideRef.current.style.top = `${y - 20}px`;
      }

      if (focusMode && !headTrackingEnabled && rect.height > 80) {
        const pct = clamp((y / rect.height) * 100, 18, 82);
        setTunnelCenterPercent(pct);
      }
    };

    const container = containerRef.current;
    if (container && (showReadingGuide || focusMode)) {
      container.addEventListener('mousemove', handleMouseMove);
      return () => container.removeEventListener('mousemove', handleMouseMove);
    }
  }, [showReadingGuide, focusMode, headTrackingEnabled]);

  const extraStrokePx =
    settings.fontWeight > 400
      ? Number((((settings.fontWeight - 400) / 500) * 0.65).toFixed(2))
      : 0;

  const editorStyle: CSSProperties = {
    fontFamily: settings.fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: settings.lineSpacing,
    letterSpacing: `${settings.letterSpacing}px`,
    fontWeight: settings.fontWeight,
    WebkitTextStroke: extraStrokePx > 0 ? `${extraStrokePx}px currentColor` : undefined,
    opacity: settings.fontWeight < 400 ? 0.86 : 1,
    color: settings.textColor,
    backgroundColor: settings.backgroundColor,
  };

  useEffect(() => {
    if (!editorRef.current || isUserTyping.current) {
      return;
    }

    const segments = splitIntoSentences(content);
    editorRef.current.innerHTML = buildEditorMarkup(
      segments,
      activeSentenceIndex,
      showDifficultWords,
      showSentenceSimplification,
      clauseFocusBySentence
    );

    syncHeadTrackedDomHighlights();
    refreshTrackedOverlayGeometry();
  }, [
    content,
    showDifficultWords,
    showSentenceSimplification,
    activeSentenceIndex,
    clauseFocusBySentence,
    settings.fontSize,
    settings.lineSpacing,
    settings.letterSpacing,
    settings.fontFamily,
    settings.fontWeight,
    wordHighlight,
    readingMode,
  ]);

  useEffect(() => {
    const handleResize = () => {
      refreshTrackedOverlayGeometry();
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [headTrackingEnabled, headTrackingStatus]);

  useEffect(() => {
    if (!editorRef.current || activeSentenceIndex === null) {
      return;
    }

    const activeSentence = editorRef.current.querySelector(
      `[data-sentence-index="${activeSentenceIndex}"]`
    ) as HTMLSpanElement | null;

    activeSentence?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activeSentenceIndex]);

  useEffect(() => {
    visitedSentenceIndicesRef.current.clear();
    readingStartedAtRef.current = performance.now();
    setEstimatedWpm(0);
  }, [content]);

  useEffect(() => {
    const activeIdx =
      trackedMetrics?.sentenceIndex ??
      activeSentenceIndex ??
      caretSentenceIndex ??
      null;
    if (activeIdx === null || !content.trim()) {
      return;
    }

    visitedSentenceIndicesRef.current.add(activeIdx);
    const segments = splitIntoSentences(content).filter((s) => !s.isNewline && s.text.trim());
    let wordsRead = 0;
    for (const seg of segments) {
      if (visitedSentenceIndicesRef.current.has(seg.index)) {
        wordsRead += seg.text.trim().split(/\s+/).filter(Boolean).length;
      }
    }

    const elapsedMinutes = Math.max(0.15, (performance.now() - readingStartedAtRef.current) / 60000);
    if (wordsRead >= 4) {
      setEstimatedWpm(Math.min(320, Math.max(25, Math.round(wordsRead / elapsedMinutes))));
    }
  }, [trackedMetrics?.sentenceIndex, activeSentenceIndex, caretSentenceIndex, content]);

  useEffect(() => {
    const focusedWord = (trackedWord ?? caretWord)?.toLowerCase() ?? null;
    const now = performance.now();
    const prevObs = activeWordObservationRef.current;

    if (prevObs && prevObs.word !== focusedWord) {
      const deltaMs = clamp(now - prevObs.lastTickAt, 0, 600);
      const record = wordBehavioralMapRef.current.get(prevObs.word);
      if (record) {
        record.totalReadingTimeMs += deltaMs;
        record.goPastTimeMs += deltaMs;
        if (prevObs.isFirstPass) {
          record.firstFixationDurationMs += deltaMs;
          record.gazeDurationMs += deltaMs;
        }
      }
      activeWordObservationRef.current = null;
    }

    if (!focusedWord || focusedWord.length < 2) {
      return;
    }

    let existing = wordBehavioralMapRef.current.get(focusedWord);
    const isNewVisit = !prevObs || prevObs.word !== focusedWord;

    if (!existing) {
      existing = {
        firstFixationDurationMs: 120,
        gazeDurationMs: 140,
        totalReadingTimeMs: 140,
        goPastTimeMs: 140,
        fixationCount: 1,
        regressionCount: 0,
        ttsReplays: Math.max(0, (wordTtsPlayCounts[focusedWord] ?? 0) - 1),
      };
      wordBehavioralMapRef.current.set(focusedWord, existing);
      activeWordObservationRef.current = {
        word: focusedWord,
        startedAt: now,
        lastTickAt: now,
        isFirstPass: true,
      };
    } else if (isNewVisit) {
      existing.fixationCount += 1;
      existing.regressionCount += 1;
      existing.totalReadingTimeMs += 110;
      existing.goPastTimeMs += 210;
      existing.ttsReplays = Math.max(0, (wordTtsPlayCounts[focusedWord] ?? 0) - 1);
      activeWordObservationRef.current = {
        word: focusedWord,
        startedAt: now,
        lastTickAt: now,
        isFirstPass: false,
      };
    } else if (prevObs) {
      const deltaMs = clamp(now - prevObs.lastTickAt, 0, 500);
      prevObs.lastTickAt = now;
      existing.totalReadingTimeMs += deltaMs;
      existing.goPastTimeMs += deltaMs;
      if (prevObs.isFirstPass) {
        existing.firstFixationDurationMs += deltaMs * 0.7;
        existing.gazeDurationMs += deltaMs;
      }
    }
  }, [trackedWord, caretWord, caretDwellMs, wordTtsPlayCounts]);

  useEffect(() => {
    const segments = splitIntoSentences(content).filter((s) => !s.isNewline && s.text.trim());
    if (!adaptiveEngineEnabled || segments.length === 0) {
      setAdaptiveSentenceIndices([]);
      onHighLoadSentencesChange([]);
      if (editorRef.current) {
        editorRef.current
          .querySelectorAll('.sentence-adaptive-load')
          .forEach((el) => el.classList.remove('sentence-adaptive-load'));
      }
      return;
    }

    const highLoadIndices: number[] = [];
    for (const seg of segments) {
      const sentencePlays = sentenceTtsPlayCounts[seg.index] ?? 0;
      const isHesitatedSentence = hesitationPrompt?.sentenceIndex === seg.index;
      const words = seg.text
        .split(/\s+/)
        .map((w) => normalizeWord(w).toLowerCase())
        .filter((w) => w.length >= 4);

      let hasHighBehavioralWord = false;

      for (const w of words) {
        const obs = wordBehavioralMapRef.current.get(w);
        if ((obs && obs.totalReadingTimeMs >= 900) || (wordTtsPlayCounts[w] ?? 0) >= 2) {
          hasHighBehavioralWord = true;
          break;
        }
      }

      if (
        sentencePlays >= 2 ||
        isHesitatedSentence ||
        hasHighBehavioralWord
      ) {
        highLoadIndices.push(seg.index);
      }
    }

    setAdaptiveSentenceIndices(highLoadIndices);
    onHighLoadSentencesChange(highLoadIndices);

    if (editorRef.current) {
      const highLoadSet = new Set(highLoadIndices);
      editorRef.current
        .querySelectorAll<HTMLElement>('[data-sentence-index]')
        .forEach((el) => {
          const idx = Number(el.dataset.sentenceIndex);
          if (highLoadSet.has(idx)) {
            el.classList.add('sentence-adaptive-load');
          } else {
            el.classList.remove('sentence-adaptive-load');
          }
        });
    }
  }, [
    content,
    adaptiveEngineEnabled,
    sentenceTtsPlayCounts,
    wordTtsPlayCounts,
    hesitationPrompt,
    caretFrictionEvents,
    gazeHesitationEvents,
  ]);

  useEffect(() => {
    if (!isHoverCardPinned) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (hoverCardRef.current?.contains(target)) {
        return;
      }

      const clickedElement = target instanceof HTMLElement ? target : target.parentElement;
      if (clickedElement?.closest('[data-word="true"]')) {
        return;
      }

      setIsHoverCardPinned(false);
      setHoverCard(null);
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isHoverCardPinned]);

  useEffect(() => {
    return () => {
      stopHeadTracking();
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (recalibrateTrigger > 0 && headTrackingEnabled && faceLandmarkerRef.current) {
      beginPositionInitialization();
    }
  }, [recalibrateTrigger]);

  useEffect(() => {
    if (!headTrackingEnabled) {
      stopHeadTracking();
      setHeadTrackingStatus('idle');
      setHeadTrackingError(null);
      setIsPositionInitialized(false);
      setShowSliderStepPanel(false);
      return;
    }

    let cancelled = false;

    const startHeadTracking = async () => {
      const webcam = webcamRef.current;
      if (!webcam) {
        setHeadTrackingStatus('error');
        setHeadTrackingError('The camera preview could not be prepared.');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        setHeadTrackingStatus('error');
        setHeadTrackingError('This browser does not support webcam access.');
        return;
      }

      setHeadTrackingStatus('starting');
      setHeadTrackingError(null);
      setIsPositionInitialized(false);
      setShowSliderStepPanel(false);

      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
        });

        if (cancelled) {
          mediaStream.getTracks().forEach((track) => track.stop());
          return;
        }

        mediaStreamRef.current = mediaStream;
        webcam.srcObject = mediaStream;
        await webcam.play();

        if (cancelled) {
          stopHeadTracking();
          return;
        }

        const vision = await import('@mediapipe/tasks-vision');
        if (cancelled) {
          stopHeadTracking();
          return;
        }

        const filesetResolver = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
        if (cancelled) {
          stopHeadTracking();
          return;
        }

        faceLandmarkerRef.current = await createFaceLandmarkerWithFallback(vision, filesetResolver);

        if (cancelled) {
          stopHeadTracking();
          return;
        }

        beginPositionInitialization();
        trackingFrameRef.current = window.requestAnimationFrame(runHeadTrackingLoop);
      } catch (error) {
        setHeadTrackingStatus('error');
        setHeadTrackingError(getHeadTrackingErrorMessage(error));
      }
    };

    startHeadTracking();

    return () => {
      cancelled = true;
      stopHeadTracking();
    };
  }, [headTrackingEnabled]);

  const beginPositionInitialization = (preferredLineIndex?: number, preferredSentenceIndex?: number) => {
    positioningRecentSamplesRef.current = [];
    calibrationStartedAtRef.current = null;
    calibrationHeadSamplesRef.current = [];
    calibrationIrisSamplesRef.current = [];
    learnedHeadBaselineRef.current = null;
    learnedIrisBaselineRef.current = null;
    smoothedAttentionPointRef.current = null;
    pendingLineKeyRef.current = null;
    pendingLineHitsRef.current = 0;
    lineMaxProgressXRef.current = 0;
    lineSamplesCountRef.current = 0;
    lineRightHalfSamplesRef.current = 0;
    returnSweepYOffsetRef.current = 0;
    lastReturnSweepAtRef.current = 0;
    setReturnSweepTargetLine(null);
    clearHesitationState();

    setCalibrationProgress(0);
    setPositioningStability(0);
    setIsPositionInitialized(false);
    setShowSliderStepPanel(false);
    setShowCameraPreview(true);

    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    if (visualLines.length > 0) {
      let chosenLine = visualLines[0];

      if (preferredLineIndex !== undefined && visualLines[preferredLineIndex]) {
        chosenLine = visualLines[preferredLineIndex];
      } else if (preferredSentenceIndex !== undefined) {
        const matchingLine = visualLines.find((line) =>
          line.fragments.some((fragment) => fragment.sentenceIndex === preferredSentenceIndex)
        );
        if (matchingLine) {
          chosenLine = matchingLine;
        }
      } else if (activeVisualLineIndexRef.current !== null && visualLines[activeVisualLineIndexRef.current]) {
        chosenLine = visualLines[activeVisualLineIndexRef.current];
      }

      calibrationTargetLineIndexRef.current = chosenLine.lineIndex;
      const targetSentence = chosenLine.fragments[0]?.sentenceIndex ?? null;
      calibrationTargetSentenceIndexRef.current = targetSentence;

      applyTrackedSelection({
        lineIndex: chosenLine.lineIndex,
        sentenceIndex: targetSentence ?? 0,
        paragraphIndex: chosenLine.paragraphIndex,
        attentionPoint: {
          x: 0.5,
          y: getNormalizedLineY(chosenLine, editorScrollRef.current, settingsRef.current.trackingNeutralLineHeight),
        },
      });
    } else {
      calibrationTargetLineIndexRef.current = 0;
      calibrationTargetSentenceIndexRef.current = null;
      clearTrackedSelection();
    }

    setHeadTrackingStatus('positioning');
    headTrackingStatusRef.current = 'positioning';
  };

  const startCalibrationLockNow = () => {
    if (headTrackingStatusRef.current !== 'positioning' && headTrackingStatusRef.current !== 'calibrating') {
      return;
    }
    calibrationStartedAtRef.current = performance.now();
    calibrationHeadSamplesRef.current = [];
    calibrationIrisSamplesRef.current = [];
    setCalibrationProgress(0.05);
    setHeadTrackingStatus('calibrating');
    headTrackingStatusRef.current = 'calibrating';
  };

  const instantRecenterOnCurrentLine = () => {
    const headSample = latestHeadSampleRef.current;
    if (!headSample) {
      return;
    }

    learnedHeadBaselineRef.current = { ...headSample };
    learnedIrisBaselineRef.current = lastValidIrisSampleRef.current
      ? { ...lastValidIrisSampleRef.current }
      : { x: 0, y: 0 };
    returnSweepYOffsetRef.current = 0;
    pendingLineKeyRef.current = null;
    pendingLineHitsRef.current = 0;

    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    const preferredIndex =
      headTrackingStatusRef.current === 'active'
        ? (activeVisualLineIndexRef.current ?? 0)
        : calibrationTargetLineIndexRef.current;

    const targetLine =
      visualLines.find((line) => line.lineIndex === preferredIndex) ??
      visualLines[0] ??
      null;

    let neutralHeight = settingsRef.current.trackingNeutralLineHeight;
    if (targetLine && editorScrollRef.current) {
      neutralHeight = getNormalizedLineY(
        targetLine,
        editorScrollRef.current,
        settingsRef.current.trackingNeutralLineHeight
      );
      const roundedHeight = Math.round(neutralHeight * 100) / 100;
      if (Math.abs(roundedHeight - settingsRef.current.trackingNeutralLineHeight) >= 0.01) {
        onSettingsChangeRef.current({
          ...settingsRef.current,
          trackingNeutralLineHeight: roundedHeight,
        });
      }
    }

    const anchoredPoint: AttentionPoint = {
      x: 0.5,
      y: neutralHeight,
    };
    smoothedAttentionPointRef.current = anchoredPoint;

    if (targetLine) {
      applyTrackedSelection({
        lineIndex: targetLine.lineIndex,
        sentenceIndex:
          activeHeadSentenceIndexRef.current ??
          targetLine.fragments[0]?.sentenceIndex ??
          0,
        paragraphIndex: targetLine.paragraphIndex,
        attentionPoint: anchoredPoint,
      });
    }

    if (headTrackingStatusRef.current !== 'active') {
      setCalibrationProgress(1);
      setIsPositionInitialized(true);
      setHeadTrackingStatus('active');
      headTrackingStatusRef.current = 'active';
    }

    const recenteredLineLabel = (targetLine?.lineIndex ?? 0) + 1;
    setRecenterNotice(`✓ Posture recentered on Line ${recenteredLineLabel}`);
    if (recenterNoticeTimerRef.current) {
      window.clearTimeout(recenterNoticeTimerRef.current);
    }
    recenterNoticeTimerRef.current = window.setTimeout(() => {
      setRecenterNotice(null);
    }, 1800);
  };

  const cancelTwoPointAutoGain = () => {
    autoGainStageRef.current = 'idle';
    autoGainDataRef.current = null;
    setAutoGainStage('idle');
    setAutoGainProgress(0);
    refreshTrackedOverlayGeometry();
  };

  const startTwoPointAutoGain = () => {
    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    if (visualLines.length < 2) {
      if (!content.trim()) {
        onContentChange(SAMPLE_PASSAGE);
      }
      return;
    }

    const topLine = visualLines[0];
    const bottomIndex = Math.min(
      visualLines.length - 1,
      Math.max(1, Math.floor(visualLines.length * 0.75))
    );
    const bottomLine = visualLines[bottomIndex];

    const topLineNormY = getNormalizedLineY(
      topLine,
      editorScrollRef.current,
      0.24
    );
    const bottomLineNormY = getNormalizedLineY(
      bottomLine,
      editorScrollRef.current,
      0.66
    );

    autoGainDataRef.current = {
      topLineIndex: topLine.lineIndex,
      bottomLineIndex: bottomLine.lineIndex,
      topLineNormY,
      bottomLineNormY: Math.max(topLineNormY + 0.14, bottomLineNormY),
      stageStartedAt: performance.now(),
      headSamples: [],
      irisSamples: [],
      topHead: null,
      topIris: null,
    };

    autoGainStageRef.current = 'top';
    setAutoGainStage('top');
    setAutoGainProgress(0.05);
    setAutoGainTargetLineIndex(topLine.lineIndex);
    clearHesitationState();

    applyTrackedSelection({
      lineIndex: topLine.lineIndex,
      sentenceIndex: topLine.fragments[0]?.sentenceIndex ?? 0,
      paragraphIndex: topLine.paragraphIndex,
      attentionPoint: { x: 0.5, y: topLineNormY },
    });
  };

  const finalizeAutoGainStageNow = () => {
    const data = autoGainDataRef.current;
    if (!data || autoGainStageRef.current === 'idle') {
      return;
    }

    const headSamples =
      data.headSamples.length > 0
        ? data.headSamples
        : latestHeadSampleRef.current
          ? [latestHeadSampleRef.current]
          : [];
    const irisSamples =
      data.irisSamples.length > 0
        ? data.irisSamples
        : lastValidIrisSampleRef.current
          ? [lastValidIrisSampleRef.current]
          : [];

    if (headSamples.length === 0) {
      return;
    }

    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    if (autoGainStageRef.current === 'top') {
      data.topHead = computeRobustHeadBaseline(headSamples);
      data.topIris = computeRobustIrisBaseline(irisSamples);
      data.headSamples = [];
      data.irisSamples = [];
      data.stageStartedAt = performance.now();

      autoGainStageRef.current = 'bottom';
      setAutoGainStage('bottom');
      setAutoGainProgress(0.05);
      setAutoGainTargetLineIndex(data.bottomLineIndex);

      const bottomLine =
        visualLines.find((line) => line.lineIndex === data.bottomLineIndex) ??
        visualLines[visualLines.length - 1];
      if (bottomLine) {
        applyTrackedSelection({
          lineIndex: bottomLine.lineIndex,
          sentenceIndex: bottomLine.fragments[0]?.sentenceIndex ?? 0,
          paragraphIndex: bottomLine.paragraphIndex,
          attentionPoint: { x: 0.5, y: data.bottomLineNormY },
        });
      }
      return;
    }

    const topHead = data.topHead ?? computeRobustHeadBaseline(headSamples);
    const topIris = data.topIris ?? { x: 0, y: 0 };
    const bottomHead = computeRobustHeadBaseline(headSamples);
    const bottomIris = computeRobustIrisBaseline(irisSamples);

    const screenSpanY = Math.max(0.14, data.bottomLineNormY - data.topLineNormY);
    const scaleFactor = clamp(
      topHead.interOcularDist / Math.max(0.02, bottomHead.interOcularDist),
      0.75,
      1.35
    );
    const deltaUpperY = (bottomHead.upperFaceY - topHead.upperFaceY) * scaleFactor;
    const deltaPitch = bottomHead.pitchRatio - topHead.pitchRatio;
    const observedHeadDeltaY = Math.max(0.01, Math.abs(deltaUpperY * 1.1 + deltaPitch * 0.22));
    const observedIrisDeltaY = Math.max(0.02, Math.abs(bottomIris.y - topIris.y));

    const headShare = clamp(
      observedHeadDeltaY / (observedHeadDeltaY + observedIrisDeltaY * 0.35),
      0.38,
      0.72
    );
    const irisShare = 1 - headShare;

    const idealHeadSensitivity = clamp(
      Math.round(((screenSpanY * headShare) / observedHeadDeltaY) * 20) / 20,
      0.9,
      2.85
    );
    const idealIrisSensitivity = clamp(
      Math.round(((screenSpanY * irisShare) / (observedIrisDeltaY * 1.45)) * 100) / 100,
      0.08,
      0.62
    );
    const idealNeutralHeight = clamp(Math.round(data.topLineNormY * 100) / 100, 0.15, 0.75);

    learnedHeadBaselineRef.current = topHead;
    learnedIrisBaselineRef.current = topIris;
    returnSweepYOffsetRef.current = 0;
    smoothedAttentionPointRef.current = { x: 0.5, y: idealNeutralHeight };

    onSettingsChangeRef.current({
      ...settingsRef.current,
      trackingNeutralLineHeight: idealNeutralHeight,
      headTrackingSensitivity: idealHeadSensitivity,
      irisTrackingSensitivity: idealIrisSensitivity,
    });

    autoGainStageRef.current = 'idle';
    autoGainDataRef.current = null;
    setAutoGainStage('idle');
    setAutoGainProgress(1);

    const topLine =
      visualLines.find((line) => line.lineIndex === data.topLineIndex) ?? visualLines[0];
    if (topLine) {
      applyTrackedSelection({
        lineIndex: topLine.lineIndex,
        sentenceIndex: topLine.fragments[0]?.sentenceIndex ?? 0,
        paragraphIndex: topLine.paragraphIndex,
        attentionPoint: { x: 0.5, y: idealNeutralHeight },
      });
    }

    setRecenterNotice(
      `✓ Auto-Tuned: Eye ${idealIrisSensitivity.toFixed(2)} • Head ${idealHeadSensitivity.toFixed(2)}`
    );
    if (recenterNoticeTimerRef.current) {
      window.clearTimeout(recenterNoticeTimerRef.current);
    }
    recenterNoticeTimerRef.current = window.setTimeout(() => {
      setRecenterNotice(null);
    }, 2600);
  };

  const updateAutoGainCalibration = (
    headSample: HeadPoseSample | null,
    irisSample: IrisSample | null,
    now: number
  ) => {
    const data = autoGainDataRef.current;
    if (!data || autoGainStageRef.current === 'idle') {
      return;
    }

    refreshTrackedOverlayGeometry();

    if (headSample !== null) {
      data.headSamples.push(headSample);
    }
    if (irisSample !== null) {
      data.irisSamples.push(irisSample);
    }

    const elapsed = now - data.stageStartedAt;
    const timeProgress = clamp(elapsed / AUTO_GAIN_STAGE_MS, 0, 1);
    const sampleProgress = clamp(data.headSamples.length / AUTO_GAIN_MIN_SAMPLES, 0, 1);
    setAutoGainProgress(Math.min(timeProgress, sampleProgress));

    if (elapsed >= AUTO_GAIN_STAGE_MS && data.headSamples.length >= AUTO_GAIN_MIN_SAMPLES) {
      finalizeAutoGainStageNow();
    }
  };

  const shiftCalibrationTargetLine = (delta: number) => {
    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );
    if (visualLines.length === 0) {
      return;
    }

    const nextIndex = clamp(calibrationTargetLineIndexRef.current + delta, 0, visualLines.length - 1);
    beginPositionInitialization(nextIndex);
  };

  const handleInput = () => {
    if (!editorRef.current) {
      return;
    }

    isUserTyping.current = true;
    onContentChange(editorRef.current.innerText);
    requestAnimationFrame(() => {
      isUserTyping.current = false;
      refreshTrackedOverlayGeometry();
    });
  };

  const toggleMobileEditing = () => {
    if (!isTouchDevice) {
      return;
    }

    setMobileEditingEnabled((current) => {
      const next = !current;
      if (!next) {
        editorRef.current?.blur();
      } else {
        requestAnimationFrame(() => editorRef.current?.focus());
      }
      return next;
    });
  };

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleHideCard = () => {
    if (isHoverCardPinned) {
      return;
    }

    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      setHoverCard(null);
    }, 140);
  };

  const stopHeadTracking = () => {
    if (trackingFrameRef.current !== null) {
      window.cancelAnimationFrame(trackingFrameRef.current);
      trackingFrameRef.current = null;
    }

    lastTrackingSampleRef.current = 0;
    isTrackingFramePendingRef.current = false;
    pendingLineKeyRef.current = null;
    pendingLineHitsRef.current = 0;
    edgeScrollSteadyHitsRef.current = 0;
    positioningRecentSamplesRef.current = [];
    calibrationStartedAtRef.current = null;
    calibrationHeadSamplesRef.current = [];
    calibrationIrisSamplesRef.current = [];
    learnedHeadBaselineRef.current = null;
    learnedIrisBaselineRef.current = null;
    lastValidIrisSampleRef.current = null;
    smoothedAttentionPointRef.current = null;
    lineMaxProgressXRef.current = 0;
    lineSamplesCountRef.current = 0;
    lineRightHalfSamplesRef.current = 0;
    returnSweepYOffsetRef.current = 0;
    lastReturnSweepAtRef.current = 0;
    if (returnSweepBadgeTimerRef.current) {
      window.clearTimeout(returnSweepBadgeTimerRef.current);
      returnSweepBadgeTimerRef.current = null;
    }
    if (recenterNoticeTimerRef.current) {
      window.clearTimeout(recenterNoticeTimerRef.current);
      recenterNoticeTimerRef.current = null;
    }
    latestHeadSampleRef.current = null;
    previousHeadSampleRef.current = null;
    autoGainStageRef.current = 'idle';
    autoGainDataRef.current = null;
    setAutoGainStage('idle');
    setAutoGainProgress(0);
    setReturnSweepTargetLine(null);
    setRecenterNotice(null);
    clearHesitationState();

    setCalibrationProgress(0);
    setPositioningStability(0);
    setFaceDetectedLive(false);
    setIrisDetectedLive(false);

    faceLandmarkerRef.current?.close();
    faceLandmarkerRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (webcamRef.current) {
      webcamRef.current.pause();
      webcamRef.current.srcObject = null;
    }

    clearTrackedSelection();
  };

  const clearHesitationState = () => {
    hesitationDwellRef.current = null;
    if (hesitationElementRef.current) {
      hesitationElementRef.current.classList.remove('word-hesitation-target');
      hesitationElementRef.current = null;
    }
    if (editorRef.current) {
      editorRef.current.querySelectorAll('.word-hesitation-target').forEach((element) => {
        element.classList.remove('word-hesitation-target');
      });
    }
    setHesitationPrompt(null);
  };

  const openAndPronounceHesitationWord = () => {
    if (!hesitationPrompt) {
      return;
    }

    const element = hesitationElementRef.current;
    if (element && editorRef.current?.contains(element)) {
      clearHideTimer();
      setIsHoverCardPinned(true);
      showHoverCardForWordTarget({
        element,
        word: hesitationPrompt.word,
        rect: element.getBoundingClientRect(),
      });
    }

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const normalized = hesitationPrompt.word.toLowerCase();
      setWordTtsPlayCounts((current) => ({
        ...current,
        [normalized]: (current[normalized] ?? 0) + 1,
      }));
      const utterance = new SpeechSynthesisUtterance(hesitationPrompt.word);
      utterance.rate = hoverPronunciationRate;
      utterance.pitch = 1;
      utterance.volume = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const clearTrackedSelection = () => {
    activeHeadSentenceElementRef.current?.classList.remove('sentence-head-active');
    activeHeadSentenceElementRef.current = null;
    activeGazeWordElementRef.current?.classList.remove('word-gaze-active');
    activeGazeWordElementRef.current = null;
    activeHeadSentenceIndexRef.current = null;
    activeHeadParagraphIndexRef.current = null;
    activeVisualLineIndexRef.current = null;
    onHeadTrackedSentenceChangeRef.current(null);
    clearHesitationState();

    if (editorRef.current) {
      editorRef.current
        .querySelectorAll('.paragraph-head-active, .paragraph-head-muted, .word-gaze-active')
        .forEach((element) => {
          element.classList.remove(
            'paragraph-head-active',
            'paragraph-head-muted',
            'word-gaze-active'
          );
        });
    }

    setTrackedWord(null);
    setFusionConfidence(0);
    setOverlayLineBox(null);
    setOverlayParagraphBox(null);
    setTrackedMetrics(null);
  };

  const syncHeadTrackedDomHighlights = () => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.querySelectorAll('.sentence-head-active').forEach((element) => {
      element.classList.remove('sentence-head-active');
    });

    const sentenceIndex = activeHeadSentenceIndexRef.current;
    if (sentenceIndex !== null) {
      const sentenceElement = editorRef.current.querySelector(
        `[data-sentence-index="${sentenceIndex}"]`
      ) as HTMLElement | null;
      sentenceElement?.classList.add('sentence-head-active');
      activeHeadSentenceElementRef.current = sentenceElement;
    }

    const activeParagraphIndex = activeHeadParagraphIndexRef.current;
    const paragraphElements = editorRef.current.querySelectorAll<HTMLElement>('[data-paragraph-index]');
    paragraphElements.forEach((element) => {
      const elementParagraph = Number(element.dataset.paragraphIndex);
      element.classList.remove('paragraph-head-active', 'paragraph-head-muted');
      if (activeParagraphIndex !== null) {
        if (elementParagraph === activeParagraphIndex) {
          element.classList.add('paragraph-head-active');
        } else if (headTrackingStatusRef.current === 'active') {
          element.classList.add('paragraph-head-muted');
        }
      }
    });

    if (adaptiveEngineEnabled && adaptiveSentenceIndices.length > 0) {
      const highLoadSet = new Set(adaptiveSentenceIndices);
      editorRef.current
        .querySelectorAll<HTMLElement>('[data-sentence-index]')
        .forEach((el) => {
          const idx = Number(el.dataset.sentenceIndex);
          if (highLoadSet.has(idx)) {
            el.classList.add('sentence-adaptive-load');
          } else {
            el.classList.remove('sentence-adaptive-load');
          }
        });
    }
  };

  const refreshTrackedOverlayGeometry = () => {
    if (!editorRef.current || !editorScrollRef.current || !headTrackingEnabled) {
      setOverlayLineBox(null);
      setOverlayParagraphBox(null);
      return;
    }

    const { visualLines, paragraphBoxes } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    if (visualLines.length === 0) {
      setOverlayLineBox(null);
      setOverlayParagraphBox(null);
      setTrackedMetrics(null);
      return;
    }

    const currentLineIndex = activeVisualLineIndexRef.current;
    const activeLine =
      (currentLineIndex !== null
        ? visualLines.find((line) => line.lineIndex === currentLineIndex)
        : null) ?? visualLines[0];

    const scrollContainer = editorScrollRef.current;
    const scrollRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const scrollLeft = scrollContainer.scrollLeft;

    const sentenceIndex =
      activeHeadSentenceIndexRef.current ?? activeLine.fragments[0]?.sentenceIndex ?? 0;
    const paragraphIndex = activeHeadParagraphIndexRef.current ?? activeLine.paragraphIndex;

    const linePaddingX = 10;
    const linePaddingY = 3;
    const lineLeft = Math.max(8, activeLine.left - scrollRect.left + scrollLeft - linePaddingX);
    const lineWidth = Math.min(
      scrollRect.width - lineLeft - 8,
      Math.max(120, activeLine.right - activeLine.left + linePaddingX * 2)
    );
    const lineTop = activeLine.top - scrollRect.top + scrollTop - linePaddingY;
    const lineHeight = activeLine.height + linePaddingY * 2;

    const attentionX = latestAttentionPointRef.current.x;
    const gazeXPercent = clamp(attentionX * 100, 4, 96);

    setOverlayLineBox({
      lineIndex: activeLine.lineIndex,
      paragraphIndex,
      sentenceIndex,
      top: lineTop,
      left: lineLeft,
      width: lineWidth,
      height: lineHeight,
      gazeXPercent,
      isCalibrationTarget:
        headTrackingStatusRef.current === 'positioning' ||
        headTrackingStatusRef.current === 'calibrating' ||
        autoGainStageRef.current !== 'idle',
    });

    const activeParagraphBox = paragraphBoxes.find(
      (box) => box.paragraphIndex === paragraphIndex
    );

    if (activeParagraphBox) {
      const paraPaddingX = 14;
      const paraPaddingY = 7;
      const paraLeft = Math.max(
        6,
        activeParagraphBox.left - scrollRect.left + scrollLeft - paraPaddingX
      );
      const paraWidth = Math.min(
        scrollRect.width - paraLeft - 6,
        Math.max(160, activeParagraphBox.width + paraPaddingX * 2)
      );
      const paraTop = activeParagraphBox.top - scrollRect.top + scrollTop - paraPaddingY;
      const paraHeight = activeParagraphBox.height + paraPaddingY * 2;

      setOverlayParagraphBox({
        paragraphIndex: activeParagraphBox.paragraphIndex,
        top: paraTop,
        left: paraLeft,
        width: paraWidth,
        height: paraHeight,
        lineCount: activeParagraphBox.lineCount,
      });
    } else {
      setOverlayParagraphBox(null);
    }

    setTrackedMetrics({
      lineIndex: activeLine.lineIndex,
      paragraphIndex,
      sentenceIndex,
      totalLines: visualLines.length,
      totalParagraphs: paragraphBoxes.length,
    });
  };

  const applyTrackedSelection = (selection: TrackedSelection) => {
    const isLineChange = activeVisualLineIndexRef.current !== selection.lineIndex;
    const isSentenceChange = activeHeadSentenceIndexRef.current !== selection.sentenceIndex;
    activeVisualLineIndexRef.current = selection.lineIndex;
    activeHeadSentenceIndexRef.current = selection.sentenceIndex;
    activeHeadParagraphIndexRef.current = selection.paragraphIndex;
    latestAttentionPointRef.current = selection.attentionPoint;

    if (selection.trackedWordElement !== undefined) {
      if (
        activeGazeWordElementRef.current &&
        activeGazeWordElementRef.current !== selection.trackedWordElement
      ) {
        activeGazeWordElementRef.current.classList.remove('word-gaze-active');
      }
      selection.trackedWordElement?.classList.add('word-gaze-active');
      activeGazeWordElementRef.current = selection.trackedWordElement ?? null;
    }

    if (selection.trackedWord !== undefined) {
      setTrackedWord(selection.trackedWord);
    }
    if (selection.fusionConfidence !== undefined) {
      setFusionConfidence(selection.fusionConfidence);
    }
    if (selection.fusionSource !== undefined) {
      setFusionSource(selection.fusionSource);
    }

    if (isSentenceChange) {
      onHeadTrackedSentenceChangeRef.current(selection.sentenceIndex);
    }

    if (isLineChange) {
      lineMaxProgressXRef.current = 0;
      lineSamplesCountRef.current = 0;
      lineRightHalfSamplesRef.current = 0;
      clearHesitationState();
    }

    syncHeadTrackedDomHighlights();
    refreshTrackedOverlayGeometry();
  };

  const updateHesitationDetection = (
    lineIndex: number,
    sentenceIndex: number,
    attentionPoint: AttentionPoint,
    now: number
  ) => {
    const dwell = hesitationDwellRef.current;

    if (!dwell || dwell.lineIndex !== lineIndex) {
      if (hesitationElementRef.current) {
        hesitationElementRef.current.classList.remove('word-hesitation-target');
        hesitationElementRef.current = null;
      }
      setHesitationPrompt(null);
      hesitationDwellRef.current = {
        lineIndex,
        anchorX: attentionPoint.x,
        startedAt: now,
        triggeredWord: null,
      };
      return;
    }

    const driftX = Math.abs(attentionPoint.x - dwell.anchorX);
    if (driftX > 0.088) {
      if (driftX > 0.14 && dwell.triggeredWord !== null) {
        if (hesitationElementRef.current) {
          hesitationElementRef.current.classList.remove('word-hesitation-target');
          hesitationElementRef.current = null;
        }
        setHesitationPrompt(null);
      }
      hesitationDwellRef.current = {
        lineIndex,
        anchorX: attentionPoint.x,
        startedAt: now,
        triggeredWord: null,
      };
      return;
    }

    dwell.anchorX = dwell.anchorX * 0.9 + attentionPoint.x * 0.1;

    if (now - dwell.startedAt < HESITATION_DWELL_MS || dwell.triggeredWord !== null) {
      return;
    }

    const match = findHesitationWordOnLine(
      editorRef.current,
      editorScrollRef.current,
      lineIndex,
      dwell.anchorX,
      settingsRef.current.fontSize
    );

    if (!match) {
      dwell.startedAt = now - HESITATION_DWELL_MS * 0.5;
      return;
    }

    dwell.triggeredWord = match.word;
    if (hesitationElementRef.current && hesitationElementRef.current !== match.element) {
      hesitationElementRef.current.classList.remove('word-hesitation-target');
    }
    match.element.classList.add('word-hesitation-target');
    hesitationElementRef.current = match.element;

    const support = analyzeWordSupport(match.word);
    setGazeHesitationEvents((count) => count + 1);
    setHesitationPrompt({
      word: match.word,
      breakdown: support.chunks,
      phoneticHint: support.phoneticHint,
      isDifficult: match.isDifficult,
      lineIndex,
      sentenceIndex: match.sentenceIndex ?? sentenceIndex,
    });
  };

  const runHeadTrackingLoop = () => {
    trackingFrameRef.current = window.requestAnimationFrame(runHeadTrackingLoop);

    const webcam = webcamRef.current;
    const landmarker = faceLandmarkerRef.current;
    if (
      !webcam ||
      !landmarker ||
      webcam.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
      isTrackingFramePendingRef.current
    ) {
      return;
    }

    const now = performance.now();
    if (now - lastTrackingSampleRef.current < HEAD_TRACKING_SAMPLE_MS) {
      return;
    }

    lastTrackingSampleRef.current = now;
    isTrackingFramePendingRef.current = true;

    try {
      const result = landmarker.detectForVideo(webcam, now);
      const landmarks = result?.faceLandmarks?.[0];
      const headSample = extractHeadPoseSample(landmarks);
      const irisSample = extractIrisSample(landmarks);

      if (headSample !== null) {
        previousHeadSampleRef.current = latestHeadSampleRef.current;
        latestHeadSampleRef.current = headSample;
      }
      if (irisSample !== null) {
        lastValidIrisSampleRef.current = irisSample;
      }

      setFaceDetectedLive(headSample !== null);
      setIrisDetectedLive(irisSample !== null);
      drawCameraLandmarkPreview(
        previewCanvasRef.current,
        webcam,
        landmarks,
        headSample,
        irisSample
      );

      if (headTrackingStatusRef.current === 'positioning') {
        updatePositioningState(headSample);
        return;
      }

      if (headTrackingStatusRef.current === 'calibrating') {
        updateCalibrationState(headSample, irisSample ?? lastValidIrisSampleRef.current, now);
        return;
      }

      if (headTrackingStatusRef.current !== 'active') {
        return;
      }

      if (autoGainStageRef.current !== 'idle') {
        updateAutoGainCalibration(
          headSample,
          irisSample ?? lastValidIrisSampleRef.current,
          now
        );
        return;
      }

      const candidateSelection = findTrackedLineAndSentence(
        headSample,
        irisSample ?? lastValidIrisSampleRef.current,
        now
      );

      if (candidateSelection === null) {
        pendingLineKeyRef.current = null;
        pendingLineHitsRef.current = 0;
        return;
      }

      latestAttentionPointRef.current = candidateSelection.attentionPoint;

      if (candidateSelection.isReturnSweepAdvance) {
        applyTrackedSelection(candidateSelection);
        pendingLineKeyRef.current = null;
        pendingLineHitsRef.current = 0;
        setReturnSweepTargetLine(candidateSelection.lineIndex + 1);
        if (returnSweepBadgeTimerRef.current) {
          window.clearTimeout(returnSweepBadgeTimerRef.current);
        }
        returnSweepBadgeTimerRef.current = window.setTimeout(() => {
          setReturnSweepTargetLine(null);
        }, 1600);
        handleGentleEdgeAutoScroll(candidateSelection.attentionPoint);
        return;
      }

      const candidateKey = `${candidateSelection.lineIndex}:${candidateSelection.sentenceIndex}`;
      const currentKey = `${activeVisualLineIndexRef.current}:${activeHeadSentenceIndexRef.current}`;

      if (candidateKey === currentKey) {
        pendingLineKeyRef.current = candidateKey;
        pendingLineHitsRef.current = 0;
        if (candidateSelection.trackedWordElement !== undefined) {
          if (
            activeGazeWordElementRef.current &&
            activeGazeWordElementRef.current !== candidateSelection.trackedWordElement
          ) {
            activeGazeWordElementRef.current.classList.remove('word-gaze-active');
          }
          candidateSelection.trackedWordElement?.classList.add('word-gaze-active');
          activeGazeWordElementRef.current = candidateSelection.trackedWordElement ?? null;
        }
        if (candidateSelection.trackedWord !== undefined) {
          setTrackedWord(candidateSelection.trackedWord);
        }
        if (candidateSelection.fusionConfidence !== undefined) {
          setFusionConfidence(candidateSelection.fusionConfidence);
        }
        if (candidateSelection.fusionSource !== undefined) {
          setFusionSource(candidateSelection.fusionSource);
        }
        refreshTrackedOverlayGeometry();
        updateHesitationDetection(
          candidateSelection.lineIndex,
          candidateSelection.sentenceIndex,
          candidateSelection.attentionPoint,
          now
        );
        handleGentleEdgeAutoScroll(candidateSelection.attentionPoint);
        return;
      }

      if (pendingLineKeyRef.current !== candidateKey) {
        pendingLineKeyRef.current = candidateKey;
        pendingLineHitsRef.current = 1;
        return;
      }

      pendingLineHitsRef.current += 1;
      const requiredHits = Math.max(1, settingsRef.current.trackingSteadiness);

      if (pendingLineHitsRef.current >= requiredHits) {
        applyTrackedSelection(candidateSelection);
        pendingLineKeyRef.current = null;
        pendingLineHitsRef.current = 0;
        handleGentleEdgeAutoScroll(candidateSelection.attentionPoint);
      }
    } catch {
      setHeadTrackingStatus('error');
      setHeadTrackingError('Eye & head tracking stopped because face landmark detection failed.');
      stopHeadTracking();
    } finally {
      isTrackingFramePendingRef.current = false;
    }
  };

  const updatePositioningState = (headSample: HeadPoseSample | null) => {
    refreshTrackedOverlayGeometry();

    if (headSample === null) {
      positioningRecentSamplesRef.current = [];
      setPositioningStability(0);
      return;
    }

    const recent = positioningRecentSamplesRef.current;
    recent.push(headSample);
    if (recent.length > POSITION_AUTO_LOCK_STEADY_SAMPLES) {
      recent.shift();
    }

    if (recent.length < 3) {
      setPositioningStability(0.25);
      return;
    }

    const avgX = recent.reduce((sum, item) => sum + item.upperFaceX, 0) / recent.length;
    const avgY = recent.reduce((sum, item) => sum + item.upperFaceY, 0) / recent.length;
    const maxDeviation = recent.reduce(
      (maxDev, item) =>
        Math.max(maxDev, Math.hypot(item.upperFaceX - avgX, item.upperFaceY - avgY)),
      0
    );

    const isSteady = maxDeviation < 0.014;
    if (!isSteady) {
      positioningRecentSamplesRef.current = [headSample];
      setPositioningStability(0.2);
      return;
    }

    const stabilityProgress = clamp(recent.length / POSITION_AUTO_LOCK_STEADY_SAMPLES, 0, 1);
    setPositioningStability(stabilityProgress);

    if (recent.length >= POSITION_AUTO_LOCK_STEADY_SAMPLES) {
      startCalibrationLockNow();
    }
  };

  const updateCalibrationState = (
    headSample: HeadPoseSample | null,
    irisSample: IrisSample | null,
    now: number
  ) => {
    refreshTrackedOverlayGeometry();

    const startedAt = calibrationStartedAtRef.current ?? now;
    calibrationStartedAtRef.current = startedAt;

    if (headSample !== null) {
      calibrationHeadSamplesRef.current.push(headSample);
    }
    if (irisSample !== null) {
      calibrationIrisSamplesRef.current.push(irisSample);
    }

    const elapsed = now - startedAt;
    const timeProgress = clamp(elapsed / HEAD_TRACKING_CALIBRATION_MS, 0, 1);
    const sampleProgress = clamp(
      calibrationHeadSamplesRef.current.length / HEAD_TRACKING_MIN_CALIBRATION_SAMPLES,
      0,
      1
    );
    const progress = Math.min(timeProgress, sampleProgress);
    setCalibrationProgress(progress);

    if (
      elapsed < HEAD_TRACKING_CALIBRATION_MS ||
      calibrationHeadSamplesRef.current.length < HEAD_TRACKING_MIN_CALIBRATION_SAMPLES
    ) {
      if (elapsed > HEAD_TRACKING_CALIBRATION_MS * 2.2 && calibrationHeadSamplesRef.current.length < 4) {
        calibrationStartedAtRef.current = now;
        calibrationHeadSamplesRef.current = [];
        calibrationIrisSamplesRef.current = [];
        setCalibrationProgress(0);
      }
      return;
    }

    learnedHeadBaselineRef.current = computeRobustHeadBaseline(calibrationHeadSamplesRef.current);
    learnedIrisBaselineRef.current = computeRobustIrisBaseline(calibrationIrisSamplesRef.current);

    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );
    const targetLine =
      visualLines.find((line) => line.lineIndex === calibrationTargetLineIndexRef.current) ??
      visualLines[0] ??
      null;

    let calibratedNeutralHeight = settingsRef.current.trackingNeutralLineHeight;
    if (targetLine && editorScrollRef.current) {
      calibratedNeutralHeight = getNormalizedLineY(
        targetLine,
        editorScrollRef.current,
        settingsRef.current.trackingNeutralLineHeight
      );
      const roundedHeight = Math.round(calibratedNeutralHeight * 100) / 100;
      if (Math.abs(roundedHeight - settingsRef.current.trackingNeutralLineHeight) >= 0.01) {
        onSettingsChangeRef.current({
          ...settingsRef.current,
          trackingNeutralLineHeight: roundedHeight,
        });
      }
    }

    smoothedAttentionPointRef.current = {
      x: 0.5,
      y: calibratedNeutralHeight,
    };

    if (targetLine) {
      applyTrackedSelection({
        lineIndex: targetLine.lineIndex,
        sentenceIndex:
          calibrationTargetSentenceIndexRef.current ??
          targetLine.fragments[0]?.sentenceIndex ??
          0,
        paragraphIndex: targetLine.paragraphIndex,
        attentionPoint: { x: 0.5, y: calibratedNeutralHeight },
      });
    }

    setCalibrationProgress(1);
    setIsPositionInitialized(true);
    setShowSliderStepPanel(true);
    setHeadTrackingStatus('active');
    headTrackingStatusRef.current = 'active';
  };

  const findTrackedLineAndSentence = (
    headSample: HeadPoseSample | null,
    irisSample: IrisSample | null,
    now: number
  ): TrackedSelection | null => {
    if (!headSample || !editorRef.current || !editorScrollRef.current) {
      return null;
    }

    const baseRawPoint = computeCombinedAttentionPoint(
      headSample,
      irisSample,
      learnedHeadBaselineRef.current,
      learnedIrisBaselineRef.current,
      settingsRef.current
    );

    const prevRawDeltaY = smoothedAttentionPointRef.current
      ? Math.abs(baseRawPoint.y + returnSweepYOffsetRef.current - smoothedAttentionPointRef.current.y)
      : 0;
    if (prevRawDeltaY > 0.045) {
      returnSweepYOffsetRef.current *= 0.88;
    } else {
      returnSweepYOffsetRef.current *= 0.985;
    }

    const gazeAttentionPoint: AttentionPoint = {
      x: baseRawPoint.x,
      y: clamp(
        baseRawPoint.y + returnSweepYOffsetRef.current,
        HEAD_TRACKING_MIN_Y,
        HEAD_TRACKING_MAX_Y
      ),
    };

    const caretAnchor = caretAnchorRef.current;
    const caretElapsedMs = caretAnchor ? now - caretAnchor.lastMovedAt : Number.POSITIVE_INFINITY;
    const isCaretRecent =
      caretAnchor !== null &&
      caretElapsedMs < 14000 &&
      Math.abs(gazeAttentionPoint.y - caretAnchor.normY) < 0.28;
    const caretWeight = isCaretRecent
      ? clamp(0.1 + 0.32 * Math.exp(-caretElapsedMs / 6000), 0.1, 0.42)
      : 0;

    const rawAttentionPoint: AttentionPoint =
      isCaretRecent && caretAnchor
        ? {
            x: clamp(
              gazeAttentionPoint.x * (1 - caretWeight * 0.65) +
                caretAnchor.normX * (caretWeight * 0.65),
              0.04,
              0.96
            ),
            y: clamp(
              gazeAttentionPoint.y * (1 - caretWeight) + caretAnchor.normY * caretWeight,
              HEAD_TRACKING_MIN_Y,
              HEAD_TRACKING_MAX_Y
            ),
          }
        : gazeAttentionPoint;

    const smoothedPoint = smoothAttentionPoint(
      rawAttentionPoint,
      smoothedAttentionPointRef.current
    );
    smoothedAttentionPointRef.current = smoothedPoint;

    const { visualLines } = collectVisibleGeometry(
      editorRef.current,
      editorScrollRef.current,
      settingsRef.current.fontSize
    );

    if (visualLines.length === 0) {
      return null;
    }

    const scrollRect = editorScrollRef.current.getBoundingClientRect();
    const targetY = scrollRect.top + smoothedPoint.y * scrollRect.height;
    const targetX = scrollRect.left + smoothedPoint.x * scrollRect.width;

    const currentLineIndex = activeVisualLineIndexRef.current;
    const currentLine =
      currentLineIndex !== null
        ? visualLines.find((line) => line.lineIndex === currentLineIndex) ?? null
        : null;

    if (currentLine) {
      const lineWidth = Math.max(80, currentLine.right - currentLine.left);
      const currentLineProgressX = clamp((targetX - currentLine.left) / lineWidth, 0, 1);
      const nextLine = visualLines.find((line) => line.lineIndex === currentLine.lineIndex + 1);

      const canTriggerReturnSweep =
        nextLine !== undefined &&
        now - lastReturnSweepAtRef.current > RETURN_SWEEP_COOLDOWN_MS &&
        lineSamplesCountRef.current >= 3 &&
        lineRightHalfSamplesRef.current >= 2 &&
        lineMaxProgressXRef.current >= 0.56 &&
        lineMaxProgressXRef.current - currentLineProgressX >= 0.26 &&
        currentLineProgressX <= 0.44 &&
        targetY >= currentLine.top - currentLine.height * 0.35 &&
        targetY <= nextLine.bottom + nextLine.height * 0.85;

      if (canTriggerReturnSweep && nextLine) {
        lastReturnSweepAtRef.current = now;
        const nextLineNormY = getNormalizedLineY(
          nextLine,
          editorScrollRef.current,
          smoothedPoint.y
        );
        returnSweepYOffsetRef.current = clamp(
          nextLineNormY - baseRawPoint.y,
          -0.35,
          0.35
        );
        const anchoredPoint: AttentionPoint = {
          x: smoothedPoint.x,
          y: nextLineNormY,
        };
        smoothedAttentionPointRef.current = anchoredPoint;

        return {
          lineIndex: nextLine.lineIndex,
          sentenceIndex: nextLine.fragments[0]?.sentenceIndex ?? 0,
          paragraphIndex: nextLine.paragraphIndex,
          attentionPoint: anchoredPoint,
          isReturnSweepAdvance: true,
        };
      }

      lineSamplesCountRef.current += 1;
      lineMaxProgressXRef.current = Math.max(
        lineMaxProgressXRef.current,
        currentLineProgressX
      );
      if (currentLineProgressX >= 0.48) {
        lineRightHalfSamplesRef.current += 1;
      }

      const prevHead = previousHeadSampleRef.current;
      const headBaseline = learnedHeadBaselineRef.current;
      if (
        prevHead &&
        headBaseline &&
        lineSamplesCountRef.current >= 4 &&
        pendingLineHitsRef.current === 0
      ) {
        const frameHeadStep = Math.hypot(
          headSample.upperFaceX - prevHead.upperFaceX,
          headSample.upperFaceY - prevHead.upperFaceY
        );
        if (frameHeadStep < 0.0032) {
          const lineNormY = getNormalizedLineY(
            currentLine,
            editorScrollRef.current,
            settingsRef.current.trackingNeutralLineHeight
          );
          const expectedHeadDeltaY =
            (lineNormY - settingsRef.current.trackingNeutralLineHeight) /
            Math.max(0.8, settingsRef.current.headTrackingSensitivity * 1.1);
          const targetBaseY = clamp(headSample.upperFaceY - expectedHeadDeltaY, 0.1, 0.9);

          headBaseline.upperFaceX += (headSample.upperFaceX - headBaseline.upperFaceX) * 0.004;
          headBaseline.yawRatio += (headSample.yawRatio - headBaseline.yawRatio) * 0.004;
          headBaseline.upperFaceY += (targetBaseY - headBaseline.upperFaceY) * 0.0028;
        }
      }
    }

    let selectedLine: VisualLine | null = null;

    if (currentLine) {
      const stickyMargin = Math.max(6, currentLine.height * 0.24);
      if (
        targetY >= currentLine.top - stickyMargin &&
        targetY <= currentLine.bottom + stickyMargin
      ) {
        selectedLine = currentLine;
      }
    }

    if (!selectedLine) {
      let bestLine = visualLines[0];
      let bestScore = Number.POSITIVE_INFINITY;

      for (const line of visualLines) {
        const verticalDistance =
          targetY < line.top
            ? line.top - targetY
            : targetY > line.bottom
              ? targetY - line.bottom
              : Math.abs(targetY - line.centerY) * 0.35;

        let sequentialBias = 0;
        if (currentLine) {
          const lineStep = line.lineIndex - currentLine.lineIndex;
          if (lineStep === 1) {
            sequentialBias = -line.height * 0.1;
          } else if (Math.abs(lineStep) > 3) {
            sequentialBias = line.height * 0.08;
          }
        }

        const caretLineBonus =
          isCaretRecent &&
          caretAnchor?.sentenceIndex !== null &&
          line.fragments.some((fragment) => fragment.sentenceIndex === caretAnchor.sentenceIndex)
            ? -line.height * 0.22
            : 0;

        const score = verticalDistance + sequentialBias + caretLineBonus;
        if (score < bestScore) {
          bestScore = score;
          bestLine = line;
        }
      }

      selectedLine = bestLine;
    }

    let selectedSentenceIndex = selectedLine.fragments[0]?.sentenceIndex ?? 0;
    let bestHorizontalDistance = Number.POSITIVE_INFINITY;

    for (const fragment of selectedLine.fragments) {
      const horizontalDistance =
        targetX < fragment.left
          ? fragment.left - targetX
          : targetX > fragment.right
            ? targetX - fragment.right
            : 0;

      const activeBonus =
        fragment.sentenceIndex === activeHeadSentenceIndexRef.current ? -12 : 0;
      const caretSentenceBonus =
        isCaretRecent && fragment.sentenceIndex === caretAnchor?.sentenceIndex ? -18 : 0;

      if (horizontalDistance + activeBonus + caretSentenceBonus < bestHorizontalDistance) {
        bestHorizontalDistance = horizontalDistance + activeBonus + caretSentenceBonus;
        selectedSentenceIndex = fragment.sentenceIndex;
      }
    }

    const wordMatch = findTrackedWordOnLine(
      editorRef.current,
      selectedLine,
      targetX,
      isCaretRecent ? (caretAnchor?.wordElement ?? null) : null
    );

    const caretAgreesWithLine =
      isCaretRecent &&
      caretAnchor?.sentenceIndex !== null &&
      selectedLine.fragments.some((f) => f.sentenceIndex === caretAnchor.sentenceIndex);

    const baseConfidence = irisSample ? 78 : 58;
    const lineProximityConfidence = clamp(
      12 - Math.round((Math.abs(targetY - selectedLine.centerY) / Math.max(16, selectedLine.height)) * 8),
      0,
      12
    );
    const caretFusionBonus = caretAgreesWithLine ? 9 : isCaretRecent ? 4 : 0;
    const computedConfidence = clamp(
      baseConfidence + lineProximityConfidence + caretFusionBonus,
      45,
      99
    );
    const computedSource: TrackedSelection['fusionSource'] = caretAgreesWithLine
      ? 'Gaze + Caret'
      : irisSample
        ? 'Gaze (Iris + Head)'
        : 'Gaze (Head)';

    return {
      lineIndex: selectedLine.lineIndex,
      sentenceIndex: wordMatch?.sentenceIndex ?? selectedSentenceIndex,
      paragraphIndex: selectedLine.paragraphIndex,
      attentionPoint: smoothedPoint,
      trackedWord: wordMatch?.word ?? null,
      trackedWordElement: wordMatch?.element ?? null,
      fusionConfidence: computedConfidence,
      fusionSource: computedSource,
    };
  };

  const handleGentleEdgeAutoScroll = (attentionPoint: AttentionPoint) => {
    const scrollContainer = editorScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const isNearBottom = attentionPoint.y > 0.85;
    const isNearTop = attentionPoint.y < 0.13 && scrollContainer.scrollTop > 12;

    if (!isNearBottom && !isNearTop) {
      edgeScrollSteadyHitsRef.current = 0;
      return;
    }

    edgeScrollSteadyHitsRef.current += 1;
    if (edgeScrollSteadyHitsRef.current < 7) {
      return;
    }

    edgeScrollSteadyHitsRef.current = 0;
    const stepPx = Math.max(36, settingsRef.current.fontSize * settingsRef.current.lineSpacing * 1.25);
    scrollContainer.scrollBy({
      top: isNearBottom ? stepPx : -stepPx,
      behavior: 'smooth',
    });
  };

  const showHoverCardForWordTarget = (wordTarget: WordTarget) => {
    if (!containerRef.current) {
      return;
    }

    clearHideTimer();
    const containerRect = containerRef.current.getBoundingClientRect();
    const cardWidth = Math.min(320, Math.max(252, containerRect.width - 32));
    const wordSupport = analyzeWordSupport(wordTarget.word);
    const left = Math.min(
      Math.max(wordTarget.rect.left - containerRect.left, 16),
      Math.max(16, containerRect.width - cardWidth - 16)
    );
    const estimatedCardHeight = 280;
    const preferredTop = wordTarget.rect.bottom - containerRect.top + 12;
    const top =
      preferredTop + estimatedCardHeight > containerRect.height - 16
        ? Math.max(16, wordTarget.rect.top - containerRect.top - estimatedCardHeight - 12)
        : preferredTop;

    setHoverCard({
      word: wordTarget.word,
      breakdown: wordSupport.chunks,
      phoneticHint: wordSupport.phoneticHint,
      morphology: wordSupport.morphology,
      top,
      left,
      width: cardWidth,
    });
  };

  const handleEditorMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (isHoverCardPinned) {
      return;
    }

    const hoveredWord = getWordTargetAtPoint(event.clientX, event.clientY, editorRef.current);
    if (!hoveredWord) {
      scheduleHideCard();
      return;
    }

    showHoverCardForWordTarget(hoveredWord);
  };

  const handleEditorClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    const clickedSentenceElement = target.closest('[data-sentence-index]') as HTMLElement | null;

    if (
      headTrackingEnabled &&
      (headTrackingStatus === 'positioning' || headTrackingStatus === 'calibrating') &&
      clickedSentenceElement
    ) {
      const clickedSentenceIndex = Number(clickedSentenceElement.dataset.sentenceIndex);
      if (Number.isFinite(clickedSentenceIndex)) {
        beginPositionInitialization(undefined, clickedSentenceIndex);
        return;
      }
    }

    const clickedWord = getWordTargetAtPoint(event.clientX, event.clientY, editorRef.current);
    if (clickedWord) {
      clearHideTimer();
      setIsHoverCardPinned(true);
      showHoverCardForWordTarget(clickedWord);
      return;
    }

    setIsHoverCardPinned(false);

    if (!showSentenceSimplification || !clickedSentenceElement) {
      return;
    }

    const sentenceIndex = Number(clickedSentenceElement.dataset.sentenceIndex);
    const clauseCount = Number(clickedSentenceElement.dataset.clauseCount ?? '0');
    const isComplex = clickedSentenceElement.dataset.isComplex === 'true';

    if (!Number.isFinite(sentenceIndex) || !isComplex || clauseCount <= 1) {
      return;
    }

    setClauseFocusBySentence((current) => ({
      ...current,
      [sentenceIndex]: ((current[sentenceIndex] ?? 0) + 1) % clauseCount,
    }));
  };

  const pronounceHoveredWord = () => {
    if (!hoverCard) {
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }

    window.speechSynthesis.cancel();
    const normalized = hoverCard.word.toLowerCase();
    setWordTtsPlayCounts((current) => ({
      ...current,
      [normalized]: (current[normalized] ?? 0) + 1,
    }));

    const utterance = new SpeechSynthesisUtterance(hoverCard.word);
    utterance.rate = hoverPronunciationRate;
    utterance.pitch = 1;
    utterance.volume = 1;

    window.speechSynthesis.speak(utterance);
  };

  const speakSelectedPhrase = () => {
    if (!selectedPhrase) {
      return;
    }

    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in your browser.');
      return;
    }

    if (isSpeakingSelection) {
      window.speechSynthesis.cancel();
      setIsSpeakingSelection(false);
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeakingSelection(true);

    const utterance = new SpeechSynthesisUtterance(selectedPhrase.text);
    utterance.rate = hoverPronunciationRate;
    utterance.pitch = 1;
    utterance.volume = 1;
    utterance.onend = () => setIsSpeakingSelection(false);
    utterance.onerror = () => setIsSpeakingSelection(false);

    window.speechSynthesis.speak(utterance);
  };

  const handleEditorScroll = () => {
    scheduleHideCard();
    refreshTrackedOverlayGeometry();

    const scrollContainer = editorScrollRef.current;
    if (!scrollContainer) {
      return;
    }

    const now = performance.now();
    const currentTop = scrollContainer.scrollTop;
    const delta = currentTop - lastScrollTopRef.current;
    lastScrollTopRef.current = currentTop;
    lastScrollMoveAtRef.current = now;
    hasScrolledSincePauseCountedRef.current = true;
    setScrollPauseMs(0);

    if (delta < -22 && now - lastRegressionCountedAtRef.current > 900) {
      lastRegressionCountedAtRef.current = now;
      setScrollRegressionCount((count) => count + 1);
    }
  };

  useEffect(() => {
    const updateCaretFromSelection = () => {
      const editor = editorRef.current;
      const scrollContainer = editorScrollRef.current;
      if (!editor || !scrollContainer) {
        return;
      }

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }

      const anchorNode = selection.anchorNode;
      if (!anchorNode || !editor.contains(anchorNode)) {
        return;
      }

      const anchorElement =
        anchorNode instanceof HTMLElement ? anchorNode : anchorNode.parentElement;
      if (!anchorElement) {
        return;
      }

      const wordElement = anchorElement.closest('[data-word="true"]') as HTMLElement | null;
      const sentenceElement = anchorElement.closest('[data-sentence-index]') as HTMLElement | null;
      const paragraphElement = anchorElement.closest('[data-paragraph-index]') as HTMLElement | null;

      const word = wordElement ? normalizeWord(wordElement.innerText) : null;
      const sentenceIndex = sentenceElement ? Number(sentenceElement.dataset.sentenceIndex) : null;
      const paragraphIndex = paragraphElement
        ? Number(paragraphElement.dataset.paragraphIndex)
        : null;

      const range = selection.getRangeAt(0);
      const selectedRaw = selection.toString().trim();
      if (!selection.isCollapsed && selectedRaw.length > 1 && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const rect = range.getBoundingClientRect();
        setSelectedPhrase({
          text: selectedRaw.slice(0, 260),
          top: Math.max(12, rect.top - containerRect.top - 42),
          left: clamp(rect.left - containerRect.left, 16, Math.max(16, containerRect.width - 190)),
        });
      } else {
        setSelectedPhrase(null);
        setIsSpeakingSelection(false);
      }

      const rangeRect =
        range.getBoundingClientRect().width > 0 || range.getBoundingClientRect().height > 0
          ? range.getBoundingClientRect()
          : (wordElement?.getBoundingClientRect() ?? sentenceElement?.getBoundingClientRect() ?? null);
      const scrollRect = scrollContainer.getBoundingClientRect();

      const normX =
        rangeRect && scrollRect.width > 40
          ? clamp((rangeRect.left - scrollRect.left) / scrollRect.width, 0.04, 0.96)
          : 0.5;
      const normY =
        rangeRect && scrollRect.height > 40
          ? clamp(((rangeRect.top + rangeRect.bottom) / 2 - scrollRect.top) / scrollRect.height, 0.08, 0.92)
          : settingsRef.current.trackingNeutralLineHeight;

      const now = performance.now();
      const prev = caretAnchorRef.current;
      const isSameAnchor =
        prev !== null &&
        prev.word === word &&
        prev.sentenceIndex === (Number.isFinite(sentenceIndex) ? sentenceIndex : null);

      if (activeCaretWordElementRef.current && activeCaretWordElementRef.current !== wordElement) {
        activeCaretWordElementRef.current.classList.remove('word-caret-dwell');
      }
      activeCaretWordElementRef.current = wordElement;

      if (isSameAnchor && prev) {
        prev.normX = normX;
        prev.normY = normY;
        prev.lastMovedAt = now;
        prev.wordElement = wordElement;
      } else {
        caretAnchorRef.current = {
          word,
          wordElement,
          sentenceIndex: Number.isFinite(sentenceIndex) ? sentenceIndex : null,
          paragraphIndex: Number.isFinite(paragraphIndex) ? paragraphIndex : null,
          normX,
          normY,
          startedAt: now,
          lastMovedAt: now,
          triggeredSupportForWord: null,
        };
        setCaretWord(word);
        setCaretSentenceIndex(Number.isFinite(sentenceIndex) ? sentenceIndex : null);
        setCaretDwellMs(0);
      }
    };

    document.addEventListener('selectionchange', updateCaretFromSelection);
    window.addEventListener('keyup', updateCaretFromSelection);
    window.addEventListener('mouseup', updateCaretFromSelection);

    const ticker = window.setInterval(() => {
      const now = performance.now();

      const pauseElapsed = now - lastScrollMoveAtRef.current;
      setScrollPauseMs(pauseElapsed);
      if (hasScrolledSincePauseCountedRef.current && pauseElapsed >= 2200) {
        hasScrolledSincePauseCountedRef.current = false;
        setScrollPauseCount((count) => count + 1);
      }

      const caret = caretAnchorRef.current;
      if (!caret || (!caret.word && caret.sentenceIndex === null)) {
        return;
      }

      const dwellElapsed = now - caret.startedAt;
      setCaretDwellMs(dwellElapsed);

      if (dwellElapsed >= 900 && caret.wordElement) {
        caret.wordElement.classList.add('word-caret-dwell');
      }

      if (
        dwellElapsed >= 2600 &&
        caret.word &&
        caret.word.length >= 5 &&
        caret.triggeredSupportForWord !== caret.word
      ) {
        const difficulty = analyzeWordDifficulty(caret.word);
        if (difficulty.isDifficult || caret.word.length >= 7) {
          caret.triggeredSupportForWord = caret.word;
          setCaretFrictionEvents((count) => count + 1);

          if (caret.wordElement) {
            if (
              hesitationElementRef.current &&
              hesitationElementRef.current !== caret.wordElement
            ) {
              hesitationElementRef.current.classList.remove('word-hesitation-target');
            }
            caret.wordElement.classList.add('word-hesitation-target');
            hesitationElementRef.current = caret.wordElement;
          }

          const support = analyzeWordSupport(caret.word);
          setHesitationPrompt({
            word: caret.word,
            breakdown: support.chunks,
            phoneticHint: support.phoneticHint,
            isDifficult: difficulty.isDifficult,
            lineIndex: activeVisualLineIndexRef.current ?? 0,
            sentenceIndex: caret.sentenceIndex ?? 0,
          });
        }
      }
    }, 250);

    return () => {
      document.removeEventListener('selectionchange', updateCaretFromSelection);
      window.removeEventListener('keyup', updateCaretFromSelection);
      window.removeEventListener('mouseup', updateCaretFromSelection);
      window.clearInterval(ticker);
    };
  }, []);

  useEffect(() => {
    if (!headTrackingEnabled) {
      return;
    }

    const handleRecenterKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.code === 'KeyC') {
        event.preventDefault();
        instantRecenterOnCurrentLine();
      }
    };

    window.addEventListener('keydown', handleRecenterKeyDown);
    return () => window.removeEventListener('keydown', handleRecenterKeyDown);
  }, [headTrackingEnabled]);

  useEffect(() => {
    if (!hesitationPrompt) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space') {
        return;
      }

      const activeElement = document.activeElement;
      const isEditingText =
        activeElement === editorRef.current ||
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement;

      if (isEditingText && !event.altKey) {
        return;
      }

      event.preventDefault();
      openAndPronounceHesitationWord();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hesitationPrompt, hoverPronunciationRate]);

  const showHeadTrackingStatus = headTrackingEnabled || headTrackingStatus === 'error';
  const calibrationSecondsRemaining = Math.max(
    1,
    Math.ceil((1 - calibrationProgress) * (HEAD_TRACKING_CALIBRATION_MS / 1000))
  );
  const isEditorEditable = !isTouchDevice || mobileEditingEnabled;
  const isInitializingPosition =
    headTrackingStatus === 'positioning' || headTrackingStatus === 'calibrating';

  const sentenceReplayEntries = Object.entries(sentenceTtsPlayCounts).filter(
    ([, count]) => count >= 2
  );
  const wordReplayEntries = Object.entries(wordTtsPlayCounts).filter(
    ([, count]) => count >= 2
  );
  const totalTtsReplays =
    sentenceReplayEntries.reduce((sum, [, count]) => sum + (count - 1), 0) +
    wordReplayEntries.reduce((sum, [, count]) => sum + (count - 1), 0);

  const topWordReplay = [...wordReplayEntries].sort((a, b) => b[1] - a[1])[0];
  const topSentenceReplay = [...sentenceReplayEntries].sort((a, b) => b[1] - a[1])[0];
  const topReplayedLabel = topWordReplay
    ? `"${topWordReplay[0]}" (×${topWordReplay[1]})`
    : topSentenceReplay
      ? `Sentence ${Number(topSentenceReplay[0]) + 1} (×${topSentenceReplay[1]})`
      : null;

  const cognitiveFrictionScore = clamp(
    Math.min(28, Math.floor(caretDwellMs / 350)) +
      caretFrictionEvents * 12 +
      gazeHesitationEvents * 12 +
      Math.min(24, scrollRegressionCount * 9 + scrollPauseCount * 3) +
      Math.min(36, totalTtsReplays * 12),
    0,
    100
  );
  const cognitiveFrictionLevel: 'Low' | 'Moderate' | 'High' =
    cognitiveFrictionScore >= 55
      ? 'High'
      : cognitiveFrictionScore >= 25
        ? 'Moderate'
        : 'Low';

  return (
    <div
      ref={containerRef}
      className={`relative flex-1 overflow-hidden ${readingMode ? 'bg-stone-100' : 'bg-stone-100/70'} min-h-[calc(100vh-4.5rem)] lg:h-full lg:min-h-0`}
      onMouseLeave={scheduleHideCard}
    >
      <video ref={webcamRef} className="hidden" autoPlay muted playsInline />

      {pdfFallbackMessage && (
        <div className="absolute left-3 right-3 top-3 z-40 mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-950 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="font-bold text-amber-950">
                  Flattened / Image-Only PDF Detected (No Selectable Text Layer)
                </p>
                <p className="mt-1 leading-5 text-amber-900">{pdfFallbackMessage}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onContentChange(SAMPLE_PASSAGE);
                      onDismissPdfFallback();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
                  >
                    <FileText size={13} />
                    Load Sample Passage Instead
                  </button>
                  <button
                    type="button"
                    onClick={onDismissPdfFallback}
                    className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 ring-1 ring-amber-300 hover:bg-amber-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onDismissPdfFallback}
              className="rounded-full p-1 text-amber-800 hover:bg-amber-100"
              aria-label="Close fallback notice"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {selectedPhrase && (
        <div
          className="absolute z-30 flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-950 px-3 py-1.5 text-xs font-semibold text-white shadow-xl"
          style={{ top: selectedPhrase.top, left: selectedPhrase.left }}
        >
          <button
            type="button"
            onClick={speakSelectedPhrase}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-indigo-200"
          >
            <Volume2 size={13} className="text-emerald-400" />
            {isSpeakingSelection ? 'Stop Selection Audio' : 'Speak Selection'}
          </button>
        </div>
      )}

      {showReadingGuide && (
        <div
          ref={guideRef}
          className="pointer-events-none absolute left-0 right-0 z-[15] h-10"
          style={{
            backgroundColor: 'rgba(100, 149, 237, 0.22)',
            borderTop: '2px solid rgba(59, 130, 246, 0.72)',
            borderBottom: '2px solid rgba(59, 130, 246, 0.72)',
          }}
        />
      )}

      {focusMode && (() => {
        const activeTunnelCenter = headTrackingEnabled
          ? clamp(latestAttentionPointRef.current.y * 100, 16, 84)
          : tunnelCenterPercent;
        const tunnelHalfWindowPct = 11;
        const topMaskHeightPct = clamp(activeTunnelCenter - tunnelHalfWindowPct, 8, 76);
        const bottomMaskHeightPct = clamp(100 - (activeTunnelCenter + tunnelHalfWindowPct), 8, 76);

        return (
          <>
            <div
              aria-hidden="true"
              className="pointer-events-none absolute left-0 right-0 top-0 z-[15] backdrop-blur-[1.2px] transition-[height] duration-100 ease-out"
              style={{
                height: `${topMaskHeightPct}%`,
                background: `linear-gradient(to bottom, ${settings.backgroundColor} 15%, rgba(28, 25, 23, 0.34) 92%, rgba(28, 25, 23, 0.14) 100%)`,
                borderBottom: '1.5px solid rgba(120, 113, 108, 0.38)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 left-0 right-0 z-[15] backdrop-blur-[1.2px] transition-[height] duration-100 ease-out"
              style={{
                height: `${bottomMaskHeightPct}%`,
                background: `linear-gradient(to top, ${settings.backgroundColor} 15%, rgba(28, 25, 23, 0.34) 92%, rgba(28, 25, 23, 0.14) 100%)`,
                borderTop: '1.5px solid rgba(120, 113, 108, 0.38)',
              }}
            />
          </>
        );
      })()}

      {showHeadTrackingStatus && (
        <div
          className={`absolute z-30 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm shadow-xl ${
            readingMode
              ? 'left-3 right-3 top-24 sm:left-auto sm:right-4 sm:top-24 sm:w-[24rem]'
              : 'left-3 right-3 top-3 sm:left-auto sm:right-4 sm:top-4 sm:w-[24rem]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  headTrackingStatus === 'error'
                    ? 'bg-rose-500'
                    : faceDetectedLive && irisDetectedLive
                      ? 'bg-emerald-500'
                      : faceDetectedLive
                        ? 'bg-amber-500'
                        : 'bg-stone-300'
                }`}
              />
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Eye & Head Tracking
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              {(headTrackingStatus === 'positioning' ||
                headTrackingStatus === 'calibrating' ||
                headTrackingStatus === 'active') && (
                <button
                  type="button"
                  onClick={() => setShowCameraPreview((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    showCameraPreview
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                  title="Toggle live eye & iris landmark camera preview"
                >
                  <Camera size={12} />
                  Eye Cam
                </button>
              )}
              {headTrackingStatus === 'active' && (
                <>
                  <button
                    type="button"
                    onClick={instantRecenterOnCurrentLine}
                    disabled={!faceDetectedLive}
                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-800 ring-1 ring-indigo-200 transition-colors hover:bg-indigo-100 disabled:opacity-45"
                    title="Instant-recenter posture on current line (Alt+C)"
                  >
                    <Crosshair size={12} />
                    Recenter
                  </button>
                  <button
                    type="button"
                    onClick={() => beginPositionInitialization()}
                    className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-200"
                    title="Step 1: Re-initialize reading position"
                  >
                    <RotateCcw size={12} />
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowSliderStepPanel((prev) => !prev)}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                      showSliderStepPanel
                        ? 'bg-violet-600 text-white'
                        : 'bg-violet-100 text-violet-900 hover:bg-violet-200'
                    }`}
                    title="Step 2: Fine-tune tracking sliders"
                  >
                    <SlidersHorizontal size={12} />
                    Sliders
                  </button>
                </>
              )}
            </div>
          </div>

          {showCameraPreview &&
            (headTrackingStatus === 'positioning' ||
              headTrackingStatus === 'calibrating' ||
              headTrackingStatus === 'active') && (
              <div className="mt-2.5 overflow-hidden rounded-xl border border-stone-200 bg-slate-950 shadow-inner">
                <div className="relative flex items-center justify-center">
                  <canvas
                    ref={previewCanvasRef}
                    width={280}
                    height={146}
                    className="h-[8.25rem] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute bottom-1.5 left-2 right-2 flex items-center justify-between gap-1 text-[10px] font-semibold">
                    <span
                      className={`rounded-md bg-slate-900/85 px-1.5 py-0.5 backdrop-blur-sm ${
                        faceDetectedLive && irisDetectedLive
                          ? 'text-emerald-300'
                          : faceDetectedLive
                            ? 'text-amber-300'
                            : 'text-rose-300'
                      }`}
                    >
                      {faceDetectedLive
                        ? irisDetectedLive
                          ? '● Iris + Eye Landmarks Locked'
                          : '● Head Only — Check Light / Glare'
                        : '○ Center Face in Camera'}
                    </span>
                    <span className="rounded-md bg-slate-900/85 px-1.5 py-0.5 text-slate-300 backdrop-blur-sm">
                      Mirrored Local View
                    </span>
                  </div>
                </div>
              </div>
            )}

          {headTrackingStatus === 'starting' && (
            <p className="mt-2 text-sm font-medium text-slate-900">
              Starting camera and preparing eye + head landmark model...
            </p>
          )}

          {headTrackingStatus === 'error' && (
            <p className="mt-2 text-sm font-medium text-rose-700">
              {headTrackingError ?? 'Eye & head tracking is unavailable right now.'}
            </p>
          )}

          {isInitializingPosition && (
            <div className="mt-2.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-900">
                  <Crosshair size={12} />
                  Step 1 of 2: Initialize Reading Position
                </span>
                <span className="text-xs font-medium text-slate-600">
                  {faceDetectedLive
                    ? irisDetectedLive
                      ? 'Eyes + Head detected ✓'
                      : 'Head detected ✓'
                    : 'Looking for face...'}
                </span>
              </div>

              <p className="text-xs leading-5 text-slate-700">
                {content.trim()
                  ? 'Click any line below to set where you want to start reading, or look directly at the highlighted target line and hold steady.'
                  : 'Add text or load the sample passage below so we can lock your starting reading line first.'}
              </p>

              {!content.trim() ? (
                <button
                  type="button"
                  onClick={() => onContentChange(SAMPLE_PASSAGE)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
                >
                  <FileText size={14} />
                  Load Sample Passage to Initialize
                </button>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-stone-100 px-3 py-2 text-xs">
                    <span className="font-semibold text-stone-800">
                      Target: Line {(overlayLineBox?.lineIndex ?? 0) + 1} • Paragraph{' '}
                      {(overlayLineBox?.paragraphIndex ?? 0) + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => shiftCalibrationTargetLine(-1)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-stone-700 shadow-sm hover:bg-stone-50"
                        title="Move target to previous line"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => shiftCalibrationTargetLine(1)}
                        className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-white text-stone-700 shadow-sm hover:bg-stone-50"
                        title="Move target to next line"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className={`h-full rounded-full transition-[width] duration-150 ${
                          headTrackingStatus === 'calibrating' ? 'bg-violet-600' : 'bg-amber-500'
                        }`}
                        style={{
                          width: `${Math.max(
                            8,
                            (headTrackingStatus === 'calibrating'
                              ? calibrationProgress
                              : positioningStability * 0.45) * 100
                          )}%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-slate-700">
                        {headTrackingStatus === 'calibrating'
                          ? `Locking gaze & posture (${calibrationSecondsRemaining}s)...`
                          : faceDetectedLive
                            ? 'Look at the target line to auto-lock, or click Lock Now.'
                            : 'Center your face in the camera view.'}
                      </p>
                      {headTrackingStatus === 'positioning' && (
                        <button
                          type="button"
                          onClick={startCalibrationLockNow}
                          disabled={!faceDetectedLive}
                          className="shrink-0 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:opacity-45"
                        >
                          Lock Now
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {headTrackingStatus === 'active' && (
            <div className="mt-2 space-y-2.5">
              {trackedMetrics ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-900">
                      Paragraph {trackedMetrics.paragraphIndex + 1} of{' '}
                      {Math.max(1, trackedMetrics.totalParagraphs)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-900">
                      Line {trackedMetrics.lineIndex + 1} of {Math.max(1, trackedMetrics.totalLines)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                      Sentence {trackedMetrics.sentenceIndex + 1}
                    </span>
                    {trackedWord && (
                      <span className="inline-flex items-center rounded-full bg-violet-600 px-2.5 py-0.5 text-xs font-semibold text-white">
                        Word: &ldquo;{trackedWord}&rdquo;
                      </span>
                    )}
                    {fusionConfidence > 0 && (
                      <span
                        className="inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-semibold text-sky-900"
                        title="Combined webcam gaze and DOM caret confidence"
                      >
                        {fusionConfidence}% • {fusionSource}
                      </span>
                    )}
                    {returnSweepTargetLine !== null && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        ↵ Sweep → Line {returnSweepTargetLine}
                      </span>
                    )}
                    {recenterNotice && (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                        {recenterNotice}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onReadFromSentence(trackedMetrics.sentenceIndex)}
                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isSpeaking
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100'
                    }`}
                  >
                    <Volume2 size={13} />
                    {isSpeaking
                      ? 'Stop Reading Aloud'
                      : `Read Aloud From Here (Sentence ${trackedMetrics.sentenceIndex + 1})`}
                  </button>

                  <div className="rounded-xl border border-stone-200 bg-stone-50/90 px-3 py-2 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider text-stone-600">
                        <Activity size={11} className="text-violet-600" />
                        DOM Behavioral &amp; Friction Signals
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          cognitiveFrictionLevel === 'High'
                            ? 'bg-rose-100 text-rose-800'
                            : cognitiveFrictionLevel === 'Moderate'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        Friction: {cognitiveFrictionLevel} ({cognitiveFrictionScore})
                      </span>
                    </div>
                    <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-stone-200/70">
                        <p className="text-[10px] text-stone-500">Caret Dwell</p>
                        <p className="truncate font-semibold text-stone-800">
                          {caretWord
                            ? `${(caretDwellMs / 1000).toFixed(1)}s • ${caretWord}`
                            : caretSentenceIndex !== null
                              ? `${(caretDwellMs / 1000).toFixed(1)}s • S${caretSentenceIndex + 1}`
                              : 'No caret'}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-stone-200/70">
                        <p className="text-[10px] text-stone-500">Scroll Pauses</p>
                        <p className="truncate font-semibold text-stone-800">
                          {scrollPauseCount}p • {scrollRegressionCount} re-read
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-stone-200/70">
                        <p className="text-[10px] text-stone-500">TTS Replays</p>
                        <p className="truncate font-semibold text-stone-800">
                          {totalTtsReplays} {topReplayedLabel ? `(${topReplayedLabel})` : 'replays'}
                        </p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between rounded-lg bg-white px-2.5 py-1 text-[10px] ring-1 ring-stone-200/70">
                      <span className="font-medium text-stone-600">
                        WPM: <strong className="text-stone-900">{estimatedWpm > 0 ? `${estimatedWpm} wpm` : ' Measuring...'}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={onToggleAdaptiveEngine}
                        className={`rounded-full px-2 py-0.5 font-semibold transition-colors ${
                          adaptiveEngineEnabled
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        Adaptive UI: {adaptiveEngineEnabled ? `On (${adaptiveSentenceIndices.length} adapted)` : 'Off'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onOpenMlPredictionLab}
                      className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700"
                    >
                      <BrainCircuit size={12} />
                      Open Full ML &amp; SHAP Prediction Lab
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Add reading text to see live line and paragraph tracking.
                </p>
              )}

              {hesitationPrompt && (
                <div className="rounded-xl border border-amber-300 bg-amber-50/95 p-2.5 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-900">
                      Gaze Pause Detected • Word Support
                    </span>
                    <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                      Press Space
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-stone-900">{hesitationPrompt.word}</p>
                    <p className="text-xs font-semibold text-amber-900">
                      {hesitationPrompt.breakdown.join(' • ')}
                    </p>
                  </div>
                  {hesitationPrompt.phoneticHint && (
                    <p className="mt-0.5 text-[11px] font-medium text-stone-600">
                      Sounds like: <span className="font-semibold text-stone-800">{hesitationPrompt.phoneticHint}</span>
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={openAndPronounceHesitationWord}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700"
                    >
                      <Volume2 size={12} />
                      Word Breakdown & Hear It
                    </button>
                    <button
                      type="button"
                      onClick={clearHesitationState}
                      className="rounded-lg bg-white px-2 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              {showSliderStepPanel && (
                <div className="rounded-xl border border-violet-200 bg-violet-50/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-950">
                      <Sparkles size={13} className="text-violet-700" />
                      Step 2 of 2: Fine-Tune Sliders
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                      <CheckCircle2 size={12} />
                      Position Locked
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-4 text-violet-900/80">
                    Your reading position is initialized. Test moving your eyes across lines and fine-tune if needed.
                  </p>

                  {autoGainStage === 'idle' ? (
                    <button
                      type="button"
                      onClick={startTwoPointAutoGain}
                      disabled={!faceDetectedLive}
                      className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 disabled:opacity-45"
                    >
                      <Crosshair size={13} />
                      Auto-Tune Sliders (2-Point Top/Bottom Gaze Check)
                    </button>
                  ) : (
                    <div className="mt-2.5 rounded-xl border border-emerald-300 bg-emerald-50/95 p-2.5 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-emerald-950">
                          {autoGainStage === 'top'
                            ? `Point 1 of 2: Look at Top Line ${autoGainTargetLineIndex + 1}`
                            : `Point 2 of 2: Look at Lower Line ${autoGainTargetLineIndex + 1}`}
                        </span>
                        <span className="font-semibold text-emerald-800">
                          {Math.round(autoGainProgress * 100)}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-emerald-200">
                        <div
                          className="h-full rounded-full bg-emerald-600 transition-[width] duration-150"
                          style={{ width: `${Math.max(10, autoGainProgress * 100)}%` }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] text-emerald-900">
                          Hold your gaze on the green highlighted line...
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={finalizeAutoGainStageNow}
                            disabled={!faceDetectedLive}
                            className="rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-45"
                          >
                            Capture
                          </button>
                          <button
                            type="button"
                            onClick={cancelTwoPointAutoGain}
                            className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="mt-3 space-y-2.5 text-xs">
                    <div>
                      <div className="flex justify-between font-medium text-stone-800">
                        <span>Reading Position Height</span>
                        <span>{Math.round(settings.trackingNeutralLineHeight * 100)}%</span>
                      </div>
                      <input
                        type="range"
                        min="0.15"
                        max="0.75"
                        step="0.01"
                        value={settings.trackingNeutralLineHeight}
                        onChange={(event) =>
                          onSettingsChange({
                            ...settings,
                            trackingNeutralLineHeight: parseFloat(event.target.value),
                          })
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-medium text-stone-800">
                        <span>Eye (Iris) Sensitivity</span>
                        <span>{settings.irisTrackingSensitivity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.04"
                        max="0.75"
                        step="0.01"
                        value={settings.irisTrackingSensitivity}
                        onChange={(event) =>
                          onSettingsChange({
                            ...settings,
                            irisTrackingSensitivity: parseFloat(event.target.value),
                          })
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-medium text-stone-800">
                        <span>Head Sensitivity</span>
                        <span>{settings.headTrackingSensitivity.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="0.8"
                        max="3"
                        step="0.05"
                        value={settings.headTrackingSensitivity}
                        onChange={(event) =>
                          onSettingsChange({
                            ...settings,
                            headTrackingSensitivity: parseFloat(event.target.value),
                          })
                        }
                        className="mt-1 w-full"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between font-medium text-stone-800">
                        <span>Line Lock Steadiness</span>
                        <span>{settings.trackingSteadiness} hits</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        step="1"
                        value={settings.trackingSteadiness}
                        onChange={(event) =>
                          onSettingsChange({
                            ...settings,
                            trackingSteadiness: parseInt(event.target.value, 10),
                          })
                        }
                        className="mt-1 w-full"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowSliderStepPanel(false);
                      setShowCameraPreview(false);
                    }}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-stone-700"
                  >
                    <Check size={13} />
                    Done — Start Reading
                  </button>
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] text-slate-500">
            100% browser-local: camera frames never leave your device.
          </p>
        </div>
      )}

      {!showHeadTrackingStatus && (
        <div
          className={`absolute z-20 ${
            readingMode
              ? 'right-3 top-24 sm:right-4 sm:top-24'
              : 'right-3 top-3 sm:right-4 sm:top-4'
          }`}
        >
          {!showBehavioralSignalsPanel ? (
            <button
              type="button"
              onClick={() => setShowBehavioralSignalsPanel(true)}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-stone-700 shadow-md backdrop-blur-sm transition-colors hover:bg-stone-50"
              title="View DOM-based behavioral attention & cognitive friction signals"
            >
              <Activity size={13} className="text-violet-600" />
              <span>DOM Signals</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  cognitiveFrictionLevel === 'High'
                    ? 'bg-rose-100 text-rose-800'
                    : cognitiveFrictionLevel === 'Moderate'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {cognitiveFrictionLevel}
              </span>
            </button>
          ) : (
            <div className="w-[21.5rem] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-stone-200 bg-white p-3.5 text-xs shadow-xl">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold uppercase tracking-wider text-slate-600">
                  <Activity size={13} className="text-violet-600" />
                  DOM Behavioral Signals
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      cognitiveFrictionLevel === 'High'
                        ? 'bg-rose-100 text-rose-800'
                        : cognitiveFrictionLevel === 'Moderate'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Friction: {cognitiveFrictionLevel} ({cognitiveFrictionScore})
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBehavioralSignalsPanel(false)}
                    className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600 hover:bg-stone-200"
                  >
                    Hide
                  </button>
                </div>
              </div>

              <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                <div className="rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200/80">
                  <p className="text-[10px] font-medium text-stone-500">Caret Dwell</p>
                  <p className="mt-0.5 truncate font-semibold text-stone-900">
                    {caretWord
                      ? `${(caretDwellMs / 1000).toFixed(1)}s`
                      : caretSentenceIndex !== null
                        ? `${(caretDwellMs / 1000).toFixed(1)}s`
                        : 'Idle'}
                  </p>
                  <p className="truncate text-[10px] text-stone-500">
                    {caretWord
                      ? `"${caretWord}"`
                      : caretSentenceIndex !== null
                        ? `Sentence ${caretSentenceIndex + 1}`
                        : 'Click text'}
                  </p>
                </div>

                <div className="rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200/80">
                  <p className="text-[10px] font-medium text-stone-500">Scroll Pauses</p>
                  <p className="mt-0.5 font-semibold text-stone-900">
                    {scrollPauseCount} pauses
                  </p>
                  <p className="truncate text-[10px] text-stone-500">
                    {scrollRegressionCount} re-reads • {(scrollPauseMs / 1000).toFixed(0)}s dwell
                  </p>
                </div>

                <div className="rounded-xl bg-stone-50 p-2 ring-1 ring-stone-200/80">
                  <p className="text-[10px] font-medium text-stone-500">TTS Replays</p>
                  <p className="mt-0.5 font-semibold text-stone-900">
                    {totalTtsReplays} replays
                  </p>
                  <p className="truncate text-[10px] text-stone-500">
                    {topReplayedLabel ?? 'No repeats yet'}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between rounded-xl bg-stone-50 px-2.5 py-1.5 text-[11px] ring-1 ring-stone-200/80">
                <span className="font-medium text-stone-600">
                  Speed: <strong className="text-stone-900">{estimatedWpm > 0 ? `${estimatedWpm} WPM` : 'Measuring...'}</strong>
                </span>
                <button
                  type="button"
                  onClick={onToggleAdaptiveEngine}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                    adaptiveEngineEnabled
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-stone-200 text-stone-700'
                  }`}
                >
                  Adaptive Engine: {adaptiveEngineEnabled ? `Active (${adaptiveSentenceIndices.length} sentences)` : 'Off'}
                </button>
              </div>

              <button
                type="button"
                onClick={onOpenMlPredictionLab}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700"
              >
                <BrainCircuit size={13} />
                Open ML Prediction Lab (ZuCo + SHAP)
              </button>

              {hesitationPrompt && (
                <div className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50/95 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-900">
                      Caret Dwell Friction • Word Support
                    </span>
                    <button
                      type="button"
                      onClick={openAndPronounceHesitationWord}
                      className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-700"
                    >
                      Hear &amp; Open (Space)
                    </button>
                  </div>
                  <p className="mt-1 text-xs font-bold text-stone-900">
                    {hesitationPrompt.word}:{' '}
                    <span className="font-semibold text-amber-900">
                      {hesitationPrompt.breakdown.join(' • ')}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {hoverCard && (
        <div
          ref={hoverCardRef}
          className="absolute z-20 max-w-[calc(100%-2rem)] rounded-2xl border border-stone-200 bg-white p-4 shadow-xl"
          style={{ top: hoverCard.top, left: hoverCard.left, width: hoverCard.width }}
          onMouseEnter={clearHideTimer}
          onMouseLeave={scheduleHideCard}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Word Help
              </p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">{hoverCard.word}</h3>
              <p className="mt-1 text-sm text-slate-500">
                Click another word to switch help, or click outside to close this panel.
              </p>
            </div>
            <button
              type="button"
              onClick={pronounceHoveredWord}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-500 text-white transition-colors hover:bg-blue-600"
              title={`Pronounce "${hoverCard.word}"`}
            >
              <Volume2 size={18} />
            </button>
          </div>

          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800">
              Say It In Parts
            </p>
            <p className="mt-1 text-base font-semibold text-amber-950">
              {hoverCard.breakdown.join(' - ')}
            </p>
          </div>

          {hoverCard.phoneticHint && (
            <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-sky-800">
                Simple Pronunciation
              </p>
              <p className="mt-1 text-base font-semibold text-sky-950">
                {hoverCard.phoneticHint}
              </p>
            </div>
          )}

          {renderSimpleDefinition(hoverCard.word)}

          {renderMorphologySummary(hoverCard.morphology)}

          <div className="mt-3">
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Pronunciation Speed: {hoverPronunciationRate.toFixed(2)}x
            </label>
            <input
              type="range"
              min="0.5"
              max="1.5"
              step="0.05"
              value={hoverPronunciationRate}
              onChange={(event) => onHoverPronunciationRateChange(parseFloat(event.target.value))}
              className="mt-2 w-full"
            />
          </div>

          {renderDifficultySummary(hoverCard.word)}

          {renderZucoShapSummary(
            hoverCard.word,
            wordBehavioralMapRef.current.get(hoverCard.word.toLowerCase()),
            wordTtsPlayCounts[hoverCard.word.toLowerCase()] ?? 0,
            onOpenMlPredictionLab
          )}
        </div>
      )}

      {showMlPredictionLab && (
        <MlPredictionLab
          content={content}
          onLoadSamplePassage={() => onContentChange(SAMPLE_PASSAGE)}
          wordObservations={Object.fromEntries(wordBehavioralMapRef.current.entries())}
          wordTtsPlayCounts={wordTtsPlayCounts}
          initialSelectedWord={hoverCard?.word ?? trackedWord ?? caretWord}
          onClose={onCloseMlPredictionLab}
        />
      )}

      {isTouchDevice && (
        <div className="pointer-events-none absolute bottom-4 right-4 z-20">
          <button
            type="button"
            onClick={toggleMobileEditing}
            className={`pointer-events-auto inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium shadow-lg transition-colors ${
              mobileEditingEnabled
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-stone-900 text-white hover:bg-stone-700'
            }`}
          >
            {mobileEditingEnabled ? <Check size={16} /> : <Pencil size={16} />}
            {mobileEditingEnabled ? 'Done Editing' : 'Edit Text'}
          </button>
        </div>
      )}

      <div
        ref={editorScrollRef}
        className="relative h-full overflow-y-auto"
        style={{ backgroundColor: settings.backgroundColor }}
        onScroll={handleEditorScroll}
      >
        {headTrackingEnabled && overlayParagraphBox && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-0 rounded-2xl transition-all duration-200 ease-out"
            style={{
              top: overlayParagraphBox.top,
              left: overlayParagraphBox.left,
              width: overlayParagraphBox.width,
              height: overlayParagraphBox.height,
              backgroundColor: 'rgba(139, 92, 246, 0.055)',
              borderLeft: '4px solid rgba(124, 58, 237, 0.72)',
              boxShadow: '0 2px 12px rgba(124, 58, 237, 0.06)',
            }}
          >
            <span className="absolute -top-3 left-2.5 rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm">
              Paragraph {overlayParagraphBox.paragraphIndex + 1}
            </span>
          </div>
        )}

        {headTrackingEnabled && overlayLineBox && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-0 rounded-lg transition-[top,height,left,width] duration-100 ease-out"
            style={{
              top: overlayLineBox.top,
              left: overlayLineBox.left,
              width: overlayLineBox.width,
              height: overlayLineBox.height,
              backgroundColor: overlayLineBox.isCalibrationTarget
                ? 'rgba(16, 185, 129, 0.16)'
                : 'rgba(124, 58, 237, 0.14)',
              borderTop: overlayLineBox.isCalibrationTarget
                ? '2px dashed rgba(5, 150, 105, 0.75)'
                : '1.5px solid rgba(124, 58, 237, 0.45)',
              borderBottom: overlayLineBox.isCalibrationTarget
                ? '2px dashed rgba(5, 150, 105, 0.75)'
                : '2px solid rgba(109, 40, 217, 0.65)',
            }}
          >
            <span
              className={`absolute -top-2.5 right-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white shadow-sm ${
                overlayLineBox.isCalibrationTarget ? 'bg-emerald-600' : 'bg-indigo-600'
              }`}
            >
              {autoGainStage === 'top'
                ? `Auto-Tune 1/2: Look at Top Line ${overlayLineBox.lineIndex + 1}`
                : autoGainStage === 'bottom'
                  ? `Auto-Tune 2/2: Look at Lower Line ${overlayLineBox.lineIndex + 1}`
                  : overlayLineBox.isCalibrationTarget
                    ? `Step 1 Target: Line ${overlayLineBox.lineIndex + 1} (Look Here)`
                    : `Line ${overlayLineBox.lineIndex + 1}`}
            </span>

            <span
              className={`absolute -bottom-1.5 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-white shadow transition-[left] duration-100 ease-out ${
                overlayLineBox.isCalibrationTarget ? 'bg-emerald-500' : 'bg-violet-600'
              }`}
              style={{
                left: `${overlayLineBox.isCalibrationTarget ? 50 : overlayLineBox.gazeXPercent}%`,
              }}
            />
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable={isEditorEditable}
          suppressContentEditableWarning
          spellCheck={false}
          onInput={handleInput}
          onClick={handleEditorClick}
          onMouseMove={handleEditorMouseMove}
          className={`relative z-10 mx-auto min-h-full w-full max-w-4xl whitespace-pre-wrap break-words ${
            isEditorEditable ? 'focus:outline-none' : 'focus:outline-none select-text'
          } ${wordHighlight ? 'word-highlight' : ''}`}
          style={{
            ...editorStyle,
            backgroundColor: 'transparent',
            padding: readingMode
              ? '7rem clamp(1rem, 4vw, 3.5rem) 4.5rem'
              : 'clamp(1.5rem, 4vw, 3rem) clamp(1rem, 4vw, 3rem) 4rem',
          }}
        />
      </div>
    </div>
  );
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildTokenMarkup(text: string, isWord: boolean, showDifficultWords: boolean): string {
  if (!isWord) {
    return escapeHtml(text);
  }

  const difficulty = analyzeWordDifficulty(text);
  const difficultyClass =
    showDifficultWords && difficulty.isDifficult
      ? difficulty.level === 'high'
        ? ' difficult-word difficult-word--high'
        : ' difficult-word difficult-word--moderate'
      : '';

  return `<span data-word="true" class="inline cursor-help rounded px-0.5 transition-colors hover:bg-amber-200/70${difficultyClass}">${escapeHtml(text)}</span>`;
}

function buildEditorMarkup(
  segments: SentenceSegment[],
  activeSentenceIndex: number | null,
  showDifficultWords: boolean,
  showSentenceSimplification: boolean,
  clauseFocusBySentence: Record<number, number>
): string {
  const htmlParts: string[] = [];
  let currentParagraphIndex: number | null = null;
  let currentParagraphParts: string[] = [];

  const flushParagraph = () => {
    if (currentParagraphIndex !== null && currentParagraphParts.length > 0) {
      htmlParts.push(
        `<span data-paragraph-index="${currentParagraphIndex}" class="paragraph-segment">${currentParagraphParts.join('')}</span>`
      );
    }
    currentParagraphIndex = null;
    currentParagraphParts = [];
  };

  for (const segment of segments) {
    if (segment.isNewline || segment.paragraphIndex === null) {
      flushParagraph();
      htmlParts.push(escapeHtml(segment.text));
      continue;
    }

    if (currentParagraphIndex !== null && currentParagraphIndex !== segment.paragraphIndex) {
      flushParagraph();
    }

    currentParagraphIndex = segment.paragraphIndex;
    currentParagraphParts.push(
      buildSentenceMarkup(
        segment.text,
        segment.index,
        segment.paragraphIndex,
        activeSentenceIndex,
        showDifficultWords,
        showSentenceSimplification,
        clauseFocusBySentence[segment.index] ?? 0
      )
    );
  }

  flushParagraph();
  return htmlParts.join('');
}

function buildSentenceMarkup(
  text: string,
  sentenceIndex: number,
  paragraphIndex: number,
  activeSentenceIndex: number | null,
  showDifficultWords: boolean,
  showSentenceSimplification: boolean,
  activeClauseIndex: number
): string {
  const sentenceAnalysis = analyzeSentence(text);
  const sentenceClass = activeSentenceIndex === sentenceIndex ? ' sentence-active' : '';
  const isSimplified = showSentenceSimplification && sentenceAnalysis.isComplex;

  const content = isSimplified
    ? sentenceAnalysis.clauses
        .map((clause, clauseIndex) => {
          const clauseTokens = tokenizeText(clause);
          const clauseContent = clauseTokens
            .map((token) => buildTokenMarkup(token.text, token.isWord, showDifficultWords))
            .join('');
          const clauseClass =
            clauseIndex === activeClauseIndex
              ? ' sentence-clause sentence-clause--active'
              : ' sentence-clause sentence-clause--muted';

          return `<span data-clause-index="${clauseIndex}" class="${clauseClass}">${clauseContent}</span>`;
        })
        .join('<span class="sentence-clause-break"> / </span>')
    : tokenizeText(text)
        .map((token) => buildTokenMarkup(token.text, token.isWord, showDifficultWords))
        .join('');

  const hint = isSimplified
    ? '<span class="sentence-simplification-hint">click sentence to step through clauses</span>'
    : '';

  return `<span data-sentence-index="${sentenceIndex}" data-paragraph-index="${paragraphIndex}" data-clause-count="${sentenceAnalysis.clauses.length}" data-is-complex="${sentenceAnalysis.isComplex}" class="sentence-segment${sentenceClass}${isSimplified ? ' sentence-segment--simplified' : ''}">${content}${hint}</span>`;
}

function collectVisibleGeometry(
  editor: HTMLDivElement | null,
  scrollContainer: HTMLDivElement | null,
  fontSize: number
): { visualLines: VisualLine[]; paragraphBoxes: ParagraphBox[] } {
  if (!editor || !scrollContainer) {
    return { visualLines: [], paragraphBoxes: [] };
  }

  const scrollRect = scrollContainer.getBoundingClientRect();
  const sentenceElements = Array.from(
    editor.querySelectorAll<HTMLElement>('[data-sentence-index]')
  );

  const lineMergeThreshold = Math.max(10, fontSize * 0.58);
  const rawLines: {
    paragraphIndex: number;
    top: number;
    bottom: number;
    left: number;
    right: number;
    centerY: number;
    fragmentsBySentence: Map<number, VisualLineFragment>;
  }[] = [];

  for (const sentenceElement of sentenceElements) {
    const sentenceIndex = Number(sentenceElement.dataset.sentenceIndex);
    const paragraphIndex = Number(sentenceElement.dataset.paragraphIndex ?? '0');
    if (!Number.isFinite(sentenceIndex)) {
      continue;
    }

    const clientRects = Array.from(sentenceElement.getClientRects());
    for (const rect of clientRects) {
      if (rect.width < 2 || rect.height < 4) {
        continue;
      }

      if (rect.bottom < scrollRect.top - 24 || rect.top > scrollRect.bottom + 24) {
        continue;
      }

      const rectCenterY = (rect.top + rect.bottom) / 2;
      let matchingLine = rawLines.find(
        (line) =>
          line.paragraphIndex === paragraphIndex &&
          Math.abs(line.centerY - rectCenterY) <= lineMergeThreshold
      );

      if (!matchingLine) {
        matchingLine = {
          paragraphIndex,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          centerY: rectCenterY,
          fragmentsBySentence: new Map(),
        };
        rawLines.push(matchingLine);
      } else {
        matchingLine.top = Math.min(matchingLine.top, rect.top);
        matchingLine.bottom = Math.max(matchingLine.bottom, rect.bottom);
        matchingLine.left = Math.min(matchingLine.left, rect.left);
        matchingLine.right = Math.max(matchingLine.right, rect.right);
        matchingLine.centerY = (matchingLine.top + matchingLine.bottom) / 2;
      }

      const existingFragment = matchingLine.fragmentsBySentence.get(sentenceIndex);
      if (existingFragment) {
        existingFragment.left = Math.min(existingFragment.left, rect.left);
        existingFragment.right = Math.max(existingFragment.right, rect.right);
        existingFragment.top = Math.min(existingFragment.top, rect.top);
        existingFragment.bottom = Math.max(existingFragment.bottom, rect.bottom);
      } else {
        matchingLine.fragmentsBySentence.set(sentenceIndex, {
          sentenceIndex,
          paragraphIndex,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        });
      }
    }
  }

  rawLines.sort((a, b) => a.centerY - b.centerY);

  const visualLines: VisualLine[] = rawLines.map((line, index) => ({
    lineIndex: index,
    paragraphIndex: line.paragraphIndex,
    top: line.top,
    bottom: line.bottom,
    left: line.left,
    right: line.right,
    centerY: line.centerY,
    height: Math.max(16, line.bottom - line.top),
    fragments: Array.from(line.fragmentsBySentence.values()).sort((a, b) => a.left - b.left),
  }));

  const paragraphMap = new Map<number, ParagraphBox>();
  for (const line of visualLines) {
    const existing = paragraphMap.get(line.paragraphIndex);
    if (!existing) {
      paragraphMap.set(line.paragraphIndex, {
        paragraphIndex: line.paragraphIndex,
        top: line.top,
        bottom: line.bottom,
        left: line.left,
        right: line.right,
        height: line.bottom - line.top,
        width: line.right - line.left,
        lineCount: 1,
      });
    } else {
      existing.top = Math.min(existing.top, line.top);
      existing.bottom = Math.max(existing.bottom, line.bottom);
      existing.left = Math.min(existing.left, line.left);
      existing.right = Math.max(existing.right, line.right);
      existing.height = existing.bottom - existing.top;
      existing.width = existing.right - existing.left;
      existing.lineCount += 1;
    }
  }

  const paragraphBoxes = Array.from(paragraphMap.values()).sort(
    (a, b) => a.paragraphIndex - b.paragraphIndex
  );

  return { visualLines, paragraphBoxes };
}

function getNormalizedLineY(
  line: VisualLine,
  scrollContainer: HTMLDivElement | null,
  fallback: number
): number {
  if (!scrollContainer) {
    return fallback;
  }

  const scrollRect = scrollContainer.getBoundingClientRect();
  if (scrollRect.height < 40) {
    return fallback;
  }

  return clamp((line.centerY - scrollRect.top) / scrollRect.height, 0.15, 0.75);
}

function extractHeadPoseSample(landmarks: NormalizedLandmark[] | undefined): HeadPoseSample | null {
  if (!landmarks || landmarks.length < 460) {
    return null;
  }

  const lOuter = landmarks[33];
  const lInner = landmarks[133];
  const rOuter = landmarks[263];
  const rInner = landmarks[362];
  const noseTip1 = landmarks[1];
  const noseTip4 = landmarks[4];
  const noseBridge = landmarks[168];

  if (!lOuter || !lInner || !rOuter || !rInner || !noseTip1 || !noseTip4 || !noseBridge) {
    return null;
  }

  const leftEyeCenter = {
    x: 1 - (lOuter.x + lInner.x) / 2,
    y: (lOuter.y + lInner.y) / 2,
  };
  const rightEyeCenter = {
    x: 1 - (rOuter.x + rInner.x) / 2,
    y: (rOuter.y + rInner.y) / 2,
  };

  const interOcularDist = Math.hypot(
    rightEyeCenter.x - leftEyeCenter.x,
    rightEyeCenter.y - leftEyeCenter.y
  );
  if (!Number.isFinite(interOcularDist) || interOcularDist < 0.015) {
    return null;
  }

  const eyeMid = {
    x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
    y: (leftEyeCenter.y + rightEyeCenter.y) / 2,
  };

  const noseTip = {
    x: 1 - (noseTip1.x + noseTip4.x) / 2,
    y: (noseTip1.y + noseTip4.y) / 2,
  };

  const upperFaceX = clamp(0.55 * eyeMid.x + 0.45 * noseTip.x, 0, 1);
  const upperFaceY = clamp(0.55 * eyeMid.y + 0.45 * noseTip.y, 0, 1);
  const pitchRatio = (noseTip.y - eyeMid.y) / interOcularDist;
  const yawRatio = (noseTip.x - eyeMid.x) / interOcularDist;

  if (!Number.isFinite(pitchRatio) || !Number.isFinite(yawRatio)) {
    return null;
  }

  return {
    upperFaceX,
    upperFaceY,
    pitchRatio,
    yawRatio,
    interOcularDist,
  };
}

function extractIrisSample(landmarks: NormalizedLandmark[] | undefined): IrisSample | null {
  if (!landmarks || landmarks.length <= 477) {
    return null;
  }

  const leftEye = extractSingleEyeIrisOffset(landmarks, LEFT_EYE_INDICES);
  const rightEye = extractSingleEyeIrisOffset(landmarks, RIGHT_EYE_INDICES);

  if (leftEye === null && rightEye === null) {
    return null;
  }
  if (leftEye === null) {
    return rightEye;
  }
  if (rightEye === null) {
    return leftEye;
  }

  return {
    x: (leftEye.x + rightEye.x) / 2,
    y: (leftEye.y + rightEye.y) / 2,
  };
}

function extractSingleEyeIrisOffset(
  landmarks: NormalizedLandmark[],
  indices: {
    topLids: number[];
    bottomLids: number[];
    iris: number[];
    outer: number;
    inner: number;
  }
): IrisSample | null {
  const outerRaw = landmarks[indices.outer];
  const innerRaw = landmarks[indices.inner];
  if (!outerRaw || !innerRaw) {
    return null;
  }

  const outer = { x: 1 - outerRaw.x, y: outerRaw.y };
  const inner = { x: 1 - innerRaw.x, y: innerRaw.y };

  const leftCorner = outer.x < inner.x ? outer : inner;
  const rightCorner = outer.x < inner.x ? inner : outer;
  const eyeWidth = Math.hypot(rightCorner.x - leftCorner.x, rightCorner.y - leftCorner.y);
  if (eyeWidth < 0.004) {
    return null;
  }

  let topY = 0;
  for (const idx of indices.topLids) {
    const pt = landmarks[idx];
    if (!pt) return null;
    topY += pt.y;
  }
  topY /= indices.topLids.length;

  let bottomY = 0;
  for (const idx of indices.bottomLids) {
    const pt = landmarks[idx];
    if (!pt) return null;
    bottomY += pt.y;
  }
  bottomY /= indices.bottomLids.length;

  const eyeOpening = bottomY - topY;
  const ear = eyeOpening / eyeWidth;
  if (ear < 0.14) {
    return null;
  }

  let irisX = 0;
  let irisY = 0;
  for (const idx of indices.iris) {
    const pt = landmarks[idx];
    if (!pt) return null;
    irisX += 1 - pt.x;
    irisY += pt.y;
  }
  irisX /= indices.iris.length;
  irisY /= indices.iris.length;

  const cornerMid = {
    x: (leftCorner.x + rightCorner.x) / 2,
    y: (leftCorner.y + rightCorner.y) / 2,
  };

  const axisX = (rightCorner.x - leftCorner.x) / eyeWidth;
  const axisY = (rightCorner.y - leftCorner.y) / eyeWidth;
  const relX = irisX - cornerMid.x;
  const relY = irisY - cornerMid.y;

  const horizontalProjected = (relX * axisX + relY * axisY) / eyeWidth;
  const cornerVertical = (-relX * axisY + relY * axisX) / eyeWidth;
  const lidMidY = (topY + bottomY) / 2;
  const openingVertical = (irisY - lidMidY) / Math.max(eyeOpening, eyeWidth * 0.22);

  const combinedVertical = cornerVertical * 0.65 + openingVertical * 0.35;

  if (!Number.isFinite(horizontalProjected) || !Number.isFinite(combinedVertical)) {
    return null;
  }

  return {
    x: clamp(horizontalProjected * 3.0, -1, 1),
    y: clamp(combinedVertical * 3.2, -1, 1),
  };
}

function computeCombinedAttentionPoint(
  headSample: HeadPoseSample,
  irisSample: IrisSample | null,
  headBaseline: HeadPoseSample | null,
  irisBaseline: IrisSample | null,
  settings: ReaderSettings
): AttentionPoint {
  const baseUpperX = headBaseline?.upperFaceX ?? 0.5;
  const baseUpperY = headBaseline?.upperFaceY ?? 0.5;
  const basePitch = headBaseline?.pitchRatio ?? headSample.pitchRatio;
  const baseYaw = headBaseline?.yawRatio ?? headSample.yawRatio;
  const scaleFactor = headBaseline
    ? clamp(headBaseline.interOcularDist / Math.max(0.02, headSample.interOcularDist), 0.75, 1.35)
    : 1;

  const deltaUpperX = (headSample.upperFaceX - baseUpperX) * scaleFactor;
  const deltaUpperY = (headSample.upperFaceY - baseUpperY) * scaleFactor;
  const deltaPitch = headSample.pitchRatio - basePitch;
  const deltaYaw = headSample.yawRatio - baseYaw;

  const combinedHeadX = deltaUpperX * 1.15 + deltaYaw * 0.16;
  const combinedHeadY = deltaUpperY * 1.1 + deltaPitch * 0.22;

  const headTargetX = clamp(0.5 + combinedHeadX * settings.headTrackingSensitivity, 0.04, 0.96);
  const headTargetY = clamp(
    settings.trackingNeutralLineHeight + combinedHeadY * settings.headTrackingSensitivity,
    HEAD_TRACKING_MIN_Y,
    HEAD_TRACKING_MAX_Y
  );

  if (!irisSample) {
    return { x: headTargetX, y: headTargetY };
  }

  const deltaIrisX = irisSample.x - (irisBaseline?.x ?? 0);
  const deltaIrisY = irisSample.y - (irisBaseline?.y ?? 0);

  return {
    x: clamp(headTargetX + deltaIrisX * settings.irisTrackingSensitivity * 1.35, 0.04, 0.96),
    y: clamp(
      headTargetY + deltaIrisY * settings.irisTrackingSensitivity * 1.45,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };
}

function smoothAttentionPoint(
  rawPoint: AttentionPoint,
  previousPoint: AttentionPoint | null
): AttentionPoint {
  if (!previousPoint) {
    return rawPoint;
  }

  const dy = Math.abs(rawPoint.y - previousPoint.y);
  const dx = Math.abs(rawPoint.x - previousPoint.x);
  const isLeftwardSweep = rawPoint.x < previousPoint.x - 0.1;

  const alphaY = dy < 0.02 ? 0.22 : clamp(0.22 + (dy - 0.02) * 3.8, 0.22, 0.62);
  const alphaX = isLeftwardSweep
    ? 0.76
    : dx < 0.03
      ? 0.25
      : clamp(0.25 + (dx - 0.03) * 3.0, 0.25, 0.65);

  return {
    x: previousPoint.x + (rawPoint.x - previousPoint.x) * alphaX,
    y: previousPoint.y + (rawPoint.y - previousPoint.y) * alphaY,
  };
}

function computeRobustHeadBaseline(samples: HeadPoseSample[]): HeadPoseSample {
  if (samples.length === 0) {
    return {
      upperFaceX: 0.5,
      upperFaceY: 0.5,
      pitchRatio: 0.35,
      yawRatio: 0,
      interOcularDist: 0.08,
    };
  }

  const sortedByY = [...samples].sort((a, b) => a.upperFaceY - b.upperFaceY);
  const trimCount = Math.floor(sortedByY.length * 0.15);
  const trimmed =
    sortedByY.length >= 6
      ? sortedByY.slice(trimCount, sortedByY.length - trimCount)
      : sortedByY;

  return {
    upperFaceX: trimmed.reduce((sum, s) => sum + s.upperFaceX, 0) / trimmed.length,
    upperFaceY: trimmed.reduce((sum, s) => sum + s.upperFaceY, 0) / trimmed.length,
    pitchRatio: trimmed.reduce((sum, s) => sum + s.pitchRatio, 0) / trimmed.length,
    yawRatio: trimmed.reduce((sum, s) => sum + s.yawRatio, 0) / trimmed.length,
    interOcularDist: trimmed.reduce((sum, s) => sum + s.interOcularDist, 0) / trimmed.length,
  };
}

function computeRobustIrisBaseline(samples: IrisSample[]): IrisSample {
  if (samples.length === 0) {
    return { x: 0, y: 0 };
  }

  const sortedByY = [...samples].sort((a, b) => a.y - b.y);
  const trimCount = Math.floor(sortedByY.length * 0.15);
  const trimmed =
    sortedByY.length >= 6
      ? sortedByY.slice(trimCount, sortedByY.length - trimCount)
      : sortedByY;

  return {
    x: trimmed.reduce((sum, s) => sum + s.x, 0) / trimmed.length,
    y: trimmed.reduce((sum, s) => sum + s.y, 0) / trimmed.length,
  };
}

function drawCameraLandmarkPreview(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement,
  landmarks: NormalizedLandmark[] | undefined,
  headSample: HeadPoseSample | null,
  irisSample: IrisSample | null
) {
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return;
  }

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = headSample
    ? 'rgba(167, 139, 250, 0.45)'
    : 'rgba(248, 113, 113, 0.45)';
  ctx.lineWidth = 1.25;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(w * 0.22, h * 0.12, w * 0.56, h * 0.72);
  ctx.setLineDash([]);

  if (!landmarks || landmarks.length < 460) {
    ctx.restore();
    return;
  }

  const toCanvas = (pt: NormalizedLandmark) => ({
    x: (1 - pt.x) * w,
    y: pt.y * h,
  });

  const drawEyeOverlay = (indices: typeof LEFT_EYE_INDICES) => {
    const outerPt = landmarks[indices.outer];
    const innerPt = landmarks[indices.inner];
    const topLidPt = landmarks[indices.topLids[0]];
    const bottomLidPt = landmarks[indices.bottomLids[0]];
    if (!outerPt || !innerPt || !topLidPt || !bottomLidPt) {
      return;
    }

    const outer = toCanvas(outerPt);
    const inner = toCanvas(innerPt);
    const topLid = toCanvas(topLidPt);
    const bottomLid = toCanvas(bottomLidPt);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.quadraticCurveTo((outer.x + inner.x) / 2, topLid.y - 2, inner.x, inner.y);
    ctx.quadraticCurveTo((outer.x + inner.x) / 2, bottomLid.y + 2, outer.x, outer.y);
    ctx.stroke();

    const irisCenterRaw = landmarks[indices.iris[0]];
    if (irisCenterRaw) {
      const center = toCanvas(irisCenterRaw);
      let radius = 3.5;
      const rimPt = landmarks[indices.iris[1]];
      if (rimPt) {
        const rim = toCanvas(rimPt);
        radius = clamp(Math.hypot(rim.x - center.x, rim.y - center.y), 2.8, 9);
      }

      ctx.strokeStyle = irisSample ? 'rgba(16, 185, 129, 0.95)' : 'rgba(251, 191, 36, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = irisSample ? '#34d399' : '#fbbf24';
      ctx.beginPath();
      ctx.arc(center.x, center.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  drawEyeOverlay(LEFT_EYE_INDICES);
  drawEyeOverlay(RIGHT_EYE_INDICES);

  const noseBridgePt = landmarks[168];
  const noseTipPt = landmarks[1];
  if (noseBridgePt && noseTipPt) {
    const bridge = toCanvas(noseBridgePt);
    const tip = toCanvas(noseTipPt);

    ctx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(bridge.x, bridge.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();

    ctx.fillStyle = '#c4b5fd';
    ctx.beginPath();
    ctx.arc(bridge.x, bridge.y, 2.5, 0, Math.PI * 2);
    ctx.arc(tip.x, tip.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function findTrackedWordOnLine(
  editor: HTMLDivElement | null,
  targetLine: VisualLine,
  targetX: number,
  caretWordElement: HTMLElement | null
): {
  element: HTMLElement;
  word: string;
  sentenceIndex: number | null;
} | null {
  if (!editor) {
    return null;
  }

  const wordElements = Array.from(editor.querySelectorAll<HTMLElement>('[data-word="true"]'));
  let bestCandidate: {
    element: HTMLElement;
    word: string;
    sentenceIndex: number | null;
    score: number;
  } | null = null;

  for (const element of wordElements) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 4) {
      continue;
    }

    const wordCenterY = (rect.top + rect.bottom) / 2;
    if (Math.abs(wordCenterY - targetLine.centerY) > targetLine.height * 0.68) {
      continue;
    }

    const word = normalizeWord(element.innerText);
    if (!word) {
      continue;
    }

    const horizontalDistance =
      targetX < rect.left
        ? rect.left - targetX
        : targetX > rect.right
          ? targetX - rect.right
          : Math.abs(targetX - (rect.left + rect.right) / 2) * 0.25;

    if (horizontalDistance > 165) {
      continue;
    }

    const caretBonus = caretWordElement && element === caretWordElement ? -28 : 0;
    const score = horizontalDistance + caretBonus;

    if (!bestCandidate || score < bestCandidate.score) {
      const parentSentence = element.closest('[data-sentence-index]') as HTMLElement | null;
      const sentenceIndex = parentSentence ? Number(parentSentence.dataset.sentenceIndex) : null;
      bestCandidate = {
        element,
        word,
        sentenceIndex: Number.isFinite(sentenceIndex) ? sentenceIndex : null,
        score,
      };
    }
  }

  return bestCandidate;
}

function findHesitationWordOnLine(
  editor: HTMLDivElement | null,
  scrollContainer: HTMLDivElement | null,
  lineIndex: number,
  normalizedAttentionX: number,
  fontSize: number
): {
  element: HTMLElement;
  word: string;
  isDifficult: boolean;
  sentenceIndex: number | null;
} | null {
  if (!editor || !scrollContainer) {
    return null;
  }

  const { visualLines } = collectVisibleGeometry(editor, scrollContainer, fontSize);
  const targetLine = visualLines.find((line) => line.lineIndex === lineIndex);
  if (!targetLine) {
    return null;
  }

  const scrollRect = scrollContainer.getBoundingClientRect();
  const targetX = clamp(
    scrollRect.left + normalizedAttentionX * scrollRect.width,
    targetLine.left,
    targetLine.right
  );

  const wordElements = Array.from(editor.querySelectorAll<HTMLElement>('[data-word="true"]'));
  let bestCandidate: {
    element: HTMLElement;
    word: string;
    isDifficult: boolean;
    sentenceIndex: number | null;
    score: number;
  } | null = null;

  for (const element of wordElements) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 3 || rect.height < 4) {
      continue;
    }

    const wordCenterY = (rect.top + rect.bottom) / 2;
    if (Math.abs(wordCenterY - targetLine.centerY) > targetLine.height * 0.72) {
      continue;
    }

    const word = normalizeWord(element.innerText);
    if (!word || word.length < 4) {
      continue;
    }

    const horizontalDistance =
      targetX < rect.left
        ? rect.left - targetX
        : targetX > rect.right
          ? targetX - rect.right
          : 0;

    if (horizontalDistance > 155) {
      continue;
    }

    const difficulty = analyzeWordDifficulty(word);
    const difficultyBonus = difficulty.isDifficult
      ? difficulty.level === 'high'
        ? -65
        : -45
      : word.length >= 7
        ? -25
        : 0;

    const score = horizontalDistance + difficultyBonus;
    if (!bestCandidate || score < bestCandidate.score) {
      const parentSentence = element.closest('[data-sentence-index]') as HTMLElement | null;
      const sentenceIndex = parentSentence ? Number(parentSentence.dataset.sentenceIndex) : null;
      bestCandidate = {
        element,
        word,
        isDifficult: difficulty.isDifficult,
        sentenceIndex: Number.isFinite(sentenceIndex) ? sentenceIndex : null,
        score,
      };
    }
  }

  return bestCandidate;
}

function renderDifficultySummary(word: string) {
  const difficulty = analyzeWordDifficulty(word);
  if (!difficulty.isDifficult) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-rose-700">
        Why This May Feel Tricky
      </p>
      <p className="mt-1 text-sm text-rose-900">{difficulty.reasons.join(', ')}</p>
    </div>
  );
}

function renderZucoShapSummary(
  word: string,
  observation: WordBehavioralObservation | undefined,
  ttsPlayCount: number,
  onOpenLab?: () => void
) {
  const prediction = evaluateZucoWordCognitiveLoad(word, {
    ...observation,
    ttsReplays: Math.max(0, ttsPlayCount - 1),
  });

  return (
    <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50/70 p-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wider text-violet-900">
          ZuCo Cognitive Load (SHAP)
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
            prediction.isDifficultClass1
              ? 'bg-rose-100 text-rose-800'
              : 'bg-emerald-100 text-emerald-800'
          }`}
        >
          {prediction.predictedLoadLabel} ({Math.round(prediction.stressPercentile * 100)}th pct)
        </span>
      </div>

      <p className="mt-1 text-[10px] text-violet-800/90">
        Behavioral features account for <strong>{prediction.behavioralDominancePct}%</strong> of model impact (XGBoost TreeExplainer).
      </p>

      <div className="mt-2 space-y-1">
        {prediction.shapContributions.map((item) => {
          const widthPct = Math.min(100, Math.max(8, Math.round((Math.abs(item.shapImpact) / 6.5) * 100)));
          const isPositive = item.shapImpact >= 0;
          return (
            <div key={item.feature} className="grid grid-cols-[1fr_4.5rem_3.2rem] items-center gap-1.5 text-[10px]">
              <span className="truncate font-mono text-stone-700">{item.label}</span>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                <div
                  className={`h-full rounded-full ${
                    isPositive
                      ? item.category === 'behavioral'
                        ? 'bg-violet-600'
                        : 'bg-amber-500'
                      : 'bg-sky-500'
                  }`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-right font-medium text-stone-600">{item.rawValue}</span>
            </div>
          );
        })}
      </div>

      {onOpenLab && (
        <button
          type="button"
          onClick={onOpenLab}
          className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700"
        >
          <BrainCircuit size={12} />
          Inspect in ML Prediction Lab
        </button>
      )}
    </div>
  );
}

function renderSimpleDefinition(word: string) {
  const definition = getSimpleDefinition(word);
  if (!definition) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-stone-100 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-600">Easy Meaning</p>
      <p className="mt-1 text-sm text-stone-900">{definition.meaning}</p>
      {definition.example && <p className="mt-2 text-sm text-stone-600">{definition.example}</p>}
    </div>
  );
}

function renderMorphologySummary(morphology: HoverCard['morphology']) {
  if (!morphology.prefix && !morphology.suffix) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Word Parts</p>
      <p className="mt-1 text-sm text-emerald-950">
        {morphology.prefix ? `prefix: ${morphology.prefix} | ` : ''}
        root: {morphology.root}
        {morphology.suffix ? ` | suffix: ${morphology.suffix}` : ''}
      </p>
    </div>
  );
}

function getWordTargetAtPoint(
  x: number,
  y: number,
  editor: HTMLDivElement | null
): WordTarget | null {
  if (!editor) {
    return null;
  }

  const hoveredElement = document.elementFromPoint(x, y);
  if (!(hoveredElement instanceof HTMLElement)) {
    return null;
  }

  const wordElement = hoveredElement.closest('[data-word="true"]');
  if (!(wordElement instanceof HTMLElement) || !editor.contains(wordElement)) {
    return null;
  }

  const word = normalizeWord(wordElement.innerText);
  if (!word) {
    return null;
  }

  return {
    element: wordElement,
    word,
    rect: wordElement.getBoundingClientRect(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

async function createFaceLandmarkerWithFallback(
  vision: typeof import('@mediapipe/tasks-vision'),
  filesetResolver: Awaited<
    ReturnType<typeof import('@mediapipe/tasks-vision').FilesetResolver.forVisionTasks>
  >
): Promise<FaceLandmarker> {
  try {
    return await vision.FaceLandmarker.createFromOptions(
      filesetResolver,
      buildFaceLandmarkerOptions('GPU')
    );
  } catch (gpuError) {
    try {
      return await vision.FaceLandmarker.createFromOptions(
        filesetResolver,
        buildFaceLandmarkerOptions('CPU')
      );
    } catch (cpuError) {
      throw new Error(
        `MediaPipe startup failed. GPU: ${formatTrackingError(gpuError)} | CPU: ${formatTrackingError(cpuError)}`
      );
    }
  }
}

function buildFaceLandmarkerOptions(delegate: 'GPU' | 'CPU') {
  return {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO' as const,
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };
}

function getHeadTrackingErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return 'Camera permission was blocked. Please allow webcam access and try again.';
    }

    if (error.name === 'NotFoundError') {
      return 'No webcam was found for eye & head tracking.';
    }

    if (error.name === 'NotReadableError') {
      return 'Your webcam is busy in another app or tab.';
    }

    if (error.name === 'NotSupportedError') {
      return 'This browser could not start the camera or local tracking model.';
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Eye & head tracking could not be started in this browser.';
}

function formatTrackingError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'unknown error';
}
