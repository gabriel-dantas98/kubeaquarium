#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "usage: $0 <input.blend> <output.glb> [object-name]" >&2
  exit 2
fi

input="$1"
output="$2"
object_name="${3:-}"

if [[ ! -f "$input" ]]; then
  echo "input file not found: $input" >&2
  exit 1
fi

blender_bin="${BLENDER_BIN:-}"
if [[ -z "$blender_bin" ]]; then
  if command -v blender >/dev/null 2>&1; then
    blender_bin="$(command -v blender)"
  elif [[ -x "/Applications/Blender.app/Contents/MacOS/Blender" ]]; then
    blender_bin="/Applications/Blender.app/Contents/MacOS/Blender"
  else
    echo "blender not found. Install Blender or set BLENDER_BIN=/path/to/blender" >&2
    exit 1
  fi
fi

mkdir -p "$(dirname "$output")"

tmp_script="$(mktemp -t kubeaquarium-blend-export.XXXXXX.py)"
trap 'rm -f "$tmp_script"' EXIT

cat > "$tmp_script" <<'PY'
import bpy
import math
import os
import sys

argv = sys.argv
args = argv[argv.index("--") + 1:]
input_path, output_path = args[0], args[1]
object_name = args[2] if len(args) > 2 else ""

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete()
bpy.ops.wm.open_mainfile(filepath=input_path)

for obj in bpy.context.scene.objects:
    obj.select_set(False)

mesh_objects = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
if object_name:
    selected = [obj for obj in mesh_objects if obj.name == object_name]
    if not selected:
        raise SystemExit("object not found: %s" % object_name)
else:
    selected = mesh_objects

if not selected:
    raise SystemExit("no mesh objects found in %s" % input_path)

for obj in selected:
    obj.select_set(True)

bpy.context.view_layer.objects.active = selected[0]

min_v = [float("inf")] * 3
max_v = [float("-inf")] * 3
import mathutils
for obj in selected:
    for corner in obj.bound_box:
        world = obj.matrix_world @ mathutils.Vector(corner)
        for i in range(3):
            min_v[i] = min(min_v[i], world[i])
            max_v[i] = max(max_v[i], world[i])

center = mathutils.Vector(((min_v[0] + max_v[0]) / 2, (min_v[1] + max_v[1]) / 2, (min_v[2] + max_v[2]) / 2))
size = max(max_v[0] - min_v[0], max_v[1] - min_v[1], max_v[2] - min_v[2])
scale = 1.0 / size if size > 0 else 1.0

root = bpy.data.objects.new("kubeaquarium_asset_root", None)
bpy.context.collection.objects.link(root)
for obj in selected:
    obj.parent = root

root.location = -center
root.scale = (scale, scale, scale)
root.select_set(True)
bpy.context.view_layer.objects.active = root

bpy.ops.export_scene.gltf(
    filepath=output_path,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=True,
)
PY

"$blender_bin" --background --factory-startup --python "$tmp_script" -- "$input" "$output" "$object_name"
ls -lh "$output"
