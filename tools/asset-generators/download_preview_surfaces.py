"""Restore or verify the CC0 originals listed in the Preview texture manifest."""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--verify", action="store_true", help="check files without downloading")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    folder = root / "Assets/Textures/PreviewSurfaces"
    records = json.loads((folder / "sources.json").read_text(encoding="utf-8"))
    for record in records:
        target = folder / record["file"]
        if not args.verify:
            request = Request(record["source"], headers={"User-Agent": "TrafficInsight-Preview/1.0"})
            with urlopen(request, timeout=90) as response:
                content = response.read()
            digest = hashlib.sha256(content).hexdigest()
            if digest != record["sha256"]:
                raise ValueError(f"Download checksum mismatch: {target.name}")
            target.write_bytes(content)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if digest != record["sha256"]:
            raise ValueError(f"Checksum mismatch: {target.name}")
        print(f"Verified {target.name}")


if __name__ == "__main__":
    main()
