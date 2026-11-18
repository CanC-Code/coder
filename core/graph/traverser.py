class GraphTraverser:
    def __init__(self, threshold=0.4):
        self.tau = threshold

    def spread_activation(self, seed_box_ids, boxes_registry, tethers_registry, direction="forward", max_depth=6):
        """
        Traverses the conceptual graph using spreading activation.
        direction: "forward" (outgoing), "reverse" (incoming dependents), or "both".
        """
        active_nodes = set(seed_box_ids)
        frontier = [(box_id, 0) for box_id in seed_box_ids]
        activation_levels = {box_id: 1.0 for box_id in seed_box_ids}
        traversed_edges = []

        while frontier:
            current_id, depth = frontier.pop(0)
            if depth >= max_depth:
                continue
            current_activation = activation_levels.get(current_id, 0.0)

            for tether in tethers_registry:
                if tether.weight < self.tau:
                    continue

                neighbor_id = None
                if direction in ("forward", "both") and tether.source_id == current_id:
                    neighbor_id = tether.target_id
                elif direction in ("reverse", "both") and tether.target_id == current_id:
                    neighbor_id = tether.source_id

                if not neighbor_id:
                    continue

                incoming_signal = current_activation * tether.weight
                traversed_edges.append({
                    "source": tether.source_id,
                    "target": tether.target_id,
                    "relation": tether.relation_type,
                    "weight": round(tether.weight, 4)
                })

                if neighbor_id not in active_nodes:
                    active_nodes.add(neighbor_id)
                    activation_levels[neighbor_id] = incoming_signal
                    frontier.append((neighbor_id, depth + 1))
                else:
                    activation_levels[neighbor_id] = max(
                        activation_levels[neighbor_id], incoming_signal
                    )

        return active_nodes, activation_levels, traversed_edges
