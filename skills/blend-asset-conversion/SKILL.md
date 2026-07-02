---
name: blend-asset-conversion
description: Convert Blender .blend assets into web-ready .glb files for kubeaquarium.
---

# Blend Asset Conversion

Use this when adding a `.blend` model to the web app.

## Requirements

- Blender must be installed locally, or `BLENDER_BIN` must point to a Blender executable.
- Keep original downloaded assets under `assets/source/`.
- Put exported runtime assets under `web/public/models/`.

## Convert

```bash
scripts/convert-blend-to-glb.sh assets/source/model.blend web/public/models/model.glb
```

To export one mesh by name:

```bash
scripts/convert-blend-to-glb.sh assets/source/model.blend web/public/models/model.glb MeshName
```

The script opens Blender headlessly, selects meshes, recenters the model, normalizes its largest dimension to 1, exports GLB, and prints the resulting file size.

## Verify

After conversion:

```bash
npm --prefix web run build
```

Then load the app and visually inspect the model in dive mode. Keep the asset lightweight; prefer low-poly CC0 assets.
