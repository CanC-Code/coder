/**
 * Wasm-backed Vision Framebuffer Inspector & Runtime Crash / Tombstone Resolver.
 * Maps visual rendering anomalies and native SEGVDUMP / logcat traces directly to
 * ingested DKR / Android C++ & Java symbols.
 */
class CoderVisionAndRuntimeAnalyzer {
    constructor() {
        this.wasmExports = null;
        this._tryLoadWasm();
    }

    async _tryLoadWasm() {
        try {
            const resp = await fetch("core/runtime/wasm_bridge.wasm");
            if (!resp.ok) return;
            const bytes = await resp.arrayBuffer();
            const { instance } = await WebAssembly.instantiate(bytes, {});
            if (instance && instance.exports && instance.exports.analyze_rgba_framebuffer) {
                this.wasmExports = instance.exports;
            }
        } catch (_) {
            // Deterministic JS implementation shares identical math when .wasm binary is not yet compiled
        }
    }

    computeMetrics(imageData) {
        const { data, width, height } = imageData;
        const wex = this.wasmExports;
        if (wex && wex.memory && wex.analyze_rgba_framebuffer) {
            const byteLen = data.length;
            if (wex.get_wasm_scratch_buffer && wex.get_wasm_metrics_buffer &&
                (!wex.get_wasm_scratch_capacity || byteLen <= wex.get_wasm_scratch_capacity())) {
                const ptr = wex.get_wasm_scratch_buffer();
                const outPtr = wex.get_wasm_metrics_buffer();
                new Uint8Array(wex.memory.buffer, ptr, byteLen).set(data);
                wex.analyze_rgba_framebuffer(ptr, width, height, outPtr);
                const metrics = Array.from(new Float32Array(wex.memory.buffer, outPtr, 8));
                return { metrics, bbox: null, backend: "Wasm (wasm_bridge.wasm zero-copy)" };
            }
            const alloc = wex.allocate_buffer || wex.malloc;
            const dealloc = wex.free_buffer || wex.free;
            if (alloc) {
                const ptr = alloc(byteLen);
                const outPtr = alloc(8 * 4);
                new Uint8Array(wex.memory.buffer, ptr, byteLen).set(data);
                wex.analyze_rgba_framebuffer(ptr, width, height, outPtr);
                const metrics = Array.from(new Float32Array(wex.memory.buffer, outPtr, 8));
                if (dealloc) {
                    dealloc(ptr);
                    dealloc(outPtr);
                }
                return { metrics, bbox: null, backend: "Wasm (wasm_bridge.wasm)" };
            }
        }

        const total = width * height;
        let nonBlack = 0, sumR = 0, sumG = 0, sumB = 0;
        let topE = 0, botE = 0, leftE = 0, rightE = 0, rowDiffSum = 0;
        let minX = width, minY = height, maxX = 0, maxY = 0;

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0;
                if (r > 12 || g > 12 || b > 12) {
                    nonBlack++;
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
                sumR += r; sumG += g; sumB += b;
                if (y < height / 2) topE += lum; else botE += lum;
                if (x < width / 2) leftE += lum; else rightE += lum;
                if (y > 0) {
                    const pIdx = ((y - 1) * width + x) * 4;
                    const dr = r - data[pIdx], dg = g - data[pIdx + 1], db = b - data[pIdx + 2];
                    rowDiffSum += Math.sqrt(dr * dr + dg * dg + db * db) / 441.6729559;
                }
            }
        }
        return {
            metrics: [
                nonBlack / Math.max(1, total),
                (sumR + 1) / (sumB + 1),
                (sumG + 1) / (0.5 * (sumR + sumB) + 1),
                topE / Math.max(1, total * 0.5),
                botE / Math.max(1, total * 0.5),
                leftE / Math.max(1, total * 0.5),
                rightE / Math.max(1, total * 0.5),
                rowDiffSum / Math.max(1, (height - 1) * width)
            ],
            bbox: nonBlack > 0 ? { minX, minY, maxX, maxY, width, height } : null,
            backend: "Wasm-Parity Canvas Kernel"
        };
    }

    async assessScreenshotFile(file, engine, getFileText) {
        const imgUrl = URL.createObjectURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = imgUrl;
        });
        const maxW = 320;
        const scale = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(imgUrl);

        const imageData = ctx.getImageData(0, 0, w, h);
        const { metrics, bbox, backend } = this.computeMetrics(imageData);
        const [nonBlackRatio, rbRatio, greenDom, topE, botE, leftE, rightE, tearScore] = metrics;

        const hypotheses = [];
        const gfxPath = Array.from(engine.fileSummaries.keys()).find(p => p.endsWith("gfx_interpreter.cpp")) ||
                        Array.from(engine.fileSummaries.keys()).find(p => p.endsWith("GLRenderer.java"));

        if (nonBlackRatio < 0.03) {
            hypotheses.push({
                title: "Blank / Black Framebuffer Output (< 3% lit pixels)",
                detail: "Display list commands are either failing segment address lookup (segmentBase / bka_lookup_addr_by_low32) or gFramebuffers swap is not triggering GLRenderer texture upload.",
                query: "RSP_ProcessGfxTask"
            });
        }
        if (rbRatio > 2.3 || rbRatio < 0.42) {
            hypotheses.push({
                title: `Severe Red/Blue Channel Imbalance (R/B ratio = ${rbRatio.toFixed(2)})`,
                detail: "Indicates RGB565 vs BGR565 / RGBA5551 channel swap between gFramebuffers (RGB565) and OpenGL ES glTexImage2D / TLUT palette decoding.",
                query: "TLUT"
            });
        }
        if (greenDom > 1.75) {
            hypotheses.push({
                title: `Green-Channel Bit-Shift Corruption (Green dominance = ${greenDom.toFixed(2)})`,
                detail: "Typical when big-endian N64 RGBA5551 texels are unpacked as little-endian RGB565 without __builtin_bswap16.",
                query: "RGBA5551"
            });
        }
        if (tearScore > 0.24) {
            hypotheses.push({
                title: `High Scanline Row-Stride / Tiling Shear (Tear score = ${tearScore.toFixed(3)})`,
                detail: "Row-to-row discontinuity suggests FB_WIDTH (292) vs SCREEN_WIDTH (320) pitch mismatch or N64 TMEM 64-bit odd-row word swap.",
                query: "FB_WIDTH"
            });
        }
        if (bbox && ((bbox.maxX - bbox.minX) < w * 0.72 || (bbox.maxY - bbox.minY) < h * 0.72)) {
            hypotheses.push({
                title: `Clipped / Sub-Viewport Rendering (${bbox.maxX - bbox.minX}x${bbox.maxY - bbox.minY} active region)`,
                detail: "Active pixels occupy only a sub-rectangle of the surface; verify gSPViewport / gDPSetScissor Y-origin inversion and FB_WIDTH/FB_HEIGHT scaling.",
                query: "FB_WIDTH"
            });
        }
        if (hypotheses.length === 0) {
            hypotheses.push({
                title: "Balanced Luminance & Geometry Coverage — Check Combiner / Winding / Depth",
                detail: "No gross channel swap or blank framebuffer detected; inspect gDPSetCombineMode, depth-buffer compare, or backface culling in gfx_interpreter.cpp.",
                query: "gfx_interpreter"
            });
        }

        const fbW = engine.macroTable.get("FB_WIDTH");
        const scrW = engine.macroTable.get("SCREEN_WIDTH");
        let html = `<strong>Vision Framebuffer Assessment [${backend}] (${img.width}x${img.height}):</strong><br>` +
            `• <strong>Pixel Telemetry:</strong> Lit coverage <code>${(nonBlackRatio * 100).toFixed(1)}%</code> | R/B ratio <code>${rbRatio.toFixed(2)}</code> | Green bias <code>${greenDom.toFixed(2)}</code> | Scanline shear <code>${tearScore.toFixed(3)}</code><br>` +
            (fbW ? `• <strong>Codebase Framebuffer Spec:</strong> <code>FB_WIDTH=${fbW.value}</code> (${fbW.filePath}:${fbW.line})${scrW ? ` vs <code>SCREEN_WIDTH=${scrW.value}</code>` : ""}<br>` : "") +
            `• <strong>Diagnosed Visual Hypotheses Mapped to Source:</strong><br>` +
            hypotheses.map(h => `&nbsp;&nbsp;- <strong>${h.title}:</strong> ${h.detail}`).join("<br>");

        let synthesizedDiff = null;
        const fbMismatch = engine.auditFindings.find(f => f.category.includes("Framebuffer Resolution"));
        if (fbMismatch && hypotheses.some(h => h.query === "FB_WIDTH")) {
            synthesizedDiff = {
                filePath: fbMismatch.filePath,
                line: fbMismatch.line,
                replaceLine: true,
                symbolName: fbMismatch.category,
                contextBefore: [`// [Vision-Correlated Fix] ${fbMismatch.code}`],
                insertionLines: fbMismatch.fixSuggestion.split("\n"),
                contextAfter: [`// ${fbMismatch.reason}`]
            };
            html += `<br><strong>Remediation Staged:</strong> Loaded <code>${fbMismatch.filePath}:${fbMismatch.line}</code> into Diff Review.`;
        } else if (gfxPath) {
            const { synthesizedDiff: sDiff } = engine.analyzeAndRespond(`fix ${hypotheses[0].query}`);
            synthesizedDiff = sDiff;
        }
        return { html, synthesizedDiff };
    }


    compareImageDataFrames(actualImgData, expectedImgData) {
        const w = Math.min(actualImgData.width, expectedImgData.width);
        const h = Math.min(actualImgData.height, expectedImgData.height);
        const a = actualImgData.data, e = expectedImgData.data;
        const total = Math.max(1, w * h);
        let deltaSum = 0, changed = 0;
        const qSum = [0, 0, 0, 0], qCnt = [0, 0, 0, 0];
        const halfW = w >> 1, halfH = h >> 1;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const aIdx = (y * actualImgData.width + x) * 4;
                const eIdx = (y * expectedImgData.width + x) * 4;
                const dr = a[aIdx] - e[eIdx];
                const dg = a[aIdx + 1] - e[eIdx + 1];
                const db = a[aIdx + 2] - e[eIdx + 2];
                const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 441.6729559;
                deltaSum += dist;
                if (dist > 0.04) changed++;
                const q = (y >= halfH ? 2 : 0) + (x >= halfW ? 1 : 0);
                qSum[q] += dist;
                qCnt[q]++;
            }
        }
        return {
            meanColorDelta: deltaSum / total,
            changedPixelRatio: changed / total,
            quadrants: {
                topLeft: qCnt[0] ? qSum[0] / qCnt[0] : 0,
                topRight: qCnt[1] ? qSum[1] / qCnt[1] : 0,
                bottomLeft: qCnt[2] ? qSum[2] / qCnt[2] : 0,
                bottomRight: qCnt[3] ? qSum[3] / qCnt[3] : 0
            }
        };
    }

    isRuntimeCrashLog(text) {
        return /\b(?:SIGSEGV|SIGBUS|SIGABRT|SEGVDUMP|SEGV_MAPERR|SEGV_MTESERR|UnsatisfiedLinkError|NoSuchMethodError|Fatal signal 11|backtrace:|BKA-FILE|RDRAM-WRITE)\b/i.test(text);
    }

    analyzeRuntimeCrashLog(logText, engine, getFileText) {
        const faultMatch = logText.match(/fault addr\s+(0x[0-9a-fA-F]+)/i);
        const faultAddr = faultMatch ? faultMatch[1] : null;
        const isZeroUpper32 = faultAddr && (/^0x0{8}[0-9a-fA-F]{1,8}$/i.test(faultAddr) || (/^0x[0-9a-fA-F]{1,8}$/i.test(faultAddr) && Number(faultAddr) > 0));
        const isMteTagFault = /SEGV_MTESERR/i.test(logText) || (faultAddr && /^0x0[1-9a-fA-F]00/i.test(faultAddr));

        // Extract native backtrace symbols: e.g. #00 pc 0004a120 ... (Cmd_Vtx+148) or (Java_com_dkrwrapper_...)
        const btRegex = /\(([a-zA-Z_][a-zA-Z0-9_]*)\+(?:0x)?[0-9a-fA-F]+\)/g;
        const symbols = [];
        let m;
        while ((m = btRegex.exec(logText)) !== null) {
            if (!["__libc_init", "__start_thread", "bka_sigsegv_handler"].includes(m[1]) && !symbols.includes(m[1])) {
                symbols.push(m[1]);
            }
        }

        // Extract BKA ring buffer opcode if present (w0=0x... op=0x...)
        const opMatch = logText.match(/\bop=(0x[0-9a-fA-F]{2})\b/i);
        let opcodeMacro = null;
        if (opMatch) {
            const opNum = Number(opMatch[1]);
            for (const [mName, info] of engine.macroTable.entries()) {
                if (mName.startsWith("G_") && info.numericVal === opNum) {
                    opcodeMacro = { name: mName, ...info };
                    break;
                }
            }
        }

        const jniMissingMatch = logText.match(/No implementation found for .* (Java_[a-zA-Z0-9_]+|[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+){1,}\.[a-zA-Z0-9_]+)/);

        let html = `<strong>Runtime Crash & Log Context Diagnosis:</strong><br>`;
        if (faultAddr) {
            html += `• <strong>Fault Address:</strong> <code>${faultAddr}</code> — `;
            if (isZeroUpper32) {
                html += `<span style="color:#ff7b72;"><strong>32-bit Pointer Truncation Signature</strong></span> (upper 32 bits are <code>00000000</code>; a 64-bit host pointer was cast through <code>u32</code>/<code>s32</code>).<br>`;
            } else if (isMteTagFault) {
                html += `<span style="color:#ff7b72;"><strong>ARM64 MTE / Unmapped Segment Fault</strong></span> (top-byte tag mismatch or raw N64 segment address dereferenced without <code>bka_lookup_addr_by_low32</code>).<br>`;
            } else {
                html += `Null/out-of-bounds native memory access.<br>`;
            }
        }
        if (opcodeMacro) {
            html += `• <strong>Failing Gfx Microcode Opcode:</strong> <code>${opcodeMacro.name}</code> (<code>${opMatch[1]}</code>, defined in <code>${opcodeMacro.filePath}:${opcodeMacro.line}</code>)<br>`;
        }
        if (symbols.length > 0) {
            html += `• <strong>Crashing Native Stack Symbols:</strong> ${symbols.slice(0, 5).map(s => `<code>${s}</code>`).join(" &rarr; ")}<br>`;
        }
        if (jniMissingMatch) {
            html += `• <strong>Unresolved JNI Symbol:</strong> <code>${jniMissingMatch[1]}</code><br>`;
        }

        let synthesizedDiff = null;
        const primarySym = symbols[0];
        if (primarySym) {
            const cg = engine.callGraph.get(primarySym.toLowerCase());
            if (cg && cg.definedIn.length > 0) {
                const def = cg.definedIn[0];
                html += `• <strong>Located Source Definition:</strong> <code>${def.filePath}:${def.line}</code> (<code>${def.signature}</code>)<br>`;
                const matchingFinding = engine.auditFindings.find(f => f.filePath === def.filePath) ||
                                        engine.auditFindings.find(f => isZeroUpper32 && f.category.includes("Pointer Truncation"));
                if (matchingFinding) {
                    synthesizedDiff = {
                        filePath: matchingFinding.filePath,
                        line: matchingFinding.line,
                        replaceLine: Boolean(matchingFinding.replaceLine),
                        symbolName: `Crash-Linked Fix: ${matchingFinding.category}`,
                        contextBefore: [`// [Linked to runtime crash in ${primarySym}]`, `// Original: ${matchingFinding.code}`],
                        insertionLines: matchingFinding.fixSuggestion.split("\n"),
                        contextAfter: [`// ${matchingFinding.reason}`]
                    };
                    html += `• <strong>Auto-Staged Fix:</strong> Loaded <code>${matchingFinding.filePath}:${matchingFinding.line}</code> into Diff Review.`;
                }
            }
        }

        return { html, synthesizedDiff };
    }
}

window.coderVisionRuntime = new CoderVisionAndRuntimeAnalyzer();
