class GraphTraverser:
    def __init__(self, threshold=0.4):
        self.tau = threshold

    def spread_activation(self, seed_box_ids, boxes_registry, tethers_registry):
        """
        Traverses the conceptual graph using spreading activation.
        Activates neighboring boxes whose cumulative tether weight exceeds tau.
        """
        active_nodes = set(seed_box_ids)
        frontier = list(seed_box_ids)
        activation_levels = {box_id: 1.0 for box_id in seed_box_ids}

        while frontier:
            current_id = frontier.pop(0)
            current_activation = activation_levels.get(current_id, 0.0)

            # Inspect outgoing tethers
            for tether in tethers_registry:
                if tether.source_id == current_id and tether.weight >= self.tau:
                    target_id = tether.target_id
                    incoming_signal = current_activation * tether.weight

                    if target_id not in active_nodes:
                        active_nodes.add(target_id)
                        activation_levels[target_id] = incoming_signal
                        frontier.append(target_id)
                    else:
                        # Reinforce activation if reached via multiple paths
                        activation_levels[target_id] = max(
                            activation_levels[target_id], incoming_signal
                        )

        return active_nodes, activation_levels
