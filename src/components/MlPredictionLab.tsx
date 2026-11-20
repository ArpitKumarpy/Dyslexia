import { useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BrainCircuit,
  CheckCircle2,
  Cpu,
  FileText,
  RotateCcw,
  Sliders,
  Sparkles,
  X,
} from 'lucide-react';
import { normalizeWord } from '../utils/pronunciation';
import {
  evaluateZucoWordCognitiveLoad,
  getModelMetadata,
  ZUCO_ABLATION_TABLE_III,
  type AblationFeatureSet,
  type MlModelName,
  type WordBehavioralObservation,
} from '../utils/zucoFeatureModel';

interface MlPredictionLabProps {
  content: string;
  onLoadSamplePassage: () => void;
  wordObservations: Record<string, WordBehavioralObservation>;
  wordTtsPlayCounts: Record<string, number>;
  initialSelectedWord?: string | null;
  onClose: () => void;
}

const DEMO_DEFAULT_WORDS = [
  'reading',
  'comprehension',
  'phonological',
  'synchronized',
  'accessibility',
  'fragmentation',
  'multimodal',
  'orthographic',
];

export function MlPredictionLab({
  content,
  onLoadSamplePassage,
  wordObservations,
  wordTtsPlayCounts,
  initialSelectedWord,
  onClose,
}: MlPredictionLabProps) {
  const [selectedModel, setSelectedModel] = useState<MlModelName>('xgboost');
  const [selectedFeatureSet, setSelectedFeatureSet] = useState<AblationFeatureSet>('combined');

  const passageWords = useMemo(() => {
    const rawTokens = content.trim()
      ? content
          .split(/\s+/)
          .map((token) => ({
            raw: token,
            clean: normalizeWord(token).toLowerCase(),
          }))
          .filter((item) => item.clean.length >= 2)
      : DEMO_DEFAULT_WORDS.map((w) => ({ raw: w, clean: w }));
    return rawTokens.slice(0, 140);
  }, [content]);

  const [selectedWord, setSelectedWord] = useState<string>(() => {
    const cleanInit = initialSelectedWord ? normalizeWord(initialSelectedWord).toLowerCase() : '';
    if (cleanInit) {
      return cleanInit;
    }
    const longest = [...passageWords].sort((a, b) => b.clean.length - a.clean.length)[0];
    return longest?.clean ?? 'phonological';
  });

  const [simulatedOverride, setSimulatedOverride] = useState<{
    word: string;
    firstFixationDurationMs: number;
    gazeDurationMs: number;
    totalReadingTimeMs: number;
    goPastTimeMs: number;
  } | null>(null);

  const activeObservation = useMemo((): Partial<WordBehavioralObservation> => {
    if (simulatedOverride && simulatedOverride.word === selectedWord) {
      return {
        firstFixationDurationMs: simulatedOverride.firstFixationDurationMs,
        gazeDurationMs: simulatedOverride.gazeDurationMs,
        totalReadingTimeMs: simulatedOverride.totalReadingTimeMs,
        goPastTimeMs: simulatedOverride.goPastTimeMs,
        ttsReplays: Math.max(0, (wordTtsPlayCounts[selectedWord] ?? 0) - 1),
      };
    }

    const liveObs = wordObservations[selectedWord];
    return {
      ...liveObs,
      ttsReplays: Math.max(0, (wordTtsPlayCounts[selectedWord] ?? 0) - 1),
    };
  }, [selectedWord, simulatedOverride, wordObservations, wordTtsPlayCounts]);

  const activePrediction = useMemo(() => {
    return evaluateZucoWordCognitiveLoad(
      selectedWord,
      activeObservation,
      selectedModel,
      selectedFeatureSet
    );
  }, [selectedWord, activeObservation, selectedModel, selectedFeatureSet]);

  const passagePredictions = useMemo(() => {
    return passageWords.map((token, idx) => {
      const isSelected = token.clean === selectedWord;
      const obs = isSelected
        ? activeObservation
        : {
            ...wordObservations[token.clean],
            ttsReplays: Math.max(0, (wordTtsPlayCounts[token.clean] ?? 0) - 1),
          };
      const pred = evaluateZucoWordCognitiveLoad(
        token.clean,
        obs,
        selectedModel,
        selectedFeatureSet
      );
      return {
        key: `${idx}-${token.clean}`,
        raw: token.raw,
        clean: token.clean,
        prediction: pred,
      };
    });
  }, [
    passageWords,
    selectedWord,
    activeObservation,
    wordObservations,
    wordTtsPlayCounts,
    selectedModel,
    selectedFeatureSet,
  ]);

  const class1Count = passagePredictions.filter((p) => p.prediction.isDifficultClass1).length;
  const modelMeta = getModelMetadata(selectedModel, selectedFeatureSet);

  const applySimulationPreset = (preset: 'fluent' | 'moderate' | 'dyslexic_stall') => {
    if (preset === 'fluent') {
      setSimulatedOverride({
        word: selectedWord,
        firstFixationDurationMs: 160,
        gazeDurationMs: 185,
        totalReadingTimeMs: 195,
        goPastTimeMs: 210,
      });
    } else if (preset === 'moderate') {
      setSimulatedOverride({
        word: selectedWord,
        firstFixationDurationMs: 260,
        gazeDurationMs: 340,
        totalReadingTimeMs: 460,
        goPastTimeMs: 590,
      });
    } else {
      setSimulatedOverride({
        word: selectedWord,
        firstFixationDurationMs: 380,
        gazeDurationMs: 540,
        totalReadingTimeMs: 890,
        goPastTimeMs: 1240,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-950/60 p-2 backdrop-blur-sm sm:p-4">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[1.6rem] border border-stone-200 bg-stone-50 shadow-2xl sm:rounded-[2rem]">
        {/* Header */}
        <div className="border-b border-stone-200 bg-white px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-violet-900">
                  <BrainCircuit size={13} />
                  Synapse ML Prediction Lab
                </span>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                  ZuCo L1+L2 Corpus • 5-Fold GroupKFold CV
                </span>
                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
                  TreeSHAP (TreeExplainer)
                </span>
              </div>
              <h2 className="mt-1.5 text-xl font-bold text-stone-900 sm:text-2xl">
                Cognitive Difficulty Prediction &amp; SHAP Feature Attribution
              </h2>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-stone-700"
            >
              <X size={15} />
              Close Lab
            </button>
          </div>

          {/* Model & Ablation Controls (Paper Section VI-C & VI-D) */}
          <div className="mt-3.5 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-stone-500">
                  1. Tree Ensemble Classifier (Section VI-C)
                </span>
                <span className="font-mono text-[11px] font-semibold text-violet-800">
                  AUC: {modelMeta.meanAuc.toFixed(4)} • F1: {modelMeta.meanF1.toFixed(4)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'xgboost', label: 'XGBoost (Best)', sub: '800 trees, depth 6' },
                    { id: 'random_forest', label: 'Random Forest', sub: '500 trees, balanced' },
                    { id: 'gradient_boosting', label: 'Grad. Boosting', sub: '300 trees, lr 0.05' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedModel(item.id)}
                    className={`rounded-xl px-2.5 py-2 text-left transition-all ${
                      selectedModel === item.id
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <p className="text-xs font-bold">{item.label}</p>
                    <p
                      className={`mt-0.5 text-[10px] ${
                        selectedModel === item.id ? 'text-violet-100' : 'text-stone-500'
                      }`}
                    >
                      {item.sub}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold uppercase tracking-wider text-stone-500">
                  2. Ablation Study Feature Set (Table III)
                </span>
                <span className="text-[11px] font-medium text-stone-600">
                   Behavioral Dominance: <strong>{activePrediction.behavioralDominancePct}%</strong>
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    {
                      id: 'combined',
                      label: 'Combined (Full)',
                      sub: 'Gaze + Lexical (0.9989)',
                    },
                    {
                      id: 'gaze_only',
                      label: 'Gaze Only',
                      sub: '4 Oculomotor (0.9988)',
                    },
                    {
                      id: 'lexical_only',
                      label: 'Lexical Only',
                      sub: '3 Static Text (0.6432)',
                    },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedFeatureSet(item.id)}
                    className={`rounded-xl px-2.5 py-2 text-left transition-all ${
                      selectedFeatureSet === item.id
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100'
                    }`}
                  >
                    <p className="text-xs font-bold">{item.label}</p>
                    <p
                      className={`mt-0.5 text-[10px] ${
                        selectedFeatureSet === item.id ? 'text-stone-300' : 'text-stone-500'
                      }`}
                    >
                      {item.sub}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-5 lg:grid-cols-12">
            {/* Left Column (7 cols): Live Passage Cognitive Load Heatmap & Interactive Simulator */}
            <div className="space-y-5 lg:col-span-7">
              {/* Live Token Heatmap */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Live Passage Token Classification
                    </p>
                    <h3 className="mt-0.5 text-base font-bold text-stone-900">
                      Click any word to inspect its Tree Ensemble &amp; SHAP prediction
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 font-semibold text-rose-800">
                      Class 1 (≥75th pct): {class1Count} words
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">
                      Class 0: {Math.max(0, passagePredictions.length - class1Count)} words
                    </span>
                  </div>
                </div>

                {!content.trim() && (
                  <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-violet-50 px-3.5 py-2.5 text-xs text-violet-950">
                    <span>
                      Showing sample vocabulary tokens. Load the full research passage into the editor to test live document tokens.
                    </span>
                    <button
                      type="button"
                      onClick={onLoadSamplePassage}
                      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 font-semibold text-white hover:bg-violet-700"
                    >
                      <FileText size={13} />
                      Load Sample Passage
                    </button>
                  </div>
                )}

                <div className="mt-3 flex max-h-52 flex-wrap gap-1.5 overflow-y-auto rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/80">
                  {passagePredictions.map((item) => {
                    const isSelected = item.clean === selectedWord;
                    const isClass1 = item.prediction.isDifficultClass1;
                    const pct = Math.round(item.prediction.stressPercentile * 100);
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setSelectedWord(item.clean)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-all ${
                          isSelected
                            ? 'bg-violet-700 font-bold text-white ring-2 ring-violet-400'
                            : isClass1
                              ? 'bg-rose-100 text-rose-900 ring-1 ring-rose-300 hover:bg-rose-200'
                              : 'bg-white text-stone-800 ring-1 ring-stone-200 hover:bg-stone-100'
                        }`}
                        title={`P(Class 1) = ${pct}%`}
                      >
                        <span>{item.raw}</span>
                        <span
                          className={`rounded px-1 text-[10px] font-bold ${
                            isSelected
                              ? 'bg-violet-900 text-violet-100'
                              : isClass1
                                ? 'bg-rose-200/80 text-rose-900'
                                : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {pct}%
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interactive "What-If" Gaze & Behavioral Feature Simulator */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sliders size={16} className="text-violet-600" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Interactive Presentation Simulator
                      </p>
                      <h3 className="text-base font-bold text-stone-900">
                        Test Gaze &amp; Behavioral Inputs for &ldquo;{selectedWord}&rdquo;
                      </h3>
                    </div>
                  </div>
                  {simulatedOverride && simulatedOverride.word === selectedWord && (
                    <button
                      type="button"
                      onClick={() => setSimulatedOverride(null)}
                      className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-200"
                    >
                      <RotateCcw size={12} />
                      Reset to Live Reading Data
                    </button>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => applySimulationPreset('fluent')}
                    className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200 hover:bg-emerald-100"
                  >
                    Preset 1: Fluent First-Pass Scan (~195 ms)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySimulationPreset('moderate')}
                    className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100"
                  >
                    Preset 2: Moderate Decoding Refixation (~460 ms)
                  </button>
                  <button
                    type="button"
                    onClick={() => applySimulationPreset('dyslexic_stall')}
                    className="rounded-xl bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-900 ring-1 ring-rose-200 hover:bg-rose-100"
                  >
                    Preset 3: High Cognitive Friction + Regression (~890 ms)
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
                    <div className="flex justify-between text-xs font-semibold text-stone-800">
                      <span>word_total_reading_time (TRT)</span>
                      <span className="font-mono text-violet-700">
                        {activePrediction.features.word_total_reading_time} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="110"
                      max="1400"
                      step="15"
                      value={activePrediction.features.word_total_reading_time}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSimulatedOverride({
                          word: selectedWord,
                          firstFixationDurationMs:
                            activePrediction.features.word_first_fixation_duration,
                          gazeDurationMs: activePrediction.features.word_gaze_duration,
                          totalReadingTimeMs: val,
                          goPastTimeMs: Math.max(val, activePrediction.features.word_go_past_time),
                        });
                      }}
                      className="mt-2 w-full"
                    />
                  </div>

                  <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
                    <div className="flex justify-between text-xs font-semibold text-stone-800">
                      <span>word_go_past_time (GPT)</span>
                      <span className="font-mono text-violet-700">
                        {activePrediction.features.word_go_past_time} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="120"
                      max="1800"
                      step="20"
                      value={activePrediction.features.word_go_past_time}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSimulatedOverride({
                          word: selectedWord,
                          firstFixationDurationMs:
                            activePrediction.features.word_first_fixation_duration,
                          gazeDurationMs: activePrediction.features.word_gaze_duration,
                          totalReadingTimeMs: Math.min(
                            val,
                            activePrediction.features.word_total_reading_time
                          ),
                          goPastTimeMs: val,
                        });
                      }}
                      className="mt-2 w-full"
                    />
                  </div>

                  <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
                    <div className="flex justify-between text-xs font-semibold text-stone-800">
                      <span>word_first_fixation_duration (FFD)</span>
                      <span className="font-mono text-violet-700">
                        {activePrediction.features.word_first_fixation_duration} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="90"
                      max="700"
                      step="10"
                      value={activePrediction.features.word_first_fixation_duration}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSimulatedOverride({
                          word: selectedWord,
                          firstFixationDurationMs: val,
                          gazeDurationMs: Math.max(val, activePrediction.features.word_gaze_duration),
                          totalReadingTimeMs: Math.max(
                            val,
                            activePrediction.features.word_total_reading_time
                          ),
                          goPastTimeMs: Math.max(val, activePrediction.features.word_go_past_time),
                        });
                      }}
                      className="mt-2 w-full"
                    />
                  </div>

                  <div className="rounded-2xl bg-stone-50 p-3 ring-1 ring-stone-200/70">
                    <div className="flex justify-between text-xs font-semibold text-stone-800">
                      <span>word_gaze_duration (GD)</span>
                      <span className="font-mono text-violet-700">
                        {activePrediction.features.word_gaze_duration} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min="100"
                      max="950"
                      step="15"
                      value={activePrediction.features.word_gaze_duration}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setSimulatedOverride({
                          word: selectedWord,
                          firstFixationDurationMs: Math.min(
                            val,
                            activePrediction.features.word_first_fixation_duration
                          ),
                          gazeDurationMs: val,
                          totalReadingTimeMs: Math.max(
                            val,
                            activePrediction.features.word_total_reading_time
                          ),
                          goPastTimeMs: Math.max(val, activePrediction.features.word_go_past_time),
                        });
                      }}
                      className="mt-2 w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Paper Table III Ablation Study Results */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} className="text-violet-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Paper Table III Benchmark Verification
                    </p>
                    <h3 className="text-base font-bold text-stone-900">
                      5-Fold Grouped Cross-Validation Ablation Study (ZuCo Corpus)
                    </h3>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-2 pr-3">Feature Set</th>
                        <th className="py-2 pr-3">Model</th>
                        <th className="py-2 pr-3">Mean AUC</th>
                        <th className="py-2 pr-3">Mean F1</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ZUCO_ABLATION_TABLE_III.map((row) => {
                        const isCurrent =
                          row.model === selectedModel && row.featureSet === selectedFeatureSet;
                        return (
                          <tr
                            key={`${row.featureSet}-${row.model}`}
                            onClick={() => {
                              setSelectedModel(row.model);
                              setSelectedFeatureSet(row.featureSet);
                            }}
                            className={`cursor-pointer border-b border-stone-100 transition-colors ${
                              isCurrent
                                ? 'bg-violet-50 font-bold text-violet-950'
                                : 'hover:bg-stone-50'
                            }`}
                          >
                            <td className="py-2 pr-3">{row.featureSetLabel}</td>
                            <td className="py-2 pr-3">{row.modelLabel}</td>
                            <td className="py-2 pr-3 font-mono">{row.meanAuc.toFixed(4)}</td>
                            <td className="py-2 pr-3 font-mono">{row.meanF1.toFixed(4)}</td>
                            <td className="py-2">
                              {isCurrent ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                                  <CheckCircle2 size={10} /> Active
                                </span>
                              ) : row.isBest ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                  Paper Best
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right Column (5 cols): Tree Ensemble Decision Output & Fig. 4 TreeSHAP Chart */}
            <div className="space-y-5 lg:col-span-5">
              {/* Prediction Output Card */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Word-Level Cognitive Load Output
                    </p>
                    <h3 className="mt-1 text-2xl font-bold text-stone-900">
                      &ldquo;{activePrediction.word}&rdquo;
                    </h3>
                  </div>
                  <span
                    className={`rounded-2xl px-3 py-1.5 text-xs font-bold ${
                      activePrediction.isDifficultClass1
                        ? 'bg-rose-100 text-rose-800 ring-1 ring-rose-300'
                        : 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300'
                    }`}
                  >
                    {activePrediction.predictedLoadLabel}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-2xl bg-stone-50 p-2.5 ring-1 ring-stone-200/70">
                    <p className="text-[10px] font-semibold uppercase text-stone-500">
                      Stress Quantile
                    </p>
                    <p className="mt-1 text-lg font-bold text-stone-900">
                      {Math.round(activePrediction.stressPercentile * 100)}th pct
                    </p>
                    <p className="text-[10px] text-stone-500">Threshold: ≥75th</p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-2.5 ring-1 ring-stone-200/70">
                    <p className="text-[10px] font-semibold uppercase text-stone-500">
                      Tree Log-Odds f(x)
                    </p>
                    <p className="mt-1 font-mono text-lg font-bold text-violet-700">
                      {activePrediction.rawLogOdds >= 0
                        ? `+${activePrediction.rawLogOdds.toFixed(2)}`
                        : activePrediction.rawLogOdds.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-stone-500">
                      Base E[f(x)]: {activePrediction.baseLogOdds.toFixed(2)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-stone-50 p-2.5 ring-1 ring-stone-200/70">
                    <p className="text-[10px] font-semibold uppercase text-stone-500">
                      Gaze Dominance
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-700">
                      {activePrediction.behavioralDominancePct}%
                    </p>
                    <p className="text-[10px] text-stone-500">
                      Lexical: {100 - activePrediction.behavioralDominancePct}%
                    </p>
                  </div>
                </div>

                {/* Progress bar showing 75th percentile Class 1 cutoff */}
                <div className="mt-4">
                  <div className="flex justify-between text-[11px] font-semibold">
                    <span className="text-emerald-700">Class 0 (Baseline &lt; 0.75)</span>
                    <span className="text-rose-700">Class 1 (is_difficult ≥ 0.75)</span>
                  </div>
                  <div className="relative mt-1.5 h-3 overflow-hidden rounded-full bg-stone-200">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        activePrediction.isDifficultClass1 ? 'bg-rose-600' : 'bg-emerald-600'
                      }`}
                      style={{ width: `${Math.round(activePrediction.stressPercentile * 100)}%` }}
                    />
                    <div
                      className="absolute bottom-0 top-0 w-0.5 bg-stone-900"
                      style={{ left: '75%' }}
                      title="75th Percentile Class 1 Threshold (Section VI-A)"
                    />
                  </div>
                </div>
              </div>

              {/* Paper Fig. 4 TreeSHAP Feature Attribution Chart */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-violet-600" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                        Paper Fig. 4 • TreeExplainer API
                      </p>
                      <h3 className="text-base font-bold text-stone-900">
                        SHAP Value (Impact on Model Output)
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 space-y-2.5">
                  {activePrediction.shapContributions.map((item) => {
                    // Scale -4 to +8 log-odds impact across centered axis (zero at 33% from left)
                    const zeroLeftPct = 33;
                    const maxPos = 7.5;
                    const maxNeg = 3.75;
                    const isPositive = item.shapImpact >= 0;
                    const barWidthPct = isPositive
                      ? Math.min(100 - zeroLeftPct, (item.shapImpact / maxPos) * (100 - zeroLeftPct))
                      : Math.min(zeroLeftPct, (Math.abs(item.shapImpact) / maxNeg) * zeroLeftPct);
                    const barLeftPct = isPositive ? zeroLeftPct : zeroLeftPct - barWidthPct;

                    return (
                      <div key={item.feature} className="rounded-xl bg-stone-50 p-2.5 ring-1 ring-stone-200/70">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`inline-block h-2 w-2 rounded-full ${
                                item.category === 'behavioral' ? 'bg-violet-600' : 'bg-amber-500'
                              }`}
                            />
                            <span className="font-mono font-bold text-stone-900">{item.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-stone-500">
                              {item.rawValue} (z={item.normalizedZ >= 0 ? `+${item.normalizedZ}` : item.normalizedZ})
                            </span>
                            <span
                              className={`font-mono text-xs font-bold ${
                                item.shapImpact > 0.05
                                  ? 'text-rose-700'
                                  : item.shapImpact < -0.05
                                    ? 'text-sky-700'
                                    : 'text-stone-500'
                              }`}
                            >
                              {item.shapImpact >= 0 ? `+${item.shapImpact.toFixed(2)}` : item.shapImpact.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="relative mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-stone-200">
                          <div
                            className="absolute bottom-0 top-0 w-px bg-stone-500"
                            style={{ left: `${zeroLeftPct}%` }}
                          />
                          <div
                            className={`absolute bottom-0 top-0 rounded-full transition-all duration-150 ${
                              isPositive
                                ? item.category === 'behavioral'
                                  ? 'bg-rose-500'
                                  : 'bg-amber-500'
                                : 'bg-sky-500'
                            }`}
                            style={{
                              left: `${barLeftPct}%`,
                              width: `${Math.max(2, barWidthPct)}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between text-[10px] font-medium text-stone-500">
                  <span>← Negative SHAP (Pushes to Class 0 Baseline)</span>
                  <span>0.0</span>
                  <span>Positive SHAP (Pushes to Class 1 Difficult) →</span>
                </div>
              </div>

              {/* Active Decision Tree Ensemble Rules */}
              <div className="rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <Cpu size={16} className="text-violet-600" />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">
                      Decision Tree Ensemble Traversal
                    </p>
                    <h3 className="text-sm font-bold text-stone-900">
                      Fired Tree Split Paths for &ldquo;{activePrediction.word}&rdquo;
                    </h3>
                  </div>
                </div>

                <div className="mt-2.5 space-y-1.5">
                  {activePrediction.activeTreeRules.map((rule) => (
                    <div
                      key={rule.treeId}
                      className="flex items-center justify-between gap-2 rounded-xl bg-stone-50 px-3 py-2 text-xs ring-1 ring-stone-200/70"
                    >
                      <span className="text-stone-700">
                        <strong className="text-stone-900">Tree #{rule.treeId}:</strong> {rule.summary}
                      </span>
                      <span
                        className={`shrink-0 font-mono font-bold ${
                          rule.leafWeight >= 0 ? 'text-rose-700' : 'text-sky-700'
                        }`}
                      >
                        {rule.leafWeight >= 0 ? `+${rule.leafWeight.toFixed(2)}` : rule.leafWeight.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                  <Sparkles size={12} className="text-violet-600" />
                  Hyperparameters: {modelMeta.hyperparameters}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
