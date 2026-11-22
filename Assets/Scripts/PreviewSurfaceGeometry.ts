/** Batched, textured Preview geometry. Tangents belong only to these PBR meshes. */
import { GeoBuffer } from "./TrafficInsightGeometry";

export class PreviewSurfaceBuffer extends GeoBuffer {
    v(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number): number {
        const index = super.v(x, y, z, nx, ny, nz, u, v);
        let tx = nz, ty = 0, tz = -nx;
        if (Math.abs(ny) > 0.99) { tx = 1; ty = -nx / (ny || 1); tz = 0; }
        const length = Math.sqrt(tx*tx + ty*ty + tz*tz) || 1;
        this.data.push(tx/length, ty/length, tz/length, 1);
        return index;
    }
}

export function previewMeshBuilder(): MeshBuilder {
    const mb = new MeshBuilder([
        {name:"position",components:3}, {name:"normal",components:3,normalized:true},
        {name:"texture0",components:2}, {name:"tangent",components:4},
    ]);
    mb.topology = MeshTopology.Triangles;
    mb.indexType = MeshIndexType.UInt16;
    return mb;
}

/** Bevelled box with physical-scale UVs; no tessellation is needed for a flat box. */
export function surfaceBox(g: PreviewSurfaceBuffer, x: number, y: number, z: number,
    w: number, h: number, d: number, tile: number = 100, bevel: number = 0): void {
    const half = [w/2,h/2,d/2];
    const radius = Math.max(0, Math.min(bevel, Math.min(w,h,d)*0.45));
    const centre = [x,y,z];
    const faces = [ [2,1,0,1], [2,-1,0,-1], [0,1,2,-1], [0,-1,2,1], [1,1,0,1], [1,-1,0,1] ];
    for (const [axis,side,ua,us] of faces) {
        const va = [0,1,2].find(a => a !== axis && a !== ua);
        const vs = axis === 1 ? -side : 1;
        const uc = radius > 0 ? [-half[ua],-half[ua]+radius,half[ua]-radius,half[ua]] : [-half[ua],half[ua]];
        const vc = radius > 0 ? [-half[va],-half[va]+radius,half[va]-radius,half[va]] : [-half[va],half[va]];
        const ids: number[][] = [];
        for (let j=0;j<vc.length;j++) {
            ids[j]=[];
            for (let i=0;i<uc.length;i++) {
                const p=[0,0,0]; p[axis]=side*half[axis]; p[ua]=uc[i]; p[va]=vc[j];
                let n=[0,0,0]; n[axis]=side;
                if (radius > 0) {
                    const inner=p.map((value,a)=>Math.max(-half[a]+radius,Math.min(half[a]-radius,value)));
                    const delta=p.map((value,a)=>value-inner[a]);
                    const len=Math.sqrt(delta.reduce((sum,value)=>sum+value*value,0)) || 1;
                    n=delta.map(value=>value/len);
                    for(let a=0;a<3;a++) p[a]=inner[a]+n[a]*radius;
                }
                ids[j][i]=g.v(p[0]+centre[0],p[1]+centre[1],p[2]+centre[2],n[0],n[1],n[2],
                    us*uc[i]/tile,vs*vc[j]/tile);
            }
        }
        const normal=[0,0,0]; normal[axis]=side;
        for(let j=0;j<vc.length-1;j++) for(let i=0;i<uc.length-1;i++) {
            g.tri(ids[j][i],ids[j][i+1],ids[j+1][i],normal[0],normal[1],normal[2]);
            g.tri(ids[j][i+1],ids[j+1][i+1],ids[j+1][i],normal[0],normal[1],normal[2]);
        }
    }
}

/** Smooth tapered cylinder, centred vertically; useful for poles, pots and tree trunks. */
export function surfaceCylinder(g: PreviewSurfaceBuffer, x: number, y: number, z: number,
    radius: number, height: number, topRadius: number = radius, segments: number = 14): void {
    const lower: number[] = [], upper: number[] = [];
    for(let i=0;i<=segments;i++) {
        const a=i/segments*Math.PI*2, nx=Math.cos(a), nz=Math.sin(a);
        const slope=(radius-topRadius)/height, norm=Math.sqrt(1+slope*slope);
        lower.push(g.v(x+nx*radius,y-height/2,z+nz*radius,nx/norm,slope/norm,nz/norm,i/segments,0));
        upper.push(g.v(x+nx*topRadius,y+height/2,z+nz*topRadius,nx/norm,slope/norm,nz/norm,i/segments,height/100));
    }
    const bottom=g.v(x,y-height/2,z,0,-1,0,0.5,0.5), top=g.v(x,y+height/2,z,0,1,0,0.5,0.5);
    for(let i=0;i<segments;i++) {
        const a=(i+0.5)/segments*Math.PI*2, nx=Math.cos(a), nz=Math.sin(a);
        g.tri(lower[i],lower[i+1],upper[i],nx,0,nz);
        g.tri(lower[i+1],upper[i+1],upper[i],nx,0,nz);
        g.tri(bottom,lower[i+1],lower[i],0,-1,0);
        g.tri(top,upper[i],upper[i+1],0,1,0);
    }
}

/** Smooth ellipsoid: foliage, cushions and restrained cloud volumes. */
export function surfaceEllipsoid(g: PreviewSurfaceBuffer, x: number, y: number, z: number,
    rx: number, ry: number, rz: number, segments: number = 14, rings: number = 8): void {
    const ids: number[][]=[];
    for(let j=0;j<=rings;j++) {
        ids[j]=[];
        const t=j/rings*Math.PI;
        for(let i=0;i<=segments;i++) {
            const a=i/segments*Math.PI*2, px=Math.sin(t)*Math.cos(a), py=Math.cos(t), pz=Math.sin(t)*Math.sin(a);
            const nx=px/rx, ny=py/ry, nz=pz/rz, len=Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
            ids[j][i]=g.v(x+px*rx,y+py*ry,z+pz*rz,nx/len,ny/len,nz/len,i/segments,j/rings);
        }
    }
    for(let j=0;j<rings;j++) for(let i=0;i<segments;i++) {
        const a=ids[j][i], b=ids[j][i+1], c=ids[j+1][i], d=ids[j+1][i+1];
        const nx=Math.cos((i+0.5)/segments*Math.PI*2), ny=Math.cos((j+0.5)/rings*Math.PI), nz=Math.sin((i+0.5)/segments*Math.PI*2);
        if(j>0) g.tri(a,b,c,nx,ny,nz);
        if(j<rings-1) g.tri(b,d,c,nx,ny,nz);
    }
}
