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


#include <stdint.h>
#include <stddef.h>
#include <math.h>

extern "C" {

// Deterministic Wasm Vision Inspector: analyzes RGBA8888 screenshot pixels for
// channel/endian swap, viewport clipping, Y-inversion, and scanline stride tearing.
// Writes 8 float metrics to out_metrics:
// [0]=nonBlackRatio, [1]=redBlueRatio, [2]=greenDominance, [3]=topHalfEnergy,
// [4]=bottomHalfEnergy, [5]=leftHalfEnergy, [6]=rightHalfEnergy, [7]=rowStrideTearScore
void analyze_rgba_framebuffer(const uint8_t* rgba, int width, int height, float* out_metrics) {
    if (!rgba || !out_metrics || width <= 0 || height <= 0) return;
    double total = (double)width * (double)height;
    double nonBlack = 0.0, sumR = 0.0, sumG = 0.0, sumB = 0.0;
    double topE = 0.0, botE = 0.0, leftE = 0.0, rightE = 0.0;
    double rowDiffSum = 0.0;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int idx = (y * width + x) * 4;
            uint8_t r = rgba[idx + 0];
            uint8_t g = rgba[idx + 1];
            uint8_t b = rgba[idx + 2];
            double lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
            if (r > 12 || g > 12 || b > 12) nonBlack += 1.0;
            sumR += r; sumG += g; sumB += b;
            if (y < height / 2) topE += lum; else botE += lum;
            if (x < width / 2) leftE += lum; else rightE += lum;

            if (y > 0) {
                int prevIdx = ((y - 1) * width + x) * 4;
                int dr = (int)r - (int)rgba[prevIdx + 0];
                int dg = (int)g - (int)rgba[prevIdx + 1];
                int db = (int)b - (int)rgba[prevIdx + 2];
                rowDiffSum += sqrt((double)(dr * dr + dg * dg + db * db)) / 441.6729559;
            }
        }
    }

    out_metrics[0] = (float)(nonBlack / total);
    out_metrics[1] = (float)((sumR + 1.0) / (sumB + 1.0));
    out_metrics[2] = (float)((sumG + 1.0) / (0.5 * (sumR + sumB) + 1.0));
    out_metrics[3] = (float)(topE / (total * 0.5));
    out_metrics[4] = (float)(botE / (total * 0.5));
    out_metrics[5] = (float)(leftE / (total * 0.5));
    out_metrics[6] = (float)(rightE / (total * 0.5));
    out_metrics[7] = (float)(rowDiffSum / ((double)(height - 1) * width + 1.0));
}

} // extern "C"
