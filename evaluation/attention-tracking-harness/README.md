# Attention Tracking Evaluation Harness

This directory contains a standalone browser-based evaluation tool for the Synapse head + iris tracking pipeline. It is intentionally separate from the main application so that research instrumentation does not affect the production reading interface.

## Purpose

Use this harness to collect evaluation data for:

- calibration success
- face detection availability
- exact sentence-selection accuracy
- adjacent-sentence accuracy
- mean sentence offset
- highlight jitter, measured as switches per 10 seconds

## What it measures

The harness reproduces the same high-level tracking logic used in the main reader:

- MediaPipe face + iris landmarks
- adaptive baseline calibration
- head-motion mapping
- iris blending
- user-adjustable sensitivity
- sentence nearest-neighbor selection
- steadiness / hysteresis before switching

## How to run

Serve the directory over HTTP or HTTPS. Do not open `index.html` directly as a `file://` page because camera access and ES modules are more reliable in a served context.

Examples:

```powershell
cd evaluation\attention-tracking-harness
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

## Suggested protocol

1. Load a passage.
2. Start the camera.
3. Run calibration.
4. Ask the participant to focus on the highlighted target sentence.
5. Wait until the predicted sentence stabilizes.
6. Click `Capture Trial`.
7. Move to the next target and repeat.
8. Export JSON or CSV at the end of the session.

## Recommended evaluation outputs

- Exact accuracy:
  percentage of trials where predicted sentence equals target sentence
- Adjacent accuracy:
  percentage of trials where prediction is within one sentence of target
- Mean offset:
  average absolute difference between target and predicted sentence index
- Face detection rate:
  detected samples divided by total tracking samples
- Jitter:
  number of prediction switches per 10 seconds during active tracking

## Notes

- The harness uses CDN-hosted MediaPipe runtime and model assets.
- No backend is required.
- No webcam frames are uploaded anywhere.
- Exported JSON includes settings, baseline, and per-trial results.
