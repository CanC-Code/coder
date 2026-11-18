#!/usr/bin/env python3
import sys
import json


def validate_graph_data(data):
    """
    Validates conceptual graph structural integrity:
    1. Box schema & duplicate ID detection
    2. Tether weight range [0.0, 1.0]
    3. Referential integrity (every tether source & target resolves to an existing box)
    4. Self-loop & isolated/orphan box diagnostics
    """
    errors = []
    warnings = []

    raw_boxes = data.get("boxes", [])
    if isinstance(raw_boxes, dict):
        box_list = list(raw_boxes.values())
    else:
        box_list = list(raw_boxes)

    edges = data.get("tethers", [])

    box_ids = set()
    for idx, box in enumerate(box_list):
        bid = box.get("id")
        if not bid:
            errors.append(f"Box at index {idx} is missing required 'id'.")
            continue
        if bid in box_ids:
            errors.append(f"Duplicate box id detected: '{bid}'.")
        box_ids.add(bid)
        if not box.get("domain"):
            warnings.append(f"Box '{bid}' has no 'domain' specified.")

    connected_ids = set()
    for idx, edge in enumerate(edges):
        src = edge.get("source") or edge.get("source_id") or edge.get("sourceId") or edge.get("sourceId")
        dst = edge.get("target") or edge.get("target_id") or edge.get("targetId") or edge.get("targetId")
        weight = edge.get("weight", 0.0)

        if not isinstance(weight, (int, float)) or not (0.0 <= float(weight) <= 1.0):
            errors.append(f"Invalid tether weight {weight!r} on edge[{idx}] ({src} -> {dst}).")

        if not src or src not in box_ids:
            errors.append(f"Dangling tether source '{src}' on edge[{idx}] (target='{dst}').")
        else:
            connected_ids.add(src)

        if not dst or dst not in box_ids:
            errors.append(f"Dangling tether target '{dst}' on edge[{idx}] (source='{src}').")
        else:
            connected_ids.add(dst)

        if src and dst and src == dst:
            warnings.append(f"Self-loop tether on '{src}' ({edge.get('relation_type', 'unknown')}).")

    orphan_ids = sorted(box_ids - connected_ids)
    if orphan_ids:
        warnings.append(f"{len(orphan_ids)} isolated/orphan box(es) with 0 tethers (e.g. {orphan_ids[:5]}).")

    return {
        "valid": len(errors) == 0,
        "box_count": len(box_ids),
        "tether_count": len(edges),
        "orphan_count": len(orphan_ids),
        "errors": errors,
        "warnings": warnings
    }


def validate_graph(schema_path):
    print("[*] Inspecting neural-linked conceptual graph schema...")
    try:
        with open(schema_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        report = validate_graph_data(data)
        for w in report["warnings"]:
            print(f"[!] Warning: {w}")
        if not report["valid"]:
            for err in report["errors"]:
                print(f"[!] Error: {err}")
            sys.exit(1)

        print(
            f"[+] Validation passed: {report['box_count']} conceptual boxes, "
            f"{report['tether_count']} active tethers verified "
            f"({report['orphan_count']} isolated nodes)."
        )
    except SystemExit:
        raise
    except Exception as e:
        print(f"[!] Graph validation failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sample = {
            "boxes": [
                {"id": "file:a.c", "domain": "source_file"},
                {"id": "sym:a.c:1:global:gVar", "domain": "c_global"}
            ],
            "tethers": [
                {"source": "file:a.c", "target": "sym:a.c:1:global:gVar", "weight": 0.9, "relation_type": "defines"}
            ]
        }
        res = validate_graph_data(sample)
        assert res["valid"] and res["orphan_count"] == 0, f"Selftest failed: {res}"
        print("[SELFTEST OK] graph_validator verified referential integrity and weights.")
        sys.exit(0)

    if len(sys.argv) > 1:
        validate_graph(sys.argv[1])
    else:
        print("Usage: python3 instrumentation/graph_validator.py <schema.json> | --selftest")
