/**
 * TrafficInsightGeometry.ts
 *
 * Owns: the small MeshBuilder helpers shared by the route map and the road
 * view: an interleaved vertex buffer with outward-checked winding, a puck, a
 * mitred ribbon along a polyline, a flat ring and a flat rectangle.
 * Inputs: none (pure helpers, no @component).
 * Must not: touch the scene graph or hold state.
 */

import { MapPoint } from "./TrafficInsightTypes";

/** Interleaved position / normal / uv buffer with outward-checked triangle winding. */
export class GeoBuffer {
    private pos: number[] = [];
    data: number[] = [];
    idx: number[] = [];

    v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, w: number): number {
        this.pos.push(x, y, z);
        this.data.push(x, y, z, nx, ny, nz, u, w);
        return this.pos.length / 3 - 1;
    }

    /** Adds a triangle whose front face points along (nx, ny, nz). */
    tri(a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
        const p = this.pos;
        const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
        const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        if (cx * nx + cy * ny + cz * nz < 0) {
            this.idx.push(a, c, b);
        } else {
            this.idx.push(a, b, c);
        }
    }

    /** Replaces the builder's data with this buffer. False when there is nothing valid to draw. */
    writeTo(mb: MeshBuilder): boolean {
        if (mb.getIndicesCount() > 0) mb.eraseIndices(0, mb.getIndicesCount());
        if (mb.getVerticesCount() > 0) mb.eraseVertices(0, mb.getVerticesCount());
        if (this.idx.length === 0) return false;
        mb.appendVerticesInterleaved(this.data);
        mb.appendIndices(this.idx);
        if (!mb.isValid()) return false;
        mb.updateMesh();
        return true;
    }
}

export function newMeshBuilder(): MeshBuilder {
    const mb = new MeshBuilder([
        { name: "position", components: 3 },
        { name: "normal", components: 3, normalized: true },
        { name: "texture0", components: 2 },
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    return mb;
}

/** Flat cylinder, base at y=0, top at y=h. */
export function addPuck(g: GeoBuffer, r: number, h: number, seg: number): void {
    const centre = g.v(0, h, 0, 0, 1, 0, 0.5, 0.5);
    const top: number[] = [];
    for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        top.push(g.v(cx * r, h, sz * r, 0, 1, 0, 0.5 + 0.5 * cx, 0.5 + 0.5 * sz));
    }
    for (let i = 0; i < seg; i++) {
        g.tri(centre, top[i], top[(i + 1) % seg], 0, 1, 0);
    }
    for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2;
        const a1 = ((i + 1) / seg) * Math.PI * 2;
        const x0 = Math.cos(a0), z0 = Math.sin(a0), x1 = Math.cos(a1), z1 = Math.sin(a1);
        const b0 = g.v(x0 * r, 0, z0 * r, x0, 0, z0, i / seg, 0);
        const t0 = g.v(x0 * r, h, z0 * r, x0, 0, z0, i / seg, 1);
        const b1 = g.v(x1 * r, 0, z1 * r, x1, 0, z1, (i + 1) / seg, 0);
        const t1 = g.v(x1 * r, h, z1 * r, x1, 0, z1, (i + 1) / seg, 1);
        const am = (a0 + a1) * 0.5;
        const nx = Math.cos(am), nz = Math.sin(am);
        g.tri(b0, b1, t1, nx, 0, nz);
        g.tri(b0, t1, t0, nx, 0, nz);
    }
}

function unitDir(a: MapPoint, b: MapPoint): MapPoint {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    return len > 1e-6 ? { x: dx / len, z: dz / len } : { x: 1, z: 0 };
}

/** Flat mitred strip at y=0 along a polyline. False when the polyline has no length. */
export function addRibbon(g: GeoBuffer, points: MapPoint[], width: number): boolean {
    const pts: MapPoint[] = [];
    for (const p of points) {
        const last = pts[pts.length - 1];
        if (!last || Math.abs(last.x - p.x) + Math.abs(last.z - p.z) > 0.01) pts.push(p);
    }
    if (pts.length < 2) return false;
    const half = width * 0.5;
    const left: number[] = [];
    const right: number[] = [];
    let along = 0;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const d1 = i > 0 ? unitDir(pts[i - 1], p) : unitDir(p, pts[i + 1]);
        const d2 = i < pts.length - 1 ? unitDir(p, pts[i + 1]) : d1;
        const n1x = -d1.z, n1z = d1.x, n2x = -d2.z, n2z = d2.x;
        let mx = n1x + n2x, mz = n1z + n2z;
        const ml = Math.sqrt(mx * mx + mz * mz);
        if (ml < 1e-4) { mx = n1x; mz = n1z; } else { mx /= ml; mz /= ml; }
        const s = half / Math.max(0.35, mx * n1x + mz * n1z);
        if (i > 0) {
            const dx = p.x - pts[i - 1].x, dz = p.z - pts[i - 1].z;
            along += Math.sqrt(dx * dx + dz * dz);
        }
        left.push(g.v(p.x + mx * s, 0, p.z + mz * s, 0, 1, 0, along / width, 0));
        right.push(g.v(p.x - mx * s, 0, p.z - mz * s, 0, 1, 0, along / width, 1));
    }
    for (let i = 0; i < pts.length - 1; i++) {
        g.tri(left[i], right[i], left[i + 1], 0, 1, 0);
        g.tri(right[i], right[i + 1], left[i + 1], 0, 1, 0);
    }
    return true;
}

/** Flat ring (annulus) at y=0, facing up. */
export function addRing(g: GeoBuffer, innerR: number, outerR: number, seg: number): void {
    const inner: number[] = [];
    const outer: number[] = [];
    for (let i = 0; i < seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        const cx = Math.cos(a), sz = Math.sin(a);
        inner.push(g.v(cx * innerR, 0, sz * innerR, 0, 1, 0, 0, i / seg));
        outer.push(g.v(cx * outerR, 0, sz * outerR, 0, 1, 0, 1, i / seg));
    }
    for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        g.tri(inner[i], outer[i], inner[j], 0, 1, 0);
        g.tri(outer[i], outer[j], inner[j], 0, 1, 0);
    }
}

/** Flat axis-aligned rectangle at y=0 between two corners (x, z). */
export function addRect(g: GeoBuffer, x0: number, z0: number, x1: number, z1: number): void {
    const a = g.v(x0, 0, z0, 0, 1, 0, 0, 0);
    const b = g.v(x1, 0, z0, 0, 1, 0, 1, 0);
    const c = g.v(x1, 0, z1, 0, 1, 0, 1, 1);
    const d = g.v(x0, 0, z1, 0, 1, 0, 0, 1);
    g.tri(a, b, c, 0, 1, 0);
    g.tri(a, c, d, 0, 1, 0);
}

