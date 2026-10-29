# Blender pinball asset

The three pinball bumper flowers are an original low-poly mesh generated with Blender 4.3.2 in the cloud. `scripts/create-pinball-blender-asset.py` recreates `src/arcade/games/midnight-pinball/assets/hibiscus.json` with `blender --background --factory-startup --python scripts/create-pinball-blender-asset.py`. The runtime uses real Three.js geometry and the existing static batching; no external textures or model bundles are used.

Pinball's objective strip also shows its existing live event feedback. Simulation and replay scoring are unchanged. TypeScript, 17 pinball tests, the focused desktop/touch capability checks and standalone build/asset checks passed. An additional desktop pinball rendering/control check passed its game assertions but the harness exited nonzero because the local leaderboard proxy was not running and returned HTTP 500. No live scores were submitted. Mobile layouts are emulated; physical devices are unverified.
