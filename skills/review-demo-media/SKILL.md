---
name: review-demo-media
description: Assess whether kubeaquarium changes require refreshing README screenshots, GIF, poster, or demo video before delivery, PR, or release; regenerate and visually verify affected media.
---

# Review demo media

Read [demo maintenance](../../docs/demo-maintenance.md) for tracked build outputs,
the static demo base path, and the Pages publication trigger.

Before delivering a change, inspect its diff and the media referenced by README.md and other changed documentation. Record a short verdict: refreshed, still representative, or blocked, with the reason. Documentation-only and invisible internal changes usually need no new captures.

## Decide what changed

- Scene geometry, whale resource sizing, namespace placement, density, lighting, vehicle models, camera, HUD, radar, or responsive layout: review screenshots and every video chapter showing the affected feature.
- Demo mission, recovery states, controls, or visible wording: review the illustrated workflow, captions, and capture assertions together.
- Video typography or composition: rerender the video, poster, and GIF; recapture gameplay only if the source footage is outdated.
- Do not overwrite historical benchmark or validation evidence to make old reports look current. Create new evidence for the changed implementation.

## Capture and verify

Use the existing pipeline in [video/README.md](../../video/README.md), including its local simulated demo and network guards. Never point destructive demo interactions at a real cluster. Inspect the options in video/scripts/capture-visual.mjs before using it for screenshots.

For navigation, spacing, resource scaling, or vehicle changes, exercise sparse and crowded scenes, different resource usages, filtering, radar selection, and entering/leaving dive mode. Check overlap, traversable gaps, camera framing, stable positions after updates, and readable HUD at desktop and narrow sizes. Use the relevant existing checks under video/scripts/; extend them for new behavior rather than relying only on screenshots.

Record an actual simulated playthrough of the affected interactions. Watch it and inspect representative frames for clipping, abrupt movement, obstructed views, and misleading state transitions. Passing automated tests alone does not establish visual quality. If playback is unavailable, inspect sampled frames and explicitly report that limitation.

When gameplay changes, refresh source footage and observed beats together, then render the MP4, poster, and GIF using the documented commands. Check available disk space before rendering. Inspect final artifacts, verify links in README.md, and ensure captions describe the recorded behavior. Do not silently retain stale media when capture fails; report the blocker.

Keep the final verdict concise, identifying the affected assets and verification performed. This workflow does not authorize pushing, publishing, tagging, or merging.
