# Code-authored static props for TrafficInsight (signed-out fallback, Blender route).
# Usage: blender --background --python gen_mesh_props.py -- MapTable|CityMap
# All authoring helpers take GLB/Lens frame coordinates in CENTIMETRES:
#   +X right, +Y up, +Z toward the viewer. Converted to Blender (Z-up, metres) here.
import sys, os, math
import bpy, bmesh

# Path to the CLAD build-mesh tools folder (voxel_toolkit.py), e.g. <claude plugins cache>/ls-clad/<version>/skills/build-mesh/tools
TOOLS_DIR = os.environ["CLAD_BUILD_MESH_TOOLS"]
sys.path.insert(0, TOOLS_DIR)
from voxel_toolkit import clear_scene, make_empty, set_parent, link_obj, create_material, export_static_glb

PROJECT_ASSETS = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "Assets", "GeneratedMeshes"))
CM = 0.01


def srgb(hexstr, a=1.0):
    h = hexstr.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], a)


def to_bl(gx, gy, gz):
    """GLB/Lens (Y-up, +Z toward viewer) cm -> Blender (Z-up) metres."""
    return (gx * CM, -gz * CM, gy * CM)


def new_obj(name, bm, mat, root):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    link_obj(obj)
    set_parent(obj, root)
    return obj


def box(name, x0, x1, y0, y1, z0, z1, mat, root):
    bm = bmesh.new()
    v = {}
    for ix, gx in enumerate((x0, x1)):
        for iy, gy in enumerate((y0, y1)):
            for iz, gz in enumerate((z0, z1)):
                v[(ix, iy, iz)] = bm.verts.new(to_bl(gx, gy, gz))
    faces = [
        ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)),
        ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)),
        ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)),
        ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
        ((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)),
        ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
    ]
    for f in faces:
        bm.faces.new([v[k] for k in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, mat, root)


def ribbon(name, pts, half_w, y0, y1, mat, root):
    """Closed prism following a polyline in the XZ plane (pts = [(x,z),...])."""
    bm = bmesh.new()
    left, right = [], []
    n = len(pts)
    for i, (x, z) in enumerate(pts):
        xa, za = pts[max(i - 1, 0)]
        xb, zb = pts[min(i + 1, n - 1)]
        dx, dz = xb - xa, zb - za
        L = math.hypot(dx, dz) or 1.0
        nx, nz = -dz / L, dx / L
        left.append((max(-30.0, min(30.0, x + nx * half_w)), z + nz * half_w))
        right.append((max(-30.0, min(30.0, x - nx * half_w)), z - nz * half_w))
    lb = [bm.verts.new(to_bl(x, y0, z)) for x, z in left]
    lt = [bm.verts.new(to_bl(x, y1, z)) for x, z in left]
    rb = [bm.verts.new(to_bl(x, y0, z)) for x, z in right]
    rt = [bm.verts.new(to_bl(x, y1, z)) for x, z in right]
    for i in range(n - 1):
        bm.faces.new([lt[i], lt[i + 1], rt[i + 1], rt[i]])  # top
        bm.faces.new([lb[i], rb[i], rb[i + 1], lb[i + 1]])  # bottom
        bm.faces.new([lb[i], lb[i + 1], lt[i + 1], lt[i]])  # left side
        bm.faces.new([rb[i], rt[i], rt[i + 1], rb[i + 1]])  # right side
    bm.faces.new([lb[0], lt[0], rt[0], rb[0]])
    bm.faces.new([lb[-1], rb[-1], rt[-1], lt[-1]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return new_obj(name, bm, mat, root)


def build_map_table(root):
    birch = create_material("TableBirch", srgb("#E6D3AE"), roughness=0.6)
    grey = create_material("TableLegGrey", srgb("#D3D7DA"), roughness=0.45, metallic=0.1)
    # Tabletop: 80 x 55 cm, 3 cm thick, top face at y = 75, softly bevelled edges.
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=to_bl(0, 73.5, 0))
    top = bpy.context.active_object
    top.name = "Tabletop"
    top.scale = (80 * CM, 55 * CM, 3 * CM)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = top.modifiers.new("Bevel", "BEVEL")
    bev.width = 0.8 * CM
    bev.segments = 4
    bev.limit_method = "NONE"
    top.data.materials.append(birch)
    for p in top.data.polygons:
        p.use_smooth = True
    set_parent(top, root)
    # Four slim straight legs, 3.4 cm diameter, inset 6 cm from each corner edge.
    for i, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        gx, gz = sx * (40 - 6), sz * (27.5 - 6)
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=1.7 * CM, depth=72 * CM,
                                            location=to_bl(gx, 36, gz))
        leg = bpy.context.active_object
        leg.name = f"Leg{i}"
        leg.data.materials.append(grey)
        for p in leg.data.polygons:
            if len(p.vertices) == 4:
                p.use_smooth = True
        set_parent(leg, root)


# CityMap layout (GLB/Lens local frame, cm). Map centred on X/Z, bottom at y=0.
MAP_W, MAP_D = 60.0, 40.0
BASE_TOP = 0.30
STREET_TOP = 0.40
PARK_TOP = 0.36
RIVER_TOP = 0.34
STREETS_X = [-20.0, -10.0, 0.0, 10.0, 20.0]   # streets running along Z at these x
STREETS_Z = [-10.0, 0.0, 10.0]                # streets running along X at these z
MAIN_W, MINOR_W = 1.4, 0.8                     # x=0 and z=0 are main avenues


def river_center_z(x):
    return -15.0 + 1.5 * math.sin((x + 30.0) / 60.0 * 2.0 * math.pi)


def build_city_map(root):
    base_m = create_material("MapBase", srgb("#F4F2EC"), roughness=0.85)
    street_m = create_material("MapStreet", srgb("#C8CDD3"), roughness=0.8)
    park_m = create_material("MapPark", srgb("#BDE8CF"), roughness=0.85)
    river_m = create_material("MapRiver", srgb("#A8D6F0"), roughness=0.5)
    hx, hz = MAP_W / 2, MAP_D / 2
    box("MapBase", -hx, hx, 0.0, BASE_TOP, -hz, hz, base_m, root)
    # River band (north part of the map, toward -Z), under the bridges.
    pts = [(x, river_center_z(x)) for x in [(-hx + i * (MAP_W / 48.0)) for i in range(49)]]
    ribbon("MapRiver", pts, 1.6, BASE_TOP, RIVER_TOP, river_m, root)
    # Parks: grid cells inset 1 cm from the street centrelines.
    for i, (cx0, cx1, cz0, cz1) in enumerate(((-20, -10, 0, 10), (10, 20, -10, 0), (0, 10, 10, 20))):
        box(f"MapPark{i}", cx0 + 1.0, cx1 - 1.0, BASE_TOP, PARK_TOP, cz0 + 1.0, cz1 - 1.0, park_m, root)
    # Street grid on top.
    for x in STREETS_X:
        w = (MAIN_W if x == 0.0 else MINOR_W) / 2
        box(f"StreetX{x:+.0f}", x - w, x + w, BASE_TOP, STREET_TOP, -hz, hz, street_m, root)
    for z in STREETS_Z:
        w = (MAIN_W if z == 0.0 else MINOR_W) / 2
        box(f"StreetZ{z:+.0f}", -hx, hx, BASE_TOP, STREET_TOP - 0.005, z - w, z + w, street_m, root)


def main():
    name = sys.argv[sys.argv.index("--") + 1]
    clear_scene()
    root = make_empty("Root_" + name)
    {"MapTable": build_map_table, "CityMap": build_city_map}[name](root)
    os.makedirs(PROJECT_ASSETS, exist_ok=True)
    export_static_glb(os.path.join(PROJECT_ASSETS, name + ".glb"), root)


if __name__ == "__main__":
    main()
