class Tether:
    def __init__(self, source_id, target_id, weight=0.5, relation_type="requires", metadata=None):
        self.source_id = source_id
        self.target_id = target_id
        self.weight = max(0.0, min(1.0, float(weight)))
        self.relation_type = relation_type
        self.metadata = metadata or {}

    def reinforce(self, factor=1.1):
        """Strengthen tether weight upon successful execution feedback."""
        self.weight = min(1.0, self.weight * factor)

    def decay(self, factor=0.9):
        """Decay tether weight upon compilation errors or dead ends."""
        self.weight = max(0.0, self.weight * factor)

    def to_dict(self):
        return {
            "source": self.source_id,
            "target": self.target_id,
            "weight": self.weight,
            "relation_type": self.relation_type,
            "metadata": self.metadata
        }
