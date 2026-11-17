import json
import hashlib

class ConceptualBox:
    def __init__(self, box_id, domain, core_payload, dynamic_state=None):
        self.id = box_id or hashlib.sha256(domain.encode()).hexdigest()[:12]
        self.domain = domain
        self.core_payload = core_payload
        self.dynamic_state = dynamic_state or {}

    def update_state(self, key, value):
        self.dynamic_state[key] = value

    def to_json(self):
        return json.dumps({
            "id": self.id,
            "domain": self.domain,
            "core_payload": self.core_payload,
            "dynamic_state": self.dynamic_state
        }, indent=2)
