"""Generate an original low-poly hibiscus ornament. Run with Blender --background --python."""
import bpy, bmesh, json, math, os
from mathutils import Matrix
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
parts=[]
for i in range(5):
    angle=i*math.tau/5
    bpy.ops.mesh.primitive_uv_sphere_add(segments=12, ring_count=6, location=(math.cos(angle)*0.26, math.sin(angle)*0.26, 0.025))
    o=bpy.context.object; o.name='hibiscus petal'; o.scale=(0.34,0.18,0.08); o.rotation_euler.z=angle
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    parts.append(o)
bpy.ops.mesh.primitive_uv_sphere_add(segments=12,ring_count=6,location=(0,0,0.08))
center=bpy.context.object; center.name='hibiscus center';center.scale=(0.13,0.13,0.09)
bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);parts.append(center)
bpy.ops.object.select_all(action='DESELECT')
for o in parts:o.select_set(True)
bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.join();obj=bpy.context.object
bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.triangulate(bm,faces=bm.faces[:]);bm.to_mesh(obj.data);bm.free();obj.data.update()
positions=[];normals=[]
for poly in obj.data.polygons:
 for index in poly.vertices:
  v=obj.data.vertices[index];positions.extend(round(x,5) for x in v.co);normals.extend(round(x,5) for x in v.normal)
out={'positions':positions,'normals':normals,'source':'Original hibiscus mesh generated in Blender; scripts/create-pinball-blender-asset.py'}
path=os.path.join(os.getcwd(),'src/arcade/games/midnight-pinball/assets/hibiscus.json')
with open(path,'w') as f:json.dump(out,f,separators=(',',':'))
blend_path=os.path.join(os.getcwd(),'src/arcade/games/midnight-pinball/assets/hibiscus.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
print('BLENDER_ASSET',bpy.app.version_string,len(positions)//3,path,blend_path)
