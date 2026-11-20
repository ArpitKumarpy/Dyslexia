import {
  FaceLandmarker,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34';

const HEAD_TRACKING_SAMPLE_MS = 80;
const RETURN_SWEEP_COOLDOWN_MS = 850;
const HEAD_TRACKING_CALIBRATION_MS = 2100;
const HEAD_TRACKING_MIN_CALIBRATION_SAMPLES = 12;
const HEAD_TRACKING_MIN_Y = 0.04;
const HEAD_TRACKING_MAX_Y = 0.96;

const LEFT_EYE = {
  topLids: [159, 158, 160],
  bottomLids: [145, 144, 153],
  iris: [468, 469, 470, 471, 472],
  outer: 33,
  inner: 133,
};

const RIGHT_EYE = {
  topLids: [386, 385, 387],
  bottomLids: [374, 373, 380],
  iris: [473, 474, 475, 476, 477],
  outer: 263,
  inner: 362,
};

const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const defaultPassage = `Reading should feel calm, steady, and understandable. Many readers lose their place when lines feel crowded or visually noisy. A guided line highlight can reduce tracking effort and help the reader stay anchored.

Word-level support can also make unfamiliar vocabulary feel less intimidating. Sentence chunking lowers cognitive load by reducing how much has to be held in working memory at once.

A privacy-first browser pipeline makes experimentation possible without sending camera frames to a server. Return-sweep detection helps advance smoothly from the end of one visual line to the start of the next line.`;

const state = {
  status: 'idle',
  stream: null,
  landmarker: null,
  rafId: null,
  lastSampleTime: 0,
  trackingSettings: {
    headSensitivity: 1.65,
    eyeSensitivity: 0.16,
    steadiness: 2,
    neutralLineHeight: 0.3,
  },
  segments: [],
  sentences: [],
  targetIndex: 0,
  predictedIndex: null,
  predictedLineIndex: null,
  predictedParagraphIndex: null,
  pendingKey: null,
  pendingHits: 0,
  calibrationStartedAt: null,
  calibrationSamples: [],
  learnedBaseline: null,
  latestHeadPose: null,
  previousHeadPose: null,
  lastValidIris: null,
  smoothedAttentionPoint: null,
  latestAttentionPoint: { x: 0.5, y: 0.3 },
  lineMaxProgressX: 0,
  lineSamplesCount: 0,
  lineRightHalfSamples: 0,
  returnSweepYOffset: 0,
  lastReturnSweepAt: 0,
  returnSweepsDetected: 0,
  calibrationAttempts: 0,
  totalSamples: 0,
  detectionSamples: 0,
  irisSamples: 0,
  switchesDuringTracking: 0,
  trackingStartedAt: null,
  trials: [],
};

const elements = {
  participantId: document.getElementById('participantId'),
  passageInput: document.getElementById('passageInput'),
  loadPassageButton: document.getElementById('loadPassageButton'),
  headSensitivity: document.getElementById('headSensitivity'),
  eyeSensitivity: document.getElementById('eyeSensitivity'),
  trackingSteadiness: document.getElementById('trackingSteadiness'),
  neutralHeight: document.getElementById('neutralHeight'),
  headSensitivityValue: document.getElementById('headSensitivityValue'),
  eyeSensitivityValue: document.getElementById('eyeSensitivityValue'),
  trackingSteadinessValue: document.getElementById('trackingSteadinessValue'),
  neutralHeightValue: document.getElementById('neutralHeightValue'),
  startCameraButton: document.getElementById('startCameraButton'),
  calibrateButton: document.getElementById('calibrateButton'),
  recenterButton: document.getElementById('recenterButton'),
  stopCameraButton: document.getElementById('stopCameraButton'),
  previousTargetButton: document.getElementById('previousTargetButton'),
  nextTargetButton: document.getElementById('nextTargetButton'),
  captureTrialButton: document.getElementById('captureTrialButton'),
  exportJsonButton: document.getElementById('exportJsonButton'),
  exportCsvButton: document.getElementById('exportCsvButton'),
  resetSessionButton: document.getElementById('resetSessionButton'),
  previewVideo: document.getElementById('previewVideo'),
  previewCanvas: document.getElementById('previewCanvas'),
  readingSurfaceWrapper: document.getElementById('readingSurfaceWrapper'),
  readingSurface: document.getElementById('readingSurface'),
  paragraphOverlay: document.getElementById('paragraphOverlay'),
  paragraphOverlayBadge: document.getElementById('paragraphOverlayBadge'),
  lineOverlay: document.getElementById('lineOverlay'),
  lineOverlayBadge: document.getElementById('lineOverlayBadge'),
  lineGazeDot: document.getElementById('lineGazeDot'),
  statusValue: document.getElementById('statusValue'),
  targetValue: document.getElementById('targetValue'),
  predictionValue: document.getElementById('predictionValue'),
  calibrationAttemptsValue: document.getElementById('calibrationAttemptsValue'),
  detectionRateValue: document.getElementById('detectionRateValue'),
  lineAccuracyValue: document.getElementById('lineAccuracyValue'),
  paragraphAccuracyValue: document.getElementById('paragraphAccuracyValue'),
  exactAccuracyValue: document.getElementById('exactAccuracyValue'),
  adjacentAccuracyValue: document.getElementById('adjacentAccuracyValue'),
  meanOffsetValue: document.getElementById('meanOffsetValue'),
  returnSweepsValue: document.getElementById('returnSweepsValue'),
  jitterValue: document.getElementById('jitterValue'),
  trialTableBody: document.getElementById('trialTableBody'),
  calibrationBanner: document.getElementById('calibrationBanner'),
};

init();

function init() {
  elements.passageInput.value = defaultPassage;
  loadPassage();
  bindEvents();
  updateControlLabels();
  updateMetrics();
}

function bindEvents() {
  elements.loadPassageButton.addEventListener('click', loadPassage);
  elements.startCameraButton.addEventListener('click', startCamera);
  elements.calibrateButton.addEventListener('click', beginCalibration);
  elements.recenterButton?.addEventListener('click', instantRecenter);
  elements.stopCameraButton.addEventListener('click', stopCamera);
  elements.previousTargetButton.addEventListener('click', () => shiftTarget(-1));
  elements.nextTargetButton.addEventListener('click', () => shiftTarget(1));
  elements.captureTrialButton.addEventListener('click', captureTrial);
  elements.exportJsonButton.addEventListener('click', exportJson);
  elements.exportCsvButton.addEventListener('click', exportCsv);
  elements.resetSessionButton.addEventListener('click', resetSession);

  elements.headSensitivity.addEventListener('input', updateTrackingSettingsFromInputs);
  elements.eyeSensitivity.addEventListener('input', updateTrackingSettingsFromInputs);
  elements.trackingSteadiness.addEventListener('input', updateTrackingSettingsFromInputs);
  elements.neutralHeight.addEventListener('input', updateTrackingSettingsFromInputs);

  elements.readingSurface.addEventListener('click', (event) => {
    const sentenceEl = event.target.closest('[data-sentence-index]');
    if (!sentenceEl) {
      return;
    }
    const idx = Number(sentenceEl.dataset.sentenceIndex);
    if (Number.isFinite(idx)) {
      state.targetIndex = idx;
      renderSentences();
      updateMetrics();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.code === 'KeyC') {
      event.preventDefault();
      instantRecenter();
    }
  });

  window.addEventListener('resize', () => {
    refreshOverlays();
  });
}

function updateTrackingSettingsFromInputs() {
  state.trackingSettings.headSensitivity = Number(elements.headSensitivity.value);
  state.trackingSettings.eyeSensitivity = Number(elements.eyeSensitivity.value);
  state.trackingSettings.steadiness = Number(elements.trackingSteadiness.value);
  state.trackingSettings.neutralLineHeight = Number(elements.neutralHeight.value);
  updateControlLabels();
}

function updateControlLabels() {
  elements.headSensitivityValue.textContent = state.trackingSettings.headSensitivity.toFixed(2);
  elements.eyeSensitivityValue.textContent = state.trackingSettings.eyeSensitivity.toFixed(2);
  elements.trackingSteadinessValue.textContent = `${state.trackingSettings.steadiness} hits`;
  elements.neutralHeightValue.textContent = `${Math.round(state.trackingSettings.neutralLineHeight * 100)}%`;
}

function loadPassage() {
  const rawText = elements.passageInput.value.trim();
  const { segments, sentences } = splitPassageIntoParagraphsAndSentences(rawText);
  state.segments = segments;
  state.sentences = sentences;
  state.targetIndex = 0;
  state.predictedIndex = null;
  state.predictedLineIndex = null;
  state.predictedParagraphIndex = null;
  state.pendingKey = null;
  state.pendingHits = 0;
  renderSentences();
  updateMetrics();
}

function splitPassageIntoParagraphsAndSentences(text) {
  const parts = text.split(/(\n+)/);
  const segments = [];
  const sentences = [];
  let sentenceIndex = 0;
  let paragraphIndex = 0;

  parts.forEach((part) => {
    if (!part) return;
    if (/^\n+$/.test(part)) {
      segments.push({ isNewline: true, text: part });
      return;
    }

    const pieces = part
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (!pieces.length) return;

    const currentParagraph = paragraphIndex++;
    pieces.forEach((piece, idx) => {
      const sIdx = sentenceIndex++;
      const textWithSpace = idx < pieces.length - 1 ? `${piece} ` : piece;
      segments.push({
        isNewline: false,
        sentenceIndex: sIdx,
        paragraphIndex: currentParagraph,
        text: textWithSpace,
      });
      sentences.push({
        sentenceIndex: sIdx,
        paragraphIndex: currentParagraph,
        text: piece,
      });
    });
  });

  return { segments, sentences };
}

function renderSentences() {
  elements.readingSurface.innerHTML = '';

  let currentParaSpan = null;
  let currentParaIdx = null;

  state.segments.forEach((segment) => {
    if (segment.isNewline) {
      currentParaSpan = null;
      currentParaIdx = null;
      elements.readingSurface.appendChild(document.createTextNode(segment.text));
      return;
    }

    if (currentParaSpan === null || currentParaIdx !== segment.paragraphIndex) {
      currentParaIdx = segment.paragraphIndex;
      currentParaSpan = document.createElement('span');
      currentParaSpan.className = 'paragraph-segment';
      currentParaSpan.dataset.paragraphIndex = String(currentParaIdx);
      if (
        state.predictedParagraphIndex !== null &&
        state.predictedParagraphIndex !== currentParaIdx
      ) {
        currentParaSpan.classList.add('muted-paragraph');
      }
      elements.readingSurface.appendChild(currentParaSpan);
    }

    const span = document.createElement('span');
    span.className = 'sentence';
    span.dataset.sentenceIndex = String(segment.sentenceIndex);
    span.dataset.paragraphIndex = String(segment.paragraphIndex);
    if (segment.sentenceIndex === state.targetIndex) {
      span.classList.add('target');
    }
    if (segment.sentenceIndex === state.predictedIndex) {
      span.classList.add('predicted');
    }
    span.textContent = segment.text;
    currentParaSpan.appendChild(span);
  });

  refreshOverlays();
}

function collectVisibleGeometry() {
  const wrapper = elements.readingSurfaceWrapper;
  const surface = elements.readingSurface;
  if (!wrapper || !surface) {
    return { visualLines: [], paragraphBoxes: [] };
  }

  const sentenceElements = [...surface.querySelectorAll('[data-sentence-index]')];
  const lineMergeThreshold = 12;
  const rawLines = [];

  sentenceElements.forEach((sentenceElement) => {
    const sentenceIndex = Number(sentenceElement.dataset.sentenceIndex);
    const paragraphIndex = Number(sentenceElement.dataset.paragraphIndex ?? '0');
    const rects = [...sentenceElement.getClientRects()];

    rects.forEach((rect) => {
      if (rect.width < 2 || rect.height < 4) {
        return;
      }

      const centerY = (rect.top + rect.bottom) / 2;
      let matchingLine = rawLines.find(
        (line) =>
          line.paragraphIndex === paragraphIndex &&
          Math.abs(line.centerY - centerY) <= lineMergeThreshold
      );

      if (!matchingLine) {
        matchingLine = {
          paragraphIndex,
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          centerY,
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

      const existing = matchingLine.fragmentsBySentence.get(sentenceIndex);
      if (existing) {
        existing.left = Math.min(existing.left, rect.left);
        existing.right = Math.max(existing.right, rect.right);
        existing.top = Math.min(existing.top, rect.top);
        existing.bottom = Math.max(existing.bottom, rect.bottom);
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
    });
  });

  rawLines.sort((a, b) => a.centerY - b.centerY);

  const visualLines = rawLines.map((line, index) => ({
    lineIndex: index,
    paragraphIndex: line.paragraphIndex,
    top: line.top,
    bottom: line.bottom,
    left: line.left,
    right: line.right,
    centerY: line.centerY,
    height: Math.max(16, line.bottom - line.top),
    fragments: [...line.fragmentsBySentence.values()].sort((a, b) => a.left - b.left),
  }));

  const paragraphMap = new Map();
  visualLines.forEach((line) => {
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
      });
    } else {
      existing.top = Math.min(existing.top, line.top);
      existing.bottom = Math.max(existing.bottom, line.bottom);
      existing.left = Math.min(existing.left, line.left);
      existing.right = Math.max(existing.right, line.right);
      existing.height = existing.bottom - existing.top;
      existing.width = existing.right - existing.left;
    }
  });

  return {
    visualLines,
    paragraphBoxes: [...paragraphMap.values()].sort((a, b) => a.paragraphIndex - b.paragraphIndex),
  };
}

function getTargetGeometryInfo() {
  const { visualLines } = collectVisibleGeometry();
  const targetLine =
    visualLines.find((line) =>
      line.fragments.some((fragment) => fragment.sentenceIndex === state.targetIndex)
    ) ?? visualLines[0] ?? null;

  return {
    sentenceIndex: state.targetIndex,
    lineIndex: targetLine ? targetLine.lineIndex : 0,
    paragraphIndex: targetLine ? targetLine.paragraphIndex : 0,
    lineObj: targetLine,
  };
}

function refreshOverlays() {
  const wrapper = elements.readingSurfaceWrapper;
  if (!wrapper) return;

  const { visualLines, paragraphBoxes } = collectVisibleGeometry();
  const targetInfo = getTargetGeometryInfo();

  elements.targetValue.textContent = state.sentences.length
    ? `S${targetInfo.sentenceIndex + 1} • L${targetInfo.lineIndex + 1} • P${targetInfo.paragraphIndex + 1}`
    : 'None';

  if (state.predictedLineIndex === null || !visualLines.length) {
    elements.predictionValue.textContent = 'None';
    elements.lineOverlay?.classList.add('hidden');
    elements.paragraphOverlay?.classList.add('hidden');
    return;
  }

  const activeLine =
    visualLines.find((l) => l.lineIndex === state.predictedLineIndex) ?? visualLines[0];
  const paragraphIndex = state.predictedParagraphIndex ?? activeLine.paragraphIndex;
  const sentenceIndex = state.predictedIndex ?? activeLine.fragments[0]?.sentenceIndex ?? 0;

  elements.predictionValue.textContent = `S${sentenceIndex + 1} • L${activeLine.lineIndex + 1} • P${paragraphIndex + 1}`;

  const wrapperRect = wrapper.getBoundingClientRect();
  const linePadX = 10;
  const linePadY = 3;
  const lineLeft = Math.max(8, activeLine.left - wrapperRect.left - linePadX);
  const lineWidth = Math.min(
    wrapperRect.width - lineLeft - 8,
    Math.max(120, activeLine.right - activeLine.left + linePadX * 2)
  );
  const lineTop = activeLine.top - wrapperRect.top - linePadY;
  const lineHeight = activeLine.height + linePadY * 2;

  if (elements.lineOverlay) {
    elements.lineOverlay.classList.remove('hidden');
    elements.lineOverlay.style.top = `${lineTop}px`;
    elements.lineOverlay.style.left = `${lineLeft}px`;
    elements.lineOverlay.style.width = `${lineWidth}px`;
    elements.lineOverlay.style.height = `${lineHeight}px`;
  }
  if (elements.lineOverlayBadge) {
    elements.lineOverlayBadge.textContent = `Line ${activeLine.lineIndex + 1}`;
  }
  if (elements.lineGazeDot) {
    const gazePct = clamp(state.latestAttentionPoint.x * 100, 4, 96);
    elements.lineGazeDot.style.left = `${gazePct}%`;
  }

  const activeParagraphBox = paragraphBoxes.find((p) => p.paragraphIndex === paragraphIndex);
  if (activeParagraphBox && elements.paragraphOverlay) {
    const paraPadX = 14;
    const paraPadY = 7;
    const paraLeft = Math.max(6, activeParagraphBox.left - wrapperRect.left - paraPadX);
    const paraWidth = Math.min(
      wrapperRect.width - paraLeft - 6,
      Math.max(160, activeParagraphBox.width + paraPadX * 2)
    );
    const paraTop = activeParagraphBox.top - wrapperRect.top - paraPadY;
    const paraHeight = activeParagraphBox.height + paraPadY * 2;

    elements.paragraphOverlay.classList.remove('hidden');
    elements.paragraphOverlay.style.top = `${paraTop}px`;
    elements.paragraphOverlay.style.left = `${paraLeft}px`;
    elements.paragraphOverlay.style.width = `${paraWidth}px`;
    elements.paragraphOverlay.style.height = `${paraHeight}px`;
    if (elements.paragraphOverlayBadge) {
      elements.paragraphOverlayBadge.textContent = `Paragraph ${paragraphIndex + 1}`;
    }
  } else {
    elements.paragraphOverlay?.classList.add('hidden');
  }
}

async function startCamera() {
  if (state.stream) {
    return;
  }

  try {
    setStatus('starting');
    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });

    elements.previewVideo.srcObject = state.stream;
    await elements.previewVideo.play();

    const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);
    state.landmarker = await createFaceLandmarkerWithFallback(filesetResolver);
    state.trackingStartedAt = performance.now();
    setStatus('ready');
    loop();
  } catch (error) {
    console.error(error);
    setStatus('error');
  }
}

async function createFaceLandmarkerWithFallback(filesetResolver) {
  try {
    return await FaceLandmarker.createFromOptions(filesetResolver, buildOptions('GPU'));
  } catch {
    return await FaceLandmarker.createFromOptions(filesetResolver, buildOptions('CPU'));
  }
}

function buildOptions(delegate) {
  return {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate,
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
  };
}

function beginCalibration() {
  if (!state.stream || !state.landmarker) {
    return;
  }

  state.calibrationAttempts += 1;
  state.calibrationStartedAt = performance.now();
  state.calibrationSamples = [];
  state.learnedBaseline = null;
  state.returnSweepYOffset = 0;
  elements.calibrationBanner.classList.remove('hidden');
  setStatus('calibrating');
  updateMetrics();
}

function instantRecenter() {
  if (!state.latestHeadPose) {
    return;
  }

  const targetInfo = getTargetGeometryInfo();
  const wrapperRect = elements.readingSurfaceWrapper.getBoundingClientRect();
  let targetNormY = state.trackingSettings.neutralLineHeight;
  if (targetInfo.lineObj && wrapperRect.height > 40) {
    targetNormY = clamp(
      (targetInfo.lineObj.centerY - wrapperRect.top) / wrapperRect.height,
      0.15,
      0.75
    );
    state.trackingSettings.neutralLineHeight = Math.round(targetNormY * 100) / 100;
    elements.neutralHeight.value = String(state.trackingSettings.neutralLineHeight);
    updateControlLabels();
  }

  state.learnedBaseline = {
    x: state.latestHeadPose.x,
    y: state.latestHeadPose.y,
    pitchRatio: state.latestHeadPose.pitchRatio,
    yawRatio: state.latestHeadPose.yawRatio,
    iod: state.latestHeadPose.iod,
    irisX: state.lastValidIris?.x ?? 0,
    irisY: state.lastValidIris?.y ?? 0,
  };
  state.returnSweepYOffset = 0;
  state.smoothedAttentionPoint = { x: 0.5, y: targetNormY };
  state.latestAttentionPoint = { x: 0.5, y: targetNormY };
  state.predictedIndex = targetInfo.sentenceIndex;
  state.predictedLineIndex = targetInfo.lineIndex;
  state.predictedParagraphIndex = targetInfo.paragraphIndex;
  elements.calibrationBanner.classList.add('hidden');
  setStatus('active');
  renderSentences();
  updateMetrics();
}

function loop() {
  cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(loop);

  if (!state.landmarker || elements.previewVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    return;
  }

  const now = performance.now();
  if (now - state.lastSampleTime < HEAD_TRACKING_SAMPLE_MS) {
    return;
  }

  state.lastSampleTime = now;
  state.totalSamples += 1;

  const result = state.landmarker.detectForVideo(elements.previewVideo, now);
  const landmarks = result?.faceLandmarks?.[0];
  const headPose = getTrackedFaceCenterPoint(landmarks);
  const irisOffset = getIrisOffset(landmarks);

  if (headPose) {
    state.previousHeadPose = state.latestHeadPose;
    state.latestHeadPose = headPose;
    state.detectionSamples += 1;
  }
  if (irisOffset) {
    state.lastValidIris = irisOffset;
    state.irisSamples += 1;
  }

  drawCameraPreview(landmarks, headPose, irisOffset);

  if (state.status === 'calibrating') {
    updateCalibration(headPose, irisOffset ?? state.lastValidIris, now);
    updateMetrics();
    return;
  }

  if (state.status === 'ready' || state.status === 'active') {
    setStatus('active');
    const selection = findTrackedSelection(headPose, irisOffset ?? state.lastValidIris, now);
    if (selection === null) {
      state.pendingKey = null;
      state.pendingHits = 0;
      updateMetrics();
      return;
    }

    state.latestAttentionPoint = selection.attentionPoint;

    if (selection.isReturnSweepAdvance) {
      state.returnSweepsDetected += 1;
      applySelection(selection);
      state.pendingKey = null;
      state.pendingHits = 0;
      updateMetrics();
      return;
    }

    const candidateKey = `${selection.lineIndex}:${selection.sentenceIndex}`;
    const currentKey = `${state.predictedLineIndex}:${state.predictedIndex}`;

    if (candidateKey === currentKey) {
      state.pendingKey = candidateKey;
      state.pendingHits = 0;
      refreshOverlays();
      updateMetrics();
      return;
    }

    if (candidateKey !== state.pendingKey) {
      state.pendingKey = candidateKey;
      state.pendingHits = 1;
      updateMetrics();
      return;
    }

    state.pendingHits += 1;
    if (state.pendingHits >= state.trackingSettings.steadiness) {
      if (state.predictedLineIndex !== null && state.predictedLineIndex !== selection.lineIndex) {
        state.switchesDuringTracking += 1;
      }
      applySelection(selection);
    }
  }

  updateMetrics();
}

function applySelection(selection) {
  const isLineChange = state.predictedLineIndex !== selection.lineIndex;
  state.predictedLineIndex = selection.lineIndex;
  state.predictedIndex = selection.sentenceIndex;
  state.predictedParagraphIndex = selection.paragraphIndex;

  if (isLineChange) {
    state.lineMaxProgressX = 0;
    state.lineSamplesCount = 0;
    state.lineRightHalfSamples = 0;
  }

  renderSentences();
}

function updateCalibration(headPose, irisOffset, now) {
  if (headPose !== null) {
    state.calibrationSamples.push({ head: headPose, iris: irisOffset });
  }

  const elapsed = now - state.calibrationStartedAt;
  if (elapsed < HEAD_TRACKING_CALIBRATION_MS) {
    return;
  }

  if (state.calibrationSamples.length < HEAD_TRACKING_MIN_CALIBRATION_SAMPLES) {
    state.calibrationStartedAt = performance.now();
    state.calibrationSamples = [];
    return;
  }

  const headSamples = state.calibrationSamples.map((s) => s.head);
  const irisSamples = state.calibrationSamples.map((s) => s.iris).filter(Boolean);

  const targetInfo = getTargetGeometryInfo();
  const wrapperRect = elements.readingSurfaceWrapper.getBoundingClientRect();
  if (targetInfo.lineObj && wrapperRect.height > 40) {
    const targetNormY = clamp(
      (targetInfo.lineObj.centerY - wrapperRect.top) / wrapperRect.height,
      0.15,
      0.75
    );
    state.trackingSettings.neutralLineHeight = Math.round(targetNormY * 100) / 100;
    elements.neutralHeight.value = String(state.trackingSettings.neutralLineHeight);
    updateControlLabels();
  }

  state.learnedBaseline = {
    x: average(headSamples.map((s) => s.x)),
    y: average(headSamples.map((s) => s.y)),
    pitchRatio: average(headSamples.map((s) => s.pitchRatio)),
    yawRatio: average(headSamples.map((s) => s.yawRatio)),
    iod: average(headSamples.map((s) => s.iod)),
    irisX: irisSamples.length ? average(irisSamples.map((s) => s.x)) : 0,
    irisY: irisSamples.length ? average(irisSamples.map((s) => s.y)) : 0,
  };
  state.smoothedAttentionPoint = {
    x: 0.5,
    y: state.trackingSettings.neutralLineHeight,
  };
  state.predictedIndex = targetInfo.sentenceIndex;
  state.predictedLineIndex = targetInfo.lineIndex;
  state.predictedParagraphIndex = targetInfo.paragraphIndex;
  elements.calibrationBanner.classList.add('hidden');
  setStatus('active');
  renderSentences();
}

function findTrackedSelection(headPose, irisOffset, now) {
  if (!headPose) {
    return null;
  }

  const baseRawPoint = getTrackedAttentionPoint(headPose, irisOffset);
  if (baseRawPoint === null) {
    return null;
  }

  const prevDeltaY = state.smoothedAttentionPoint
    ? Math.abs(baseRawPoint.y + state.returnSweepYOffset - state.smoothedAttentionPoint.y)
    : 0;
  state.returnSweepYOffset *= prevDeltaY > 0.045 ? 0.88 : 0.985;

  const rawPoint = {
    x: baseRawPoint.x,
    y: clamp(
      baseRawPoint.y + state.returnSweepYOffset,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };

  const smoothedPoint = smoothAttentionPoint(rawPoint, state.smoothedAttentionPoint);
  state.smoothedAttentionPoint = smoothedPoint;

  const { visualLines } = collectVisibleGeometry();
  if (!visualLines.length) {
    return null;
  }

  const wrapperRect = elements.readingSurfaceWrapper.getBoundingClientRect();
  const targetY = wrapperRect.top + smoothedPoint.y * wrapperRect.height;
  const targetX = wrapperRect.left + smoothedPoint.x * wrapperRect.width;

  const currentLine =
    state.predictedLineIndex !== null
      ? visualLines.find((l) => l.lineIndex === state.predictedLineIndex) ?? null
      : null;

  if (currentLine) {
    const lineWidth = Math.max(80, currentLine.right - currentLine.left);
    const progressX = clamp((targetX - currentLine.left) / lineWidth, 0, 1);
    const nextLine = visualLines.find((l) => l.lineIndex === currentLine.lineIndex + 1);

    const canSweep =
      nextLine !== undefined &&
      now - state.lastReturnSweepAt > RETURN_SWEEP_COOLDOWN_MS &&
      state.lineSamplesCount >= 3 &&
      state.lineRightHalfSamples >= 2 &&
      state.lineMaxProgressX >= 0.56 &&
      state.lineMaxProgressX - progressX >= 0.26 &&
      progressX <= 0.44 &&
      targetY >= currentLine.top - currentLine.height * 0.35 &&
      targetY <= nextLine.bottom + nextLine.height * 0.85;

    if (canSweep && nextLine) {
      state.lastReturnSweepAt = now;
      const nextNormY = clamp(
        (nextLine.centerY - wrapperRect.top) / Math.max(40, wrapperRect.height),
        0.15,
        0.85
      );
      state.returnSweepYOffset = clamp(nextNormY - baseRawPoint.y, -0.35, 0.35);
      const anchored = { x: smoothedPoint.x, y: nextNormY };
      state.smoothedAttentionPoint = anchored;

      return {
        lineIndex: nextLine.lineIndex,
        sentenceIndex: nextLine.fragments[0]?.sentenceIndex ?? 0,
        paragraphIndex: nextLine.paragraphIndex,
        attentionPoint: anchored,
        isReturnSweepAdvance: true,
      };
    }

    state.lineSamplesCount += 1;
    state.lineMaxProgressX = Math.max(state.lineMaxProgressX, progressX);
    if (progressX >= 0.48) {
      state.lineRightHalfSamples += 1;
    }

    if (
      state.previousHeadPose &&
      state.learnedBaseline &&
      state.lineSamplesCount >= 4 &&
      state.pendingHits === 0
    ) {
      const step = Math.hypot(
        headPose.x - state.previousHeadPose.x,
        headPose.y - state.previousHeadPose.y
      );
      if (step < 0.0032) {
        const lineNormY = clamp(
          (currentLine.centerY - wrapperRect.top) / Math.max(40, wrapperRect.height),
          0.15,
          0.85
        );
        const expectedDeltaY =
          (lineNormY - state.trackingSettings.neutralLineHeight) /
          Math.max(0.8, state.trackingSettings.headSensitivity * 1.1);
        const targetBaseY = clamp(headPose.y - expectedDeltaY, 0.1, 0.9);
        state.learnedBaseline.x += (headPose.x - state.learnedBaseline.x) * 0.004;
        state.learnedBaseline.yawRatio += (headPose.yawRatio - state.learnedBaseline.yawRatio) * 0.004;
        state.learnedBaseline.y += (targetBaseY - state.learnedBaseline.y) * 0.0028;
      }
    }
  }

  let selectedLine = null;
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

    visualLines.forEach((line) => {
      const dy =
        targetY < line.top
          ? line.top - targetY
          : targetY > line.bottom
            ? targetY - line.bottom
            : Math.abs(targetY - line.centerY) * 0.35;
      let sequentialBias = 0;
      if (currentLine) {
        const step = line.lineIndex - currentLine.lineIndex;
        if (step === 1) sequentialBias = -line.height * 0.1;
        else if (Math.abs(step) > 3) sequentialBias = line.height * 0.08;
      }
      const score = dy + sequentialBias;
      if (score < bestScore) {
        bestScore = score;
        bestLine = line;
      }
    });

    selectedLine = bestLine;
  }

  let selectedSentenceIndex = selectedLine.fragments[0]?.sentenceIndex ?? 0;
  let bestDx = Number.POSITIVE_INFINITY;

  selectedLine.fragments.forEach((fragment) => {
    const dx =
      targetX < fragment.left
        ? fragment.left - targetX
        : targetX > fragment.right
          ? targetX - fragment.right
          : 0;
    const bonus = fragment.sentenceIndex === state.predictedIndex ? -12 : 0;
    if (dx + bonus < bestDx) {
      bestDx = dx + bonus;
      selectedSentenceIndex = fragment.sentenceIndex;
    }
  });

  return {
    lineIndex: selectedLine.lineIndex,
    sentenceIndex: selectedSentenceIndex,
    paragraphIndex: selectedLine.paragraphIndex,
    attentionPoint: smoothedPoint,
  };
}

function smoothAttentionPoint(rawPoint, previousPoint) {
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

function getTrackedAttentionPoint(headPose, irisOffset) {
  if (headPose === null) {
    return null;
  }

  const baselineX = state.learnedBaseline?.x ?? 0.5;
  const baselineY = state.learnedBaseline?.y ?? 0.5;
  const basePitch = state.learnedBaseline?.pitchRatio ?? headPose.pitchRatio;
  const baseYaw = state.learnedBaseline?.yawRatio ?? headPose.yawRatio;
  const scale = state.learnedBaseline?.iod
    ? clamp(state.learnedBaseline.iod / Math.max(0.02, headPose.iod), 0.75, 1.35)
    : 1;

  const deltaX = (headPose.x - baselineX) * scale * 1.15 + (headPose.yawRatio - baseYaw) * 0.16;
  const deltaY = (headPose.y - baselineY) * scale * 1.1 + (headPose.pitchRatio - basePitch) * 0.22;

  const headPoint = {
    x: clamp(0.5 + deltaX * state.trackingSettings.headSensitivity, 0.04, 0.96),
    y: clamp(
      state.trackingSettings.neutralLineHeight +
        deltaY * state.trackingSettings.headSensitivity,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };

  if (irisOffset === null) {
    return headPoint;
  }

  const deltaIrisX = irisOffset.x - (state.learnedBaseline?.irisX ?? 0);
  const deltaIrisY = irisOffset.y - (state.learnedBaseline?.irisY ?? 0);

  return {
    x: clamp(headPoint.x + deltaIrisX * state.trackingSettings.eyeSensitivity * 1.35, 0.04, 0.96),
    y: clamp(
      headPoint.y + deltaIrisY * state.trackingSettings.eyeSensitivity * 1.45,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };
}

function getTrackedFaceCenterPoint(landmarks) {
  if (!landmarks || landmarks.length < 460) {
    return null;
  }

  const lOuter = landmarks[33];
  const lInner = landmarks[133];
  const rOuter = landmarks[263];
  const rInner = landmarks[362];
  const nose1 = landmarks[1];
  const nose4 = landmarks[4];

  if (!lOuter || !lInner || !rOuter || !rInner || !nose1 || !nose4) {
    return null;
  }

  const leftEye = { x: 1 - (lOuter.x + lInner.x) / 2, y: (lOuter.y + lInner.y) / 2 };
  const rightEye = { x: 1 - (rOuter.x + rInner.x) / 2, y: (rOuter.y + rInner.y) / 2 };
  const iod = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
  if (!Number.isFinite(iod) || iod < 0.015) {
    return null;
  }

  const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };
  const noseTip = { x: 1 - (nose1.x + nose4.x) / 2, y: (nose1.y + nose4.y) / 2 };

  return {
    x: clamp(0.55 * eyeMid.x + 0.45 * noseTip.x, 0, 1),
    y: clamp(0.55 * eyeMid.y + 0.45 * noseTip.y, 0, 1),
    pitchRatio: (noseTip.y - eyeMid.y) / iod,
    yawRatio: (noseTip.x - eyeMid.x) / iod,
    iod,
  };
}

function getIrisOffset(landmarks) {
  if (!landmarks || landmarks.length <= 477) {
    return null;
  }

  const left = getEyeOffset(landmarks, LEFT_EYE);
  const right = getEyeOffset(landmarks, RIGHT_EYE);

  if (left === null && right === null) {
    return null;
  }
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function getEyeOffset(landmarks, eye) {
  const outerRaw = landmarks[eye.outer];
  const innerRaw = landmarks[eye.inner];
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

  const topY = average(eye.topLids.map((idx) => landmarks[idx]?.y).filter(Number.isFinite));
  const bottomY = average(eye.bottomLids.map((idx) => landmarks[idx]?.y).filter(Number.isFinite));
  const eyeOpening = bottomY - topY;
  if (eyeOpening / eyeWidth < 0.14) {
    return null;
  }

  const irisX = average(eye.iris.map((idx) => 1 - landmarks[idx]?.x).filter(Number.isFinite));
  const irisY = average(eye.iris.map((idx) => landmarks[idx]?.y).filter(Number.isFinite));
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
  const openingVertical = (irisY - (topY + bottomY) / 2) / Math.max(eyeOpening, eyeWidth * 0.22);
  const combinedVertical = cornerVertical * 0.65 + openingVertical * 0.35;

  return {
    x: clamp(horizontalProjected * 3.0, -1, 1),
    y: clamp(combinedVertical * 3.2, -1, 1),
  };
}

function drawCameraPreview(landmarks, headPose, irisOffset) {
  const canvas = elements.previewCanvas;
  const video = elements.previewVideo;
  if (!canvas || !video) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = headPose ? 'rgba(167, 139, 250, 0.45)' : 'rgba(248, 113, 113, 0.45)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(w * 0.22, h * 0.12, w * 0.56, h * 0.72);
  ctx.setLineDash([]);

  if (!landmarks || landmarks.length < 460) {
    ctx.restore();
    return;
  }

  const toCanvas = (pt) => ({ x: (1 - pt.x) * w, y: pt.y * h });

  [LEFT_EYE, RIGHT_EYE].forEach((eye) => {
    const outer = toCanvas(landmarks[eye.outer]);
    const inner = toCanvas(landmarks[eye.inner]);
    const topLid = toCanvas(landmarks[eye.topLids[0]]);
    const bottomLid = toCanvas(landmarks[eye.bottomLids[0]]);

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(outer.x, outer.y);
    ctx.quadraticCurveTo((outer.x + inner.x) / 2, topLid.y - 2, inner.x, inner.y);
    ctx.quadraticCurveTo((outer.x + inner.x) / 2, bottomLid.y + 2, outer.x, outer.y);
    ctx.stroke();

    const irisCenter = toCanvas(landmarks[eye.iris[0]]);
    const irisRim = toCanvas(landmarks[eye.iris[1]]);
    const radius = clamp(Math.hypot(irisRim.x - irisCenter.x, irisRim.y - irisCenter.y), 3, 9);

    ctx.strokeStyle = irisOffset ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(irisCenter.x, irisCenter.y, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = irisOffset ? '#34d399' : '#fbbf24';
    ctx.beginPath();
    ctx.arc(irisCenter.x, irisCenter.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  });

  const bridge = toCanvas(landmarks[168]);
  const tip = toCanvas(landmarks[1]);
  ctx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(bridge.x, bridge.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  ctx.restore();
}

function shiftTarget(delta) {
  if (!state.sentences.length) {
    return;
  }

  state.targetIndex = clamp(state.targetIndex + delta, 0, state.sentences.length - 1);
  renderSentences();
  updateMetrics();
}

function captureTrial() {
  if (!state.sentences.length || state.predictedIndex === null || state.predictedLineIndex === null) {
    return;
  }

  const targetInfo = getTargetGeometryInfo();
  const sentenceOffset = Math.abs(state.predictedIndex - targetInfo.sentenceIndex);
  const lineOffset = Math.abs(state.predictedLineIndex - targetInfo.lineIndex);
  const paragraphOffset = Math.abs(
    (state.predictedParagraphIndex ?? 0) - targetInfo.paragraphIndex
  );

  state.trials.push({
    trial: state.trials.length + 1,
    targetIndex: targetInfo.sentenceIndex,
    predictedIndex: state.predictedIndex,
    targetLineIndex: targetInfo.lineIndex,
    predictedLineIndex: state.predictedLineIndex,
    targetParagraphIndex: targetInfo.paragraphIndex,
    predictedParagraphIndex: state.predictedParagraphIndex ?? 0,
    offset: sentenceOffset,
    lineOffset,
    paragraphOffset,
    exact: sentenceOffset === 0,
    adjacent: sentenceOffset <= 1,
    lineExact: lineOffset === 0,
    lineAdjacent: lineOffset <= 1,
    paragraphExact: paragraphOffset === 0,
    timestamp: new Date().toISOString(),
  });

  renderTrialTable();
  updateMetrics();
}

function renderTrialTable() {
  elements.trialTableBody.innerHTML = '';

  state.trials.forEach((trial) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${trial.trial}</td>
      <td>S${trial.targetIndex + 1} • L${trial.targetLineIndex + 1} • P${trial.targetParagraphIndex + 1}</td>
      <td>S${trial.predictedIndex + 1} • L${trial.predictedLineIndex + 1} • P${trial.predictedParagraphIndex + 1}</td>
      <td>${trial.lineOffset}</td>
      <td>${trial.lineExact ? 'Yes' : 'No'}</td>
      <td>${trial.lineAdjacent ? 'Yes' : 'No'}</td>
      <td>${trial.paragraphExact ? 'Yes' : 'No'}</td>
      <td>${trial.exact ? 'Yes' : 'No'}</td>
    `;
    elements.trialTableBody.appendChild(row);
  });
}

function updateMetrics() {
  const totalTrials = state.trials.length;
  const exactHits = state.trials.filter((trial) => trial.exact).length;
  const adjacentHits = state.trials.filter((trial) => trial.adjacent).length;
  const lineExactHits = state.trials.filter((trial) => trial.lineExact).length;
  const lineAdjacentHits = state.trials.filter((trial) => trial.lineAdjacent).length;
  const paragraphExactHits = state.trials.filter((trial) => trial.paragraphExact).length;

  const meanLineOffset = totalTrials
    ? state.trials.reduce((sum, trial) => sum + trial.lineOffset, 0) / totalTrials
    : 0;
  const detectionRate = state.totalSamples
    ? (state.detectionSamples / state.totalSamples) * 100
    : 0;
  const irisRate = state.detectionSamples
    ? (state.irisSamples / state.detectionSamples) * 100
    : 0;
  const elapsedMs = state.trackingStartedAt ? performance.now() - state.trackingStartedAt : 0;
  const jitter = elapsedMs > 0 ? state.switchesDuringTracking / (elapsedMs / 10000) : 0;

  elements.statusValue.textContent = capitalize(state.status);
  elements.calibrationAttemptsValue.textContent = String(state.calibrationAttempts);
  elements.detectionRateValue.textContent = `${detectionRate.toFixed(1)}% / ${irisRate.toFixed(1)}%`;

  if (elements.lineAccuracyValue) {
    elements.lineAccuracyValue.textContent = totalTrials
      ? `${((lineExactHits / totalTrials) * 100).toFixed(1)}% / ${((lineAdjacentHits / totalTrials) * 100).toFixed(1)}%`
      : '0% / 0%';
  }
  if (elements.paragraphAccuracyValue) {
    elements.paragraphAccuracyValue.textContent = totalTrials
      ? `${((paragraphExactHits / totalTrials) * 100).toFixed(1)}%`
      : '0%';
  }

  elements.exactAccuracyValue.textContent = totalTrials
    ? `${((exactHits / totalTrials) * 100).toFixed(1)}%`
    : '0%';
  elements.adjacentAccuracyValue.textContent = totalTrials
    ? `${((adjacentHits / totalTrials) * 100).toFixed(1)}%`
    : '0%';
  elements.meanOffsetValue.textContent = meanLineOffset.toFixed(2);
  if (elements.returnSweepsValue) {
    elements.returnSweepsValue.textContent = String(state.returnSweepsDetected);
  }
  elements.jitterValue.textContent = jitter.toFixed(2);
}

function exportJson() {
  const payload = {
    participantId: elements.participantId.value.trim(),
    timestamp: new Date().toISOString(),
    trackingSettings: state.trackingSettings,
    calibrationAttempts: state.calibrationAttempts,
    learnedBaseline: state.learnedBaseline,
    totalSamples: state.totalSamples,
    detectionSamples: state.detectionSamples,
    irisSamples: state.irisSamples,
    returnSweepsDetected: state.returnSweepsDetected,
    trials: state.trials,
  };
  downloadFile(
    `${buildFilename('attention-eval')}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
}

function exportCsv() {
  const header = [
    'trial',
    'target_sentence',
    'predicted_sentence',
    'target_line',
    'predicted_line',
    'target_paragraph',
    'predicted_paragraph',
    'line_offset',
    'line_exact',
    'line_adjacent',
    'paragraph_exact',
    'sentence_exact',
    'sentence_adjacent',
    'timestamp',
  ];
  const rows = state.trials.map((trial) =>
    [
      trial.trial,
      trial.targetIndex,
      trial.predictedIndex,
      trial.targetLineIndex,
      trial.predictedLineIndex,
      trial.targetParagraphIndex,
      trial.predictedParagraphIndex,
      trial.lineOffset,
      trial.lineExact,
      trial.lineAdjacent,
      trial.paragraphExact,
      trial.exact,
      trial.adjacent,
      trial.timestamp,
    ].join(',')
  );
  downloadFile(
    `${buildFilename('attention-eval-trials')}.csv`,
    [header.join(','), ...rows].join('\n'),
    'text/csv'
  );
}

function downloadFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildFilename(prefix) {
  const participant = elements.participantId.value.trim() || 'participant';
  return `${prefix}-${participant}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
}

function resetSession() {
  state.predictedIndex = null;
  state.predictedLineIndex = null;
  state.predictedParagraphIndex = null;
  state.pendingKey = null;
  state.pendingHits = 0;
  state.calibrationAttempts = 0;
  state.totalSamples = 0;
  state.detectionSamples = 0;
  state.irisSamples = 0;
  state.returnSweepsDetected = 0;
  state.switchesDuringTracking = 0;
  state.trackingStartedAt = performance.now();
  state.learnedBaseline = null;
  state.calibrationSamples = [];
  state.trials = [];
  elements.calibrationBanner.classList.add('hidden');
  renderSentences();
  renderTrialTable();
  updateMetrics();
}

function stopCamera() {
  cancelAnimationFrame(state.rafId);
  state.rafId = null;
  state.landmarker?.close?.();
  state.landmarker = null;

  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  elements.previewVideo.srcObject = null;
  setStatus('idle');
  elements.calibrationBanner.classList.add('hidden');
}

function setStatus(nextStatus) {
  state.status = nextStatus;
  updateMetrics();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function average(values) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0;
}

function capitalize(input) {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
