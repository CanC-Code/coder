#!/usr/bin/env python3
import json
import os
from datetime import datetime, timezone

class LexicalEngine:
    def __init__(self, storage_path="core/graph/lexicon_store.json"):
        self.storage_path = storage_path
        self.dictionary = {}  # term -> {definition, domain, timestamp, confidence, box_ids}
        self.thesaurus = {}   # term -> {synonyms: [], antonyms: [], semantic_cluster: []}
        self.load_store()

    def load_store(self):
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.dictionary = data.get("dictionary", {})
                    self.thesaurus = data.get("thesaurus", {})
            except Exception as e:
                print(f"[!] Warning: Could not load lexicon store: {e}")

    def save_store(self):
        os.makedirs(os.path.dirname(self.storage_path), exist_ok=True)
        data = {
            "dictionary": self.dictionary,
            "thesaurus": self.thesaurus,
            "last_updated": datetime.now(timezone.utc).isoformat()
        }
        with open(self.storage_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

    def learn_concept(self, term, definition, domain="android_wasm", synonyms=None, antonyms=None, box_id=None, auto_save=True):
        """
        Learns or updates a concept with bidirectional Dictionary <-> Thesaurus feedback
        and optional ConceptualBox ID anchoring.
        """
        term = term.lower().strip()
        if not term:
            return
        synonyms = [s.lower().strip() for s in (synonyms or []) if s]
        antonyms = [a.lower().strip() for a in (antonyms or []) if a]
        now_iso = datetime.now(timezone.utc).isoformat()

        is_new = term not in self.dictionary
        existing = self.dictionary.get(term, {})
        box_ids = list(existing.get("box_ids", []))
        if box_id and box_id not in box_ids:
            box_ids.append(box_id)

        self.dictionary[term] = {
            "definition": definition,
            "domain": domain,
            "timestamp": now_iso,
            "confidence": 1.0 if is_new else round(existing.get("confidence", 1.0) + 0.1, 2),
            "box_ids": box_ids
        }

        if term not in self.thesaurus:
            self.thesaurus[term] = {"synonyms": [], "antonyms": [], "semantic_cluster": []}

        for syn in synonyms:
            if syn not in self.thesaurus[term]["synonyms"]:
                self.thesaurus[term]["synonyms"].append(syn)
            if syn not in self.dictionary:
                self.dictionary[syn] = {
                    "definition": f"Derived synonym concept related to {term}.",
                    "domain": domain,
                    "timestamp": now_iso,
                    "confidence": 0.7,
                    "box_ids": list(box_ids)
                }
            if term not in self.thesaurus.setdefault(syn, {"synonyms": [], "antonyms": [], "semantic_cluster": []})["synonyms"]:
                self.thesaurus[syn]["synonyms"].append(term)

        for ant in antonyms:
            if ant not in self.thesaurus[term]["antonyms"]:
                self.thesaurus[term]["antonyms"].append(ant)

        words = [w.lower().strip(".,()[]{}':;") for w in definition.split() if len(w) > 4]
        for w in words:
            if w != term and w not in self.thesaurus[term]["semantic_cluster"]:
                self.thesaurus[term]["semantic_cluster"].append(w)

        if auto_save:
            self.save_store()

    def query(self, term):
        term = term.lower().strip()
        matches = [k for k in self.dictionary.keys() if term in k and k != term][:10]
        return {
            "term": term,
            "dictionary": self.dictionary.get(term, None),
            "thesaurus": self.thesaurus.get(term, None),
            "related_terms": matches
        }
