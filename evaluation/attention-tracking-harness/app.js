import {
  FaceLandmarker,
  FilesetResolver,
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34';

const HEAD_TRACKING_SAMPLE_MS = 220;
const HEAD_TRACKING_CALIBRATION_MS = 2800;
const HEAD_TRACKING_MIN_CALIBRATION_SAMPLES = 6;
const HEAD_TRACKING_MIN_Y = 0.12;
const HEAD_TRACKING_MAX_Y = 0.9;
const LEFT_EYE = { top: 159, bottom: 145, irisCenter: 468 };
const RIGHT_EYE = { top: 386, bottom: 374, irisCenter: 473 };
LEFT_EYE.outer = 33;
LEFT_EYE.inner = 133;
RIGHT_EYE.outer = 362;
RIGHT_EYE.inner = 263;
const MEDIAPIPE_WASM_URL =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const defaultPassage = `Reading should feel calm, steady, and understandable. Many readers lose their place when lines feel crowded or visually noisy. A guided line highlight can reduce tracking effort and help the reader stay anchored. Word-level support can also make unfamiliar vocabulary feel less intimidating. Sentence chunking lowers cognitive load by reducing how much has to be held in working memory at once. A privacy-first browser pipeline makes experimentation possible without sending camera frames to a server.`;

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
  sentences: [],
  targetIndex: 0,
  predictedIndex: null,
  pendingIndex: null,
  pendingHits: 0,
  calibrationStartedAt: null,
  calibrationSamples: [],
  learnedBaseline: null,
  calibrationAttempts: 0,
  totalSamples: 0,
  detectionSamples: 0,
  switchesDuringTracking: 0,
  trackingStartedAt: null,
  trials: [],
  participantId: '',
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
  stopCameraButton: document.getElementById('stopCameraButton'),
  previousTargetButton: document.getElementById('previousTargetButton'),
  nextTargetButton: document.getElementById('nextTargetButton'),
  captureTrialButton: document.getElementById('captureTrialButton'),
  exportJsonButton: document.getElementById('exportJsonButton'),
  exportCsvButton: document.getElementById('exportCsvButton'),
  resetSessionButton: document.getElementById('resetSessionButton'),
  previewVideo: document.getElementById('previewVideo'),
  readingSurface: document.getElementById('readingSurface'),
  statusValue: document.getElementById('statusValue'),
  targetValue: document.getElementById('targetValue'),
  predictionValue: document.getElementById('predictionValue'),
  calibrationAttemptsValue: document.getElementById('calibrationAttemptsValue'),
  detectionRateValue: document.getElementById('detectionRateValue'),
  exactAccuracyValue: document.getElementById('exactAccuracyValue'),
  adjacentAccuracyValue: document.getElementById('adjacentAccuracyValue'),
  meanOffsetValue: document.getElementById('meanOffsetValue'),
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
  state.sentences = splitIntoSentences(rawText);
  state.targetIndex = 0;
  state.predictedIndex = null;
  state.pendingIndex = null;
  state.pendingHits = 0;
  renderSentences();
  updateMetrics();
}

function splitIntoSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function renderSentences() {
  elements.readingSurface.innerHTML = '';

  state.sentences.forEach((sentence, index) => {
    const span = document.createElement('span');
    span.className = 'sentence';
    span.dataset.sentenceIndex = String(index);
    if (index === state.targetIndex) {
      span.classList.add('target');
    }
    if (index === state.predictedIndex) {
      span.classList.add('predicted');
    }
    span.textContent = `${sentence} `;
    elements.readingSurface.appendChild(span);
  });

  elements.targetValue.textContent = state.sentences.length
    ? `Sentence ${state.targetIndex + 1}`
    : 'None';

  elements.predictionValue.textContent =
    state.predictedIndex === null ? 'None' : `Sentence ${state.predictedIndex + 1}`;
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
  elements.calibrationBanner.classList.remove('hidden');
  setStatus('calibrating');
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

  if (landmarks) {
    state.detectionSamples += 1;
  }

  if (state.status === 'calibrating') {
    updateCalibration(landmarks, now);
    updateMetrics();
    return;
  }

  if (state.status === 'ready' || state.status === 'active') {
    setStatus('active');
    const predicted = getPredictedSentenceIndex(landmarks);
    if (predicted === null) {
      state.pendingIndex = null;
      state.pendingHits = 0;
      updateMetrics();
      return;
    }

    if (predicted !== state.pendingIndex) {
      state.pendingIndex = predicted;
      state.pendingHits = 1;
      updateMetrics();
      return;
    }

    state.pendingHits += 1;
    if (state.pendingHits >= state.trackingSettings.steadiness && predicted !== state.predictedIndex) {
      if (state.predictedIndex !== null) {
        state.switchesDuringTracking += 1;
      }
      state.predictedIndex = predicted;
      renderSentences();
    }
  }

  updateMetrics();
}

function updateCalibration(landmarks, now) {
  const faceCenterPoint = getTrackedFaceCenterPoint(landmarks);
  if (faceCenterPoint !== null) {
    state.calibrationSamples.push(faceCenterPoint);
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

  state.learnedBaseline = averagePoint(state.calibrationSamples);
  elements.calibrationBanner.classList.add('hidden');
  setStatus('active');
}

function getPredictedSentenceIndex(landmarks) {
  const attentionPoint = getTrackedAttentionPoint(landmarks);
  if (attentionPoint === null) {
    return null;
  }

  const sentenceElements = [...elements.readingSurface.querySelectorAll('[data-sentence-index]')];
  if (!sentenceElements.length) {
    return null;
  }

  const surfaceRect = elements.readingSurface.getBoundingClientRect();
  const targetY = surfaceRect.top + attentionPoint.y * surfaceRect.height;
  const targetX = surfaceRect.left + attentionPoint.x * surfaceRect.width;

  let nearestIndex = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  sentenceElements.forEach((element) => {
    const rect = element.getBoundingClientRect();
    if (rect.bottom < surfaceRect.top || rect.top > surfaceRect.bottom) {
      return;
    }

    const centerY = rect.top + rect.height / 2;
    const centerX = rect.left + rect.width / 2;
    const normalizedDy = Math.abs(centerY - targetY) / surfaceRect.height;
    const normalizedDx = Math.abs(centerX - targetX) / surfaceRect.width;
    const distance = normalizedDy * 1.8 + normalizedDx;

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = Number(element.dataset.sentenceIndex);
    }
  });

  return nearestIndex;
}

function getTrackedAttentionPoint(landmarks) {
  const faceCenterPoint = getTrackedFaceCenterPoint(landmarks);
  if (faceCenterPoint === null) {
    return null;
  }

  const baselineX = state.learnedBaseline?.x ?? 0.5;
  const baselineY = state.learnedBaseline?.y ?? 0.5;
  const headPoint = {
    x: clamp(0.5 + (faceCenterPoint.x - baselineX) * 0.9, 0.05, 0.95),
    y: clamp(
      state.trackingSettings.neutralLineHeight +
        (faceCenterPoint.y - baselineY) * state.trackingSettings.headSensitivity,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };

  const irisOffset = getIrisOffset(landmarks);
  if (irisOffset === null) {
    return headPoint;
  }

  return {
    x: clamp(headPoint.x + irisOffset.x * state.trackingSettings.eyeSensitivity, 0.05, 0.95),
    y: clamp(
      headPoint.y + irisOffset.y * state.trackingSettings.eyeSensitivity,
      HEAD_TRACKING_MIN_Y,
      HEAD_TRACKING_MAX_Y
    ),
  };
}

function getTrackedFaceCenterPoint(landmarks) {
  if (!landmarks?.length) {
    return null;
  }

  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (const landmark of landmarks) {
    minY = Math.min(minY, landmark.y);
    maxY = Math.max(maxY, landmark.y);
    minX = Math.min(minX, landmark.x);
    maxX = Math.max(maxX, landmark.x);
  }

  if (!Number.isFinite(minY) || !Number.isFinite(maxY) || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return null;
  }

  return {
    x: clamp((minX + maxX) / 2, 0, 1),
    y: clamp((minY + maxY) / 2, 0, 1),
  };
}

function getIrisOffset(landmarks) {
  if (!landmarks || landmarks.length <= RIGHT_EYE.irisCenter) {
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
  const top = landmarks[eye.top];
  const bottom = landmarks[eye.bottom];
  const iris = landmarks[eye.irisCenter];
  const outer = landmarks[eye.outer];
  const inner = landmarks[eye.inner];

  if (!top || !bottom || !iris || !outer || !inner) {
    return null;
  }

  const eyeHeight = bottom.y - top.y;
  if (Math.abs(eyeHeight) < 0.0001) {
    return null;
  }

  const eyeLeftX = Math.min(outer.x, inner.x);
  const eyeRightX = Math.max(outer.x, inner.x);
  const eyeWidth = eyeRightX - eyeLeftX;
  if (Math.abs(eyeWidth) < 0.0001) {
    return null;
  }

  const irisPosition = (iris.y - top.y) / eyeHeight;
  const irisHorizontalPosition = (iris.x - eyeLeftX) / eyeWidth;
  if (!Number.isFinite(irisPosition) || !Number.isFinite(irisHorizontalPosition)) {
    return null;
  }

  return {
    x: clamp(irisHorizontalPosition - 0.5, -1, 1),
    y: clamp(irisPosition - 0.5, -1, 1),
  };
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
  if (!state.sentences.length || state.predictedIndex === null) {
    return;
  }

  const offset = Math.abs(state.predictedIndex - state.targetIndex);
  state.trials.push({
    trial: state.trials.length + 1,
    targetIndex: state.targetIndex,
    predictedIndex: state.predictedIndex,
    offset,
    exact: offset === 0,
    adjacent: offset <= 1,
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
      <td>${trial.targetIndex + 1}</td>
      <td>${trial.predictedIndex + 1}</td>
      <td>${trial.offset}</td>
      <td>${trial.exact ? 'Yes' : 'No'}</td>
      <td>${trial.adjacent ? 'Yes' : 'No'}</td>
    `;
    elements.trialTableBody.appendChild(row);
  });
}

function updateMetrics() {
  const exactHits = state.trials.filter((trial) => trial.exact).length;
  const adjacentHits = state.trials.filter((trial) => trial.adjacent).length;
  const totalTrials = state.trials.length;
  const meanOffset = totalTrials
    ? state.trials.reduce((sum, trial) => sum + trial.offset, 0) / totalTrials
    : 0;
  const detectionRate = state.totalSamples
    ? (state.detectionSamples / state.totalSamples) * 100
    : 0;
  const elapsedMs = state.trackingStartedAt ? performance.now() - state.trackingStartedAt : 0;
  const jitter = elapsedMs > 0 ? state.switchesDuringTracking / (elapsedMs / 10000) : 0;

  elements.statusValue.textContent = capitalize(state.status);
  elements.calibrationAttemptsValue.textContent = String(state.calibrationAttempts);
  elements.detectionRateValue.textContent = `${detectionRate.toFixed(1)}%`;
  elements.exactAccuracyValue.textContent = totalTrials
    ? `${((exactHits / totalTrials) * 100).toFixed(1)}%`
    : '0%';
  elements.adjacentAccuracyValue.textContent = totalTrials
    ? `${((adjacentHits / totalTrials) * 100).toFixed(1)}%`
    : '0%';
  elements.meanOffsetValue.textContent = meanOffset.toFixed(2);
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
    trials: state.trials,
  };
  downloadFile(
    `${buildFilename('attention-eval')}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
}

function exportCsv() {
  const header = ['trial', 'target_index', 'predicted_index', 'offset', 'exact', 'adjacent', 'timestamp'];
  const rows = state.trials.map((trial) =>
    [
      trial.trial,
      trial.targetIndex,
      trial.predictedIndex,
      trial.offset,
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
  state.pendingIndex = null;
  state.pendingHits = 0;
  state.calibrationAttempts = 0;
  state.totalSamples = 0;
  state.detectionSamples = 0;
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

function averagePoint(values) {
  return values.length
    ? {
        x: values.reduce((sum, value) => sum + value.x, 0) / values.length,
        y: values.reduce((sum, value) => sum + value.y, 0) / values.length,
      }
    : { x: 0.5, y: 0.5 };
}

function capitalize(input) {
  return input.charAt(0).toUpperCase() + input.slice(1);
}
