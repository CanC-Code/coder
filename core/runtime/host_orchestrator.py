#!/usr/bin/env python3
import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.graph.box import ConceptualBox
from core.graph.tether import Tether
from core.graph.traverser import GraphTraverser
from core.graph.lexicon import LexicalEngine
from core.compiler.ast_parser import ASTParser


class HostOrchestrator:
    def __init__(self, workspace_root="."):
        self.workspace_root = workspace_root
        self.boxes = {}
        self.tethers = []
        self._tether_keys = set()
        self.symbol_index = {}  # symbol_name -> [box_id, ...]
        self.traverser = GraphTraverser(threshold=0.4)
        self.lexicon = LexicalEngine()

    def register_box(self, box: ConceptualBox, auto_save=True):
        self.boxes[box.id] = box
        if hasattr(box, "core_payload") and isinstance(box.core_payload, dict):
            sym_name = box.core_payload.get("name")
            if sym_name:
                self.symbol_index.setdefault(sym_name, [])
                if box.id not in self.symbol_index[sym_name]:
                    self.symbol_index[sym_name].append(box.id)
                self.lexicon.learn_concept(
                    term=str(sym_name),
                    definition=box.core_payload.get(
                        "summary",
                        f"{box.core_payload.get('kind', 'symbol')} '{sym_name}' in {box.core_payload.get('file_path', box.domain)}"
                    ),
                    domain=box.domain,
                    synonyms=[box.domain, str(box.core_payload.get("kind", ""))],
                    box_id=box.id,
                    auto_save=auto_save
                )

    def register_tether(self, tether: Tether):
        key = (tether.source_id, tether.target_id, tether.relation_type)
        if key not in self._tether_keys:
            self._tether_keys.add(key)
            self.tethers.append(tether)

    def ingest_parsed_symbols(self, file_path, parsed_symbols):
        """
        Converts ASTParser.parse_source_symbols() output into ConceptualBoxes,
        bidirectional Tethers, and Lexicon entries so non-function symbols
        (globals, externs, macros, typedefs, struct fields) are first-class graph nodes.
        """
        file_box_id = f"file:{file_path}"
        file_box = ConceptualBox(
            box_id=file_box_id,
            domain="source_file",
            core_payload={"name": os.path.basename(file_path), "kind": "file", "file_path": file_path}
        )
        self.register_box(file_box, auto_save=False)

        # Link #include dependencies
        for inc_tuple in parsed_symbols.get("includes", []):
            inc_name = inc_tuple[0] or inc_tuple[1] if isinstance(inc_tuple, tuple) else str(inc_tuple)
            if not inc_name:
                continue
            inc_box_id = f"header:{inc_name}"
            if inc_box_id not in self.boxes:
                self.register_box(
                    ConceptualBox(inc_box_id, "header", {"name": inc_name, "kind": "header"}),
                    auto_save=False
                )
            self.register_tether(Tether(file_box_id, inc_box_id, weight=0.85, relation_type="includes"))

        # Register all extracted symbols from symbols_by_name
        symbols_by_name = parsed_symbols.get("symbols_by_name", {})
        for sym_name, occurrences in symbols_by_name.items():
            for occ in occurrences:
                kind = occ.get("kind", "symbol")
                line = occ.get("line")
                sym_box_id = f"sym:{file_path}:{line or 0}:{kind}:{sym_name}"
                detail_bits = [f"{kind} {sym_name} at {file_path}:{line or '?'}"]
                if occ.get("type"):
                    detail_bits.append(f"type={occ['type']}")
                if occ.get("value"):
                    detail_bits.append(f"value={occ['value']}")
                if occ.get("parent"):
                    detail_bits.append(f"parent={occ['parent']}")

                payload = {
                    "name": sym_name,
                    "kind": kind,
                    "file_path": file_path,
                    "line": line,
                    "type": occ.get("type"),
                    "value": occ.get("value"),
                    "parent": occ.get("parent"),
                    "summary": " | ".join(detail_bits)
                }
                self.register_box(ConceptualBox(sym_box_id, f"c_{kind}", payload), auto_save=False)
                self.register_tether(Tether(file_box_id, sym_box_id, weight=0.92, relation_type="defines"))

                # Cross-link externs to matching global/function definitions across files
                if kind == "extern":
                    for existing_id in self.symbol_index.get(sym_name, []):
                        if existing_id != sym_box_id:
                            self.register_tether(Tether(sym_box_id, existing_id, weight=0.95, relation_type="resolves_extern"))
                elif kind in ("global", "function"):
                    for existing_id in self.symbol_index.get(sym_name, []):
                        existing_box = self.boxes.get(existing_id)
                        if existing_box and existing_box.core_payload.get("kind") == "extern":
                            self.register_tether(Tether(existing_id, sym_box_id, weight=0.95, relation_type="resolves_extern"))

        self.lexicon.save_store()
        return file_box_id

    def ingest_directory(self, rel_dir="."):
        parser = ASTParser(self.workspace_root)
        target_root = os.path.join(self.workspace_root, rel_dir)
        ingested = 0
        for root, _, files in os.walk(target_root):
            for fn in files:
                if fn.endswith((".c", ".cpp", ".cc", ".h", ".hpp")):
                    rel_path = os.path.relpath(os.path.join(root, fn), self.workspace_root)
                    parsed = parser.parse_source_symbols(rel_path)
                    self.ingest_parsed_symbols(rel_path, parsed)
                    ingested += 1
        return ingested

    def analyze_alteration_impact(self, symbol_or_file):
        """
        Traces all upstream and downstream graph nodes impacted if `symbol_or_file`
        is modified, moved, or retyped.
        """
        seeds = list(self.symbol_index.get(symbol_or_file, []))
        file_key = f"file:{symbol_or_file}"
        if file_key in self.boxes:
            seeds.append(file_key)
        if not seeds:
            lex = self.lexicon.query(symbol_or_file)
            if lex["dictionary"]:
                seeds.extend(lex["dictionary"].get("box_ids", []))

        active_nodes, activation_levels, edges = self.traverser.spread_activation(
            seeds, self.boxes, self.tethers, direction="both", max_depth=4
        )
        impacted = []
        for nid in active_nodes:
            box = self.boxes.get(nid)
            if box:
                impacted.append({
                    "box_id": nid,
                    "activation": round(activation_levels.get(nid, 0.0), 4),
                    "payload": box.core_payload
                })
        impacted.sort(key=lambda x: x["activation"], reverse=True)
        return {
            "target": symbol_or_file,
            "seed_count": len(seeds),
            "impacted_nodes": impacted,
            "dependency_edges": edges
        }

    def execute_intent_loop(self, seed_box_ids=None, user_intent_terms=None, execution_success=True):
        seeds = list(seed_box_ids or [])
        expanded_terms = []
        if user_intent_terms:
            for term in user_intent_terms:
                expanded_terms.append(term)
                seeds.extend(self.symbol_index.get(term, []))
                lex_data = self.lexicon.query(term)
                if lex_data["dictionary"]:
                    seeds.extend(lex_data["dictionary"].get("box_ids", []))
                if lex_data["thesaurus"]:
                    for syn in lex_data["thesaurus"].get("synonyms", []):
                        expanded_terms.append(syn)
                        seeds.extend(self.symbol_index.get(syn, []))

        seeds = list(dict.fromkeys(seeds))
        active_nodes, activation_levels, edges = self.traverser.spread_activation(
            seeds, self.boxes, self.tethers, direction="forward"
        )

        for tether in self.tethers:
            if tether.source_id in active_nodes and tether.target_id in active_nodes:
                if execution_success:
                    tether.reinforce(1.05)
                else:
                    tether.decay(0.95)

        return active_nodes, activation_levels, edges
