"""Render the arcade lineup visuals with Blender (Cycles, CPU friendly).

blender --background --factory-startup --python scripts/render-arcade-visuals.py

Writes public/og-image.png (1200x630 social card) and public/arcade-lineup.webp (wide page banner),
and saves the editable project to art/arcade-lineup.blend.
Environment: ARCADE_RENDER_SCALE (percent of full size, default 100), ARCADE_RENDER_SAMPLES (default 128),
ARCADE_RENDER_ONLY (og | banner), ARCADE_RENDER_OUT (output folder, default public).
"""
import bpy, math, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.environ.get('ARCADE_RENDER_OUT', os.path.join(ROOT, 'public'))
SCALE = int(os.environ.get('ARCADE_RENDER_SCALE', '100'))
SAMPLES = int(os.environ.get('ARCADE_RENDER_SAMPLES', '128'))
ONLY = os.environ.get('ARCADE_RENDER_ONLY', '')

# Same order and accents as src/arcade/catalog.ts.
CABINETS = [
    ('PAC-MAN', '#ffe36c'), ('NEON RALLY', '#ff779c'), ('REACTOR BREAKER', '#76e8e0'), ('CHROME SIEGE', '#bc9aff'),
    ('MIDNIGHT PINBALL', '#ffb56d'), ('ORBIT SALVAGE', '#8dcfff'), ('TIDAL COURIER', '#61e6c0'),
    ('PRISM CIRCUIT', '#ff9cda'), ('SKYBOUND STACK', '#ffcb77'), ('CANOPY SPRINT', '#b2e875'),
]
FONT_BLACK = 'C:/Windows/Fonts/ariblk.ttf'
FONT_BOLD = 'C:/Windows/Fonts/arialbd.ttf'
FONT_MONO = 'C:/Windows/Fonts/courbd.ttf'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene


def srgb(hex_color, gain=1.0):
    h = hex_color.lstrip('#')
    lin = [((int(h[i:i + 2], 16) / 255) ** 2.2) * gain for i in (0, 2, 4)]
    return (lin[0], lin[1], lin[2], 1.0)


def material(name, color, rough=0.4, metal=0.0, emit=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = color
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = emit
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


def screen_material(name, accent):
    """Emissive CRT: scanline bands with a bright centre that falls off toward the bezel."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    nodes.clear()
    coord = nodes.new('ShaderNodeTexCoord')
    wave = nodes.new('ShaderNodeTexWave')
    wave.wave_type, wave.bands_direction = 'BANDS', 'Z'
    wave.inputs['Scale'].default_value = 55
    wave.inputs['Distortion'].default_value = 0
    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position, ramp.color_ramp.elements[1].position = 0.3, 0.7
    ramp.color_ramp.elements[0].color = (0.35, 0.35, 0.35, 1)
    grad = nodes.new('ShaderNodeTexGradient')
    grad.gradient_type = 'SPHERICAL'
    lift = nodes.new('ShaderNodeMath')
    lift.operation = 'ADD'
    lift.inputs[1].default_value = 0.45
    mix = nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY'
    gain = nodes.new('ShaderNodeMath')
    gain.operation = 'MULTIPLY'
    gain.inputs[1].default_value = 0.32
    emit = nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = srgb(accent)
    out = nodes.new('ShaderNodeOutputMaterial')
    links.new(coord.outputs['Object'], wave.inputs['Vector'])
    links.new(coord.outputs['Object'], grad.inputs['Vector'])
    links.new(wave.outputs['Fac'], ramp.inputs['Fac'])
    links.new(grad.outputs['Fac'], lift.inputs[0])
    links.new(ramp.outputs['Color'], mix.inputs[0])
    links.new(lift.outputs['Value'], mix.inputs[1])
    links.new(mix.outputs['Value'], gain.inputs[0])
    links.new(gain.outputs['Value'], emit.inputs['Strength'])
    links.new(emit.outputs['Emission'], out.inputs['Surface'])
    return mat


def box(name, size, location, mat, parent, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name, obj.scale = name, size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL')
        mod.width, mod.segments = bevel, 2
    obj.data.materials.append(mat)
    obj.parent = parent
    return obj


def text(body, size, location, mat, font_path, parent=None, align='CENTER', extrude=0.004):
    curve = bpy.data.curves.new(body, 'FONT')
    curve.body, curve.size, curve.extrude, curve.align_x = body, size, extrude, align
    if os.path.exists(font_path):
        curve.font = bpy.data.fonts.load(font_path)
    obj = bpy.data.objects.new(body, curve)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.pi / 2, 0, 0)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def build_cabinet(title, accent, index):
    root = bpy.data.objects.new(f'cabinet {index + 1} {title}', None)
    bpy.context.collection.objects.link(root)
    dark = material(f'body {index}', (0.014, 0.016, 0.026, 1), rough=0.38, metal=0.6)
    side = material(f'side {index}', srgb(accent, 0.10), rough=0.4, metal=0.55)
    trim = material(f'trim {index}', srgb(accent, 0.1), rough=0.3, emit=srgb(accent), strength=0.9)
    box('body', (0.98, 0.84, 2.1), (0, 0, 1.05), dark, root, 0.012)
    box('side left', (0.06, 0.92, 2.2), (-0.51, 0.02, 1.1), side, root, 0.01)
    box('side right', (0.06, 0.92, 2.2), (0.51, 0.02, 1.1), side, root, 0.01)
    box('marquee', (1.06, 0.9, 0.2), (0, 0, 2.28), dark, root, 0.008)
    box('marquee strip top', (1.06, 0.9, 0.02), (0, 0, 2.395), trim, root)
    box('marquee strip bottom', (1.0, 0.04, 0.016), (0, -0.44, 2.175), trim, root)
    box('bezel', (0.84, 0.05, 0.78), (0, -0.43, 1.52), dark, root, 0.01)
    box('bezel glow', (0.86, 0.045, 0.012), (0, -0.436, 1.915), trim, root)
    box('screen', (0.72, 0.04, 0.66), (0, -0.46, 1.52), screen_material(f'screen {index}', accent), root)
    deck = box('deck', (1.0, 0.42, 0.1), (0, -0.55, 0.92), side, root, 0.012)
    deck.rotation_euler[0] = math.radians(-12)
    box('kick', (1.0, 0.04, 0.2), (0, -0.43, 0.1), trim, root)
    stick = material(f'stick {index}', (0.01, 0.01, 0.012, 1), rough=0.3)
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.016, depth=0.12, location=(-0.26, -0.58, 1.02))
    shaft = bpy.context.object
    shaft.data.materials.append(stick)
    shaft.parent = root
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.05, location=(-0.26, -0.58, 1.1))
    ball = bpy.context.object
    ball.data.materials.append(trim)
    ball.parent = root
    for b in range(3):
        bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=0.04, depth=0.03, location=(0.06 + b * 0.14, -0.62, 0.97))
        key = bpy.context.object
        key.rotation_euler[0] = math.radians(-12)
        key.data.materials.append(trim)
        key.parent = root
    title_mat = material(f'title {index}', srgb(accent, 0.05), emit=srgb(accent), strength=1.2)
    text(title, 0.085 if len(title) < 12 else 0.062, (0, -0.465, 2.245), title_mat, FONT_BOLD, root)
    return root


# Dark glossy floor with a faint neon grid.
floor_mat = material('floor', (0.006, 0.008, 0.014, 1), rough=0.12, metal=0.1)
bpy.ops.mesh.primitive_plane_add(size=120, location=(0, 5, 0))
bpy.context.object.data.materials.append(floor_mat)
bpy.ops.mesh.primitive_grid_add(x_subdivisions=80, y_subdivisions=80, size=80, location=(0, 5, 0.004))
grid = bpy.context.object
wire = grid.modifiers.new('wire', 'WIREFRAME')
wire.thickness, wire.use_replace = 0.012, True
grid.data.materials.append(material('grid', (0.01, 0.02, 0.05, 1), rough=0.5, emit=(0.06, 0.14, 0.34, 1), strength=0.5))

cabinet_roots = [build_cabinet(title, accent, i) for i, (title, accent) in enumerate(CABINETS)]

# Soft cool top light and a dim world so the neon carries the frame.
fill = bpy.data.lights.new('fill', 'AREA')
fill.shape, fill.size, fill.energy, fill.color = 'RECTANGLE', 16, 90, (0.5, 0.62, 1.0)
fill_obj = bpy.data.objects.new('fill', fill)
bpy.context.collection.objects.link(fill_obj)
fill_obj.location = (0, 6, 9)
world = bpy.data.worlds.new('night')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.006, 0.008, 0.018, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

# Social-card copy lives in its own collection so the banner render can hide it.
copy_collection = bpy.data.collections.new('og copy')
scene.collection.children.link(copy_collection)
white = material('copy white', (0.9, 0.88, 0.82, 1), emit=(0.95, 0.93, 0.86, 1), strength=1.2)
yellow = material('copy yellow', srgb('#f4df6b'), emit=srgb('#f4df6b'), strength=2.0)
for obj in [
    text('AFTER HOURS  /  THE ARCADE COLLECTION', 0.27, (-5.45, 6.0, 3.95), white, FONT_MONO, align='LEFT'),
    text('One more', 1.0, (-5.5, 6.0, 2.55), yellow, FONT_BLACK, align='LEFT', extrude=0.03),
    text('round.', 1.0, (-5.5, 6.0, 1.45), white, FONT_BLACK, align='LEFT', extrude=0.03),
    text('10 FREE 3D GAMES  /  REAL GLOBAL LEADERBOARDS', 0.27, (-5.45, 6.0, 0.3), white, FONT_MONO, align='LEFT'),
]:
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    copy_collection.objects.link(obj)


def set_hidden(root, hidden):
    root.hide_render = hidden
    for child in root.children_recursive:
        child.hide_render = hidden


def layout_og():
    """Four cabinets (the same four colours as the original card) on the right, copy on the left."""
    for i, root in enumerate(cabinet_roots):
        set_hidden(root, i > 3)
        if i > 3:
            continue
        root.location = (0.9 + i * 1.7, 6.0 - abs(i - 1.5) * 0.12, 0)
        root.rotation_euler = (0, 0, (i - 1.5) * -0.07)
        root.scale = (1.2, 1.2, 1.2)


def layout_banner():
    """All ten cabinets on a gentle arc facing the camera at the arc's centre."""
    radius, span = 12.0, 70
    for i, root in enumerate(cabinet_roots):
        set_hidden(root, False)
        theta = math.radians(-span / 2 + span * i / (len(cabinet_roots) - 1))
        root.location = (radius * math.sin(theta), radius * math.cos(theta), 0)
        root.rotation_euler = (0, 0, -theta)
        root.scale = (1, 1, 1)


def make_camera(name, location, lens, focus, fstop):
    data = bpy.data.cameras.new(name)
    data.lens, data.sensor_fit = lens, 'HORIZONTAL'
    data.dof.use_dof, data.dof.focus_distance, data.dof.aperture_fstop = True, focus, fstop
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location, obj.rotation_euler = location, (math.pi / 2, 0, 0)
    return obj


cam_og = make_camera('og camera', (0.0, -4.0, 1.5), 24, 10.0, 8.0)
cam_banner = make_camera('banner camera', (0.0, 0.0, 1.25), 28, 12.0, 8.0)

# Cycles on CPU with denoising keeps the render practical on a laptop.
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.cycles.glossy_bounces = 4
scene.cycles.diffuse_bounces = 2
scene.cycles.caustics_reflective = False
scene.cycles.caustics_refractive = False
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'None'
scene.view_settings.exposure = -0.2


def render(camera_obj, width, height, filename, fmt, show_copy, layout):
    layout()
    scene.camera = camera_obj
    copy_collection.hide_render = not show_copy
    scene.render.resolution_x, scene.render.resolution_y = width, height
    scene.render.resolution_percentage = SCALE
    scene.render.image_settings.file_format = fmt
    if fmt == 'WEBP':
        scene.render.image_settings.quality = 84
    scene.render.filepath = os.path.join(OUT, filename)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)


os.makedirs(OUT, exist_ok=True)
if ONLY in ('', 'og'):
    render(cam_og, 1200, 630, 'og-image.png', 'PNG', True, layout_og)
if ONLY in ('', 'banner'):
    render(cam_banner, 2400, 760, 'arcade-lineup.webp', 'WEBP', False, layout_banner)

if not ONLY and SCALE == 100:
    blend_dir = os.path.join(ROOT, 'art')
    os.makedirs(blend_dir, exist_ok=True)
    layout_banner()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(blend_dir, 'arcade-lineup.blend'))
