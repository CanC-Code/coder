#!/usr/bin/env python3
import json
import os
from datetime import datetime

class LexicalEngine:
    def __init__(self, storage_path="core/graph/lexicon_store.json"):
        self.storage_path = storage_path
        self.dictionary = {}  # term -> {definition, domain, timestamp, confidence}
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
            "last_updated": datetime.utcnow().isoformat()
        }
        with open(self.storage_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)

    def learn_concept(self, term, definition, domain="android_wasm", synonyms=None, antonyms=None):
        """
        Learns or updates a concept. Implements bidirectional feedback:
        Dictionary contributes to Thesaurus, and Thesaurus contributes to Dictionary.
        """
        term = term.lower().strip()
        synonyms = [s.lower().strip() for s in (synonyms or [])]
        antonyms = [a.lower().strip() for a in (antonyms or [])]

        # 1. Update Dictionary
        is_new = term not in self.dictionary
        self.dictionary[term] = {
            "definition": definition,
            "domain": domain,
            "timestamp": datetime.utcnow().isoformat(),
            "confidence": 1.0 if is_new else self.dictionary[term].get("confidence", 1.0) + 0.1
        }

        # 2. Update Thesaurus
        if term not in self.thesaurus:
            self.thesaurus[term] = {"synonyms": [], "antonyms": [], "semantic_cluster": []}
        
        for syn in synonyms:
            if syn not in self.thesaurus[term]["synonyms"]:
                self.thesaurus[term]["synonyms"].append(syn)
            # Thesaurus -> Dictionary feedback: ensure synonym has a dictionary stub if missing
            if syn not in self.dictionary:
                self.dictionary[syn] = {
                    "definition": f"Derived synonym concept related to {term}.",
                    "domain": domain,
                    "timestamp": datetime.utcnow().isoformat(),
                    "confidence": 0.7
                }
            # Mutual thesaurus link back
            if term not in self.thesaurus.setdefault(syn, {"synonyms": [], "antonyms": [], "semantic_cluster": []})["synonyms"]:
                self.thesaurus[syn]["synonyms"].append(term)

        for ant in antonyms:
            if ant not in self.thesaurus[term]["antonyms"]:
                self.thesaurus[term]["antonyms"].append(ant)

        # Dictionary -> Thesaurus feedback: extract keywords from definition to form semantic cluster
        words = [w.lower().strip(".,()[]{}'") for w in definition.split() if len(w) > 4]
        for w in words:
            if w != term and w not in self.thesaurus[term]["semantic_cluster"]:
                self.thesaurus[term]["semantic_cluster"].append(w)

        self.save_store()
        print(f"[+] Lexicon learned concept: '{term}' (Dictionary & Thesaurus mutually updated).")

    def query(self, term):
        term = term.lower().strip()
        return {
            "term": term,
            "dictionary": self.dictionary.get(term, None),
            "thesaurus": self.thesaurus.get(term, None)
        }
