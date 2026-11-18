#include <stdint.h>
#include <stddef.h>
#include <math.h>
#include <cstring>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define CODER_WASM_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define CODER_WASM_EXPORT __attribute__((visibility("default")))
#endif

// Pre-allocated static linear memory arena (4 MB scratch + 16-float telemetry buffer)
// Enables zero-copy JS/Python Wasm interop without requiring libc malloc/free exports.
static uint8_t s_wasm_scratch_arena[4 * 1024 * 1024];
static float   s_wasm_metrics_buffer[16];

extern "C" {

CODER_WASM_EXPORT
uint8_t* get_wasm_scratch_buffer() {
    return s_wasm_scratch_arena;
}

CODER_WASM_EXPORT
size_t get_wasm_scratch_capacity() {
    return sizeof(s_wasm_scratch_arena);
}

CODER_WASM_EXPORT
float* get_wasm_metrics_buffer() {
    return s_wasm_metrics_buffer;
}

CODER_WASM_EXPORT
uint8_t* allocate_buffer(size_t size) {
    if (size <= sizeof(s_wasm_scratch_arena)) {
        return s_wasm_scratch_arena;
    }
    return new uint8_t[size];
}

CODER_WASM_EXPORT
void free_buffer(uint8_t* ptr) {
    if (ptr && ptr != s_wasm_scratch_arena) {
        delete[] ptr;
    }
}

// Process conceptual box tethers and validate node activation threshold (tau)
CODER_WASM_EXPORT
float evaluate_tether_weight(float base_weight, float reinforcement_factor) {
    float adjusted = base_weight * reinforcement_factor;
    return (adjusted > 1.0f) ? 1.0f : adjusted;
}

// Deterministic Wasm Vision Inspector: analyzes RGBA8888 screenshot pixels for
// channel/endian swap, viewport clipping, Y-inversion, and scanline stride tearing.
// Writes 8 float metrics to out_metrics (defaults to s_wasm_metrics_buffer if null):
// [0]=nonBlackRatio, [1]=redBlueRatio, [2]=greenDominance, [3]=topHalfEnergy,
// [4]=bottomHalfEnergy, [5]=leftHalfEnergy, [6]=rightHalfEnergy, [7]=rowStrideTearScore
CODER_WASM_EXPORT
void analyze_rgba_framebuffer(const uint8_t* rgba, int width, int height, float* out_metrics) {
    float* dst = out_metrics ? out_metrics : s_wasm_metrics_buffer;
    if (!rgba || width <= 0 || height <= 0) return;

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

    dst[0] = (float)(nonBlack / total);
    dst[1] = (float)((sumR + 1.0) / (sumB + 1.0));
    dst[2] = (float)((sumG + 1.0) / (0.5 * (sumR + sumB) + 1.0));
    dst[3] = (float)(topE / (total * 0.5));
    dst[4] = (float)(botE / (total * 0.5));
    dst[5] = (float)(leftE / (total * 0.5));
    dst[6] = (float)(rightE / (total * 0.5));
    dst[7] = (float)(rowDiffSum / ((double)(height - 1) * width + 1.0));
}


// Deterministic Frame-to-Frame Reference Diff Kernel (v23)
// Compares actual vs expected RGBA8888 buffers and writes 6 floats to out_diff:
// [0]=meanColorDelta (0..1), [1]=changedPixelRatio (0..1),
// [2]=topLeftDelta, [3]=topRightDelta, [4]=bottomLeftDelta, [5]=bottomRightDelta
CODER_WASM_EXPORT
void compare_rgba_frames(const uint8_t* actual, const uint8_t* expected, int width, int height, float* out_diff) {
    float* dst = out_diff ? out_diff : s_wasm_metrics_buffer;
    if (!actual || !expected || width <= 0 || height <= 0) return;

    double total = (double)width * (double)height;
    double deltaSum = 0.0, changed = 0.0;
    double qSum[4] = {0.0, 0.0, 0.0, 0.0};
    double qCnt[4] = {0.0, 0.0, 0.0, 0.0};
    int halfW = width / 2, halfH = height / 2;

    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int idx = (y * width + x) * 4;
            int dr = (int)actual[idx + 0] - (int)expected[idx + 0];
            int dg = (int)actual[idx + 1] - (int)expected[idx + 1];
            int db = (int)actual[idx + 2] - (int)expected[idx + 2];
            double dist = sqrt((double)(dr * dr + dg * dg + db * db)) / 441.6729559;
            deltaSum += dist;
            if (dist > 0.04) changed += 1.0;
            int q = (y >= halfH ? 2 : 0) + (x >= halfW ? 1 : 0);
            qSum[q] += dist;
            qCnt[q] += 1.0;
        }
    }

    dst[0] = (float)(deltaSum / total);
    dst[1] = (float)(changed / total);
    for (int q = 0; q < 4; q++) {
        dst[2 + q] = (float)(qCnt[q] > 0.0 ? (qSum[q] / qCnt[q]) : 0.0);
    }
}

} // extern "C"
