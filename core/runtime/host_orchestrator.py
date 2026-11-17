#!/usr/bin/env python3
import sys
import os

# Add parent directory to path to allow absolute core imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.graph.box import ConceptualBox
from core.graph.tether import Tether
from core.graph.traverser import GraphTraverser

class HostOrchestrator:
    def __init__(self):
        self.boxes = {}
        self.tethers = []
        self.traverser = GraphTraverser(threshold=0.4)

    def register_box(self, box: ConceptualBox):
        self.boxes[box.id] = box

    def register_tether(self, tether: Tether):
        self.tethers.append(tether)

    def execute_intent_loop(self, seed_box_ids):
        print(f"[*] Executing intent loop with seed boxes: {seed_box_ids}")
        
        # 1. Spread activation across conceptual graph
        active_nodes, activation_levels = self.traverser.spread_activation(
            seed_box_ids, self.boxes, self.tethers
        )
        
        print(f"[+] Activated nodes ({len(active_nodes)}): {list(active_nodes)}")
        
        # 2. Simulate Wasm Sandbox Validation & Feedback
        execution_success = True  # Simulated feedback indicator
        
        # 3. Reinforce or decay tethers based on execution outcome
        for tether in self.tethers:
            if tether.source_id in active_nodes and tether.target_id in active_nodes:
                if execution_success:
                    tether.reinforce(1.05)
                else:
                    tether.decay(0.95)
                    
        return active_nodes, activation_levels

if __name__ == "__main__":
    print("[*] Initializing Host Orchestrator test sequence...")
    orchestrator = HostOrchestrator()
    
    # Create sample boxes and tethers
    b1 = ConceptualBox("box_art", "android_runtime", {"component": "ART GC"})
    b2 = ConceptualBox("box_binder", "android_runtime", {"component": "Binder IPC"})
    
    orchestrator.register_box(b1)
    orchestrator.register_box(b2)
    orchestrator.register_tether(Tether("box_art", "box_binder", weight=0.8))
    
    active, levels = orchestrator.execute_intent_loop(["box_art"])
    print(f"[+] Orchestrator test complete. Active levels: {levels}")
