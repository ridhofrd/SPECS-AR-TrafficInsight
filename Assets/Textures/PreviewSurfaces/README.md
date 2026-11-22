# Preview surface sources

Photographic textures from Poly Haven, released under [CC0](https://polyhaven.com/license):

| Source | Included maps | Use |
|---|---|---|
| [Asphalt 02](https://polyhaven.com/a/asphalt_02) | 1K diffuse, OpenGL normal | Street |
| [Concrete Wall 001](https://polyhaven.com/a/concrete_wall_001) | 1K diffuse, OpenGL normal | Facades, pavement and office |
| [Wood Floor](https://polyhaven.com/a/wood_floor) | 1K diffuse, OpenGL normal | Home floor, doors and furniture |
| [Kloofendal 48d Partly Cloudy Puresky](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) | Tonemapped panoramic JPEG | Sky and editor environment lighting |

Original downloads are unchanged. Lens Studio imports the large sky JPEG at
2048 x 1024. Texture compression generates mipmaps; the Preview materials also
enable mipmap sampling. PBR uses scalar roughness, not packed material maps.

`sources.json` records the exact download URLs, license and SHA-256 checksums.
Run `python tools/asset-generators/download_preview_surfaces.py --verify` from
the project root to verify the originals, or omit `--verify` to restore them.
Downloads use the project's identifying User-Agent. There are no runtime
network requests. All surrounding geometry is authored for this project.
