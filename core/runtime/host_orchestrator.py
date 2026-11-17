#!/usr/bin/env python3
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.graph.box import ConceptualBox
from core.graph.tether import Tether
from core.graph.traverser import GraphTraverser
from core.graph.lexicon import LexicalEngine

class HostOrchestrator:
    def __init__(self):
        self.boxes = {}
        self.tethers = []
        self.traverser = GraphTraverser(threshold=0.4)
        self.lexicon = LexicalEngine()

    def register_box(self, box: ConceptualBox):
        self.boxes[box.id] = box
        # Automatically ingest box domain & payload into dictionary/thesaurus lexicon
        if hasattr(box, "core_payload") and isinstance(box.core_payload, dict):
            for k, v in box.core_payload.items():
                self.lexicon.learn_concept(
                    term=str(v),
                    definition=f"Concept extracted from box domain {box.domain} under key {k}.",
                    domain=box.domain,
                    synonyms=[box.domain, k]
                )

    def register_tether(self, tether: Tether):
        self.tethers.append(tether)

    def execute_intent_loop(self, seed_box_ids, user_intent_terms=None):
        expanded_terms = []
        if user_intent_terms:
            for term in user_intent_terms:
                expanded_terms.append(term)
                lex_data = self.lexicon.query(term)
                if lex_data["thesaurus"]:
                    expanded_terms.extend(lex_data["thesaurus"].get("synonyms", []))

        active_nodes, activation_levels = self.traverser.spread_activation(
            seed_box_ids, self.boxes, self.tethers
        )
        
        execution_success = True
        for tether in self.tethers:
            if tether.source_id in active_nodes and tether.target_id in active_nodes:
                if execution_success:
                    tether.reinforce(1.05)
                else:
                    tether.decay(0.95)
                    
        return active_nodes, activation_levels
