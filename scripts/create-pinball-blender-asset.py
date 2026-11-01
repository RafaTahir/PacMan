"""Generate an original low-poly hibiscus ornament. Run with Blender --background --python.

Two overlapping rings of cupped, ruffled petals around a stamen column with anthers.
Writes the runtime mesh (hibiscus.json), the editable project (hibiscus.blend) and,
when HIBISCUS_PREVIEW is set, a PNG preview render.
"""
import bpy, bmesh, json, math, os
from mathutils import Matrix, Vector

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

PETAL_U, PETAL_V = 6, 7


def petal_mesh(name, length, width, lift, cup, ruffle):
    """Curved petal surface: narrow base, broad rounded tip, cupped edges, lifted tip."""
    bm = bmesh.new()
    grid = [[None] * (PETAL_U + 1) for _ in range(PETAL_V + 1)]
    for j in range(PETAL_V + 1):
        t = j / PETAL_V
        span = width * (0.28 + 0.72 * math.sin(math.pi * min(t * 1.04, 1.0)) ** 0.8) * max(0.0, 1.0 - t ** 7) ** 0.5
        for i in range(PETAL_U + 1):
            s = i / PETAL_U * 2 - 1
            x = 0.05 + t * length
            y = s * span
            z = lift * t ** 1.6 + cup * s * s * t + ruffle * math.sin(s * 4.2 + t * 2.0) * t ** 2
            grid[j][i] = bm.verts.new((x, y, z))
    for j in range(PETAL_V):
        for i in range(PETAL_U):
            bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def apply_solidify(obj, thickness):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new('thickness', 'SOLIDIFY')
    mod.thickness = thickness
    mod.offset = 0
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


parts = []


def add_petal(angle, length, width, lift, cup, ruffle, roll, z):
    p = petal_mesh('hibiscus petal', length, width, lift, cup, ruffle)
    apply_solidify(p, 0.016)
    p.rotation_euler = (roll, 0, angle)
    p.location = (0, 0, z)
    bpy.context.view_layer.update()
    parts.append(p)


# Back ring: wider, lower petals. Front ring: offset by half a step, slightly lifted.
for i in range(5):
    add_petal(i * math.tau / 5, 0.40, 0.205, 0.05, 0.05, 0.010, 0.0, 0.0)
for i in range(5):
    add_petal(i * math.tau / 5 + math.pi / 5, 0.36, 0.185, 0.085, 0.06, 0.012, 0.0, 0.028)

# Stamen column curving gently upward, with five anthers at its tip.
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.014, depth=0.12, location=(0.0, 0.0, 0.10))
column = bpy.context.object
column.name = 'hibiscus stamen'
parts.append(column)
bpy.ops.mesh.primitive_uv_sphere_add(segments=10, ring_count=5, radius=0.06, location=(0, 0, 0.065))
hub = bpy.context.object
hub.name = 'hibiscus center'
hub.scale = (1, 1, 0.55)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
parts.append(hub)
for i in range(5):
    a = i * math.tau / 5 + 0.3
    bpy.ops.mesh.primitive_uv_sphere_add(segments=6, ring_count=4, radius=0.017,
                                         location=(math.cos(a) * 0.045, math.sin(a) * 0.045, 0.158))
    parts.append(bpy.context.object)

bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
obj = bpy.context.object
obj.name = 'hibiscus'
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for poly in obj.data.polygons:
    poly.use_smooth = True
bm = bmesh.new()
bm.from_mesh(obj.data)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(obj.data)
bm.free()
obj.data.update()

positions, normals = [], []
mesh = obj.data
corner_normals = getattr(mesh, 'corner_normals', None)
for poly in mesh.polygons:
    for loop_index, index in zip(poly.loop_indices, poly.vertices):
        v = mesh.vertices[index]
        n = corner_normals[loop_index].vector if corner_normals is not None else v.normal
        positions.extend(round(c, 4) for c in v.co)
        normals.extend(round(c, 4) for c in n)

xs, ys, zs = positions[0::3], positions[1::3], positions[2::3]
assert max(abs(c) for c in xs + ys) <= 0.47, 'petals must stay inside the bumper cap'
assert max(zs) <= 0.2 and min(zs) >= -0.06, 'flower must stay low over the bumper cap'
out = {'positions': positions, 'normals': normals,
       'source': 'Original hibiscus mesh generated in Blender; scripts/create-pinball-blender-asset.py'}
root = os.getcwd()
path = os.path.join(root, 'src/arcade/games/midnight-pinball/assets/hibiscus.json')
with open(path, 'w') as f:
    json.dump(out, f, separators=(',', ':'))
blend_path = os.path.join(root, 'src/arcade/games/midnight-pinball/assets/hibiscus.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)

preview = os.environ.get('HIBISCUS_PREVIEW')
if preview:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = scene.render.resolution_y = 640
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'SINGLE'
    scene.display.shading.single_color = (0.95, 0.35, 0.3)
    scene.world.color = (0.05, 0.04, 0.09)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    bpy.context.collection.objects.link(cam)
    cam.location = (0.5, -0.9, 0.85)
    cam.rotation_euler = (Vector((0, 0, 0.05)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    scene.render.filepath = preview
    bpy.ops.render.render(write_still=True)
print('BLENDER_ASSET', bpy.app.version_string, len(positions) // 3, path, blend_path)
