#include <emscripten/emscripten.h>
#include <stdint.h>
#include <cstring>

extern "C" {

  // Allocate shared linear memory buffer for zero-copy file/AST passing
  EMSCRIPTEN_KEEPALIVE
  uint8_t* allocate_buffer(size_t size) {
      return new uint8_t[size];
  }

  EMSCRIPTEN_KEEPALIVE
  void free_buffer(uint8_t* ptr) {
      delete[] ptr;
  }

  // Process conceptual box tethers and validate node activation threshold (tau)
  EMSCRIPTEN_KEEPALIVE
  float evaluate_tether_weight(float base_weight, float reinforcement_factor) {
      float adjusted = base_weight * reinforcement_factor;
      return (adjusted > 1.0f) ? 1.0f : adjusted;
  }

}
