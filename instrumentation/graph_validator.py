#!/usr/bin/env python3
import sys
import json

def validate_graph(schema_path):
    print("[*] Inspecting neural-linked conceptual graph schema...")
    try:
        with open(schema_path, 'r') as f:
            data = json.load(f)
        
        nodes = data.get("boxes", [])
        edges = data.get("tethers", [])
        
        # Validate weights and connections
        for edge in edges:
            weight = edge.get("weight", 0.0)
            if not (0.0 <= weight <= 1.0):
                print(f"[!] Error: Invalid tether weight {weight} in edge {edge.get('id')}")
                sys.exit(1)
                
        print(f"[+] Validation passed: {len(nodes)} conceptual boxes, {len(edges)} active tethers verified.")
    except Exception as e:
        print(f"[!] Graph validation failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        validate_graph(sys.argv[1])
    else:
        print("Usage: python3 instrumentation/graph_validator.py <schema.json>")
