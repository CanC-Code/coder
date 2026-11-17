class ConceptualBox {
    constructor(id, type, domain, payload) {
        this.id = id;
        this.type = type; // 'file' | 'symbol' | 'jni_bridge' | 'manual_section' | 'build_config'
        this.domain = domain;
        this.payload = payload; // { name, filePath, line, signature, snippet }
        this.activation = 0.0;
    }
}

class Tether {
    constructor(sourceId, targetId, weight = 0.5, relation = "relates_to") {
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.weight = Math.max(0.05, Math.min(1.0, weight));
        this.relation = relation; // 'defines' | 'calls' | 'includes' | 'binds_jni' | 'documents'
    }

    reinforce(factor = 1.08) {
        this.weight = Math.min(1.0, this.weight * factor);
    }

    decay(factor = 0.92) {
        this.weight = Math.max(0.05, this.weight * factor);
    }
}

class BidirectionalLexicon {
    constructor() {
        this.dictionary = {}; // term -> { definition, domain, sources: [], confidence }
        this.thesaurus = {};  // term -> { synonyms: [], antonyms: [], cluster: [] }
        this._seedBaseOntology();
    }

    _seedBaseOntology() {
        const seeds = [
            ["rcp", "Reality Coprocessor: N64 main graphics and audio co-processor housing the RSP and RDP.", "n64_hardware", ["coprocessor", "reality_coprocessor"], ["cpu"]],
            ["rsp", "Reality Signal Processor: MIPS-based vector processor executing N64 geometry and audio microcode.", "n64_hardware", ["signal_processor", "microcode_engine", "ucode"], []],
            ["rdp", "Reality Display Processor: N64 hardware pixel rasterizer, z-buffer, and texture combiner.", "n64_hardware", ["display_processor", "rasterizer", "combiner"], []],
            ["libultra", "Official Nintendo 64 SDK runtime library providing OS threads, VI, AI, PI, SI, and GBI display list macros.", "n64_sdk", ["ultra64", "n64_os", "gbi"], []],
            ["gbi", "Graphics Binary Interface: N64 display list command format (gSP*, gDP*) translated to OpenGL ES / Vulkan on Android.", "n64_graphics", ["display_list", "f3dex", "f3dex2", "fast3d"], []],
            ["jni", "Java Native Interface: C/C++ bridge connecting Android Dalvik/ART JVM classes to native aarch64 shared libraries.", "android_ndk", ["native_interface", "jni_bridge", "javah"], []],
            ["ndk", "Android Native Development Kit: Toolchain compiling C/C++ N64 source into ARM64 (.so) native binaries.", "android_ndk", ["aarch64", "arm64", "cmake", "ndk_build"], []],
            ["segv", "SIGSEGV Segmentation Fault: Hardware memory access violation caused by null/unmapped pointer or invalid MIPS-to-ARM64 address translation.", "debugging", ["segvdump", "sigsegv", "crash", "null_pointer", "fault"], []],
            ["vi", "Video Interface: N64 framebuffer scanout hardware mapped to Android SurfaceView / ANativeWindow.", "n64_hardware", ["video_interface", "framebuffer", "swapbuffers", "surface"], []],
            ["ai", "Audio Interface: N64 DMA audio DAC output mapped to Android OpenSL ES / AAudio.", "n64_hardware", ["audio_interface", "aaudio", "opensles", "dma_audio"], []]
        ];

        for (const [term, def, domain, syns, ants] of seeds) {
            this.learn(term, def, domain, syns, ants, "builtin_ontology");
        }
    }

    learn(term, definition, domain = "general", synonyms = [], antonyms = [], source = "workspace") {
        const cleanTerm = term.toLowerCase().trim();
        if (!cleanTerm || cleanTerm.length < 2) return;

        const existing = this.dictionary[cleanTerm];
        const sources = existing ? Array.from(new Set([...existing.sources, source])) : [source];
        this.dictionary[cleanTerm] = {
            definition: definition || (existing ? existing.definition : `Symbol in ${domain}`),
            domain,
            sources,
            confidence: existing ? Math.min(2.0, existing.confidence + 0.1) : 1.0
        };

        if (!this.thesaurus[cleanTerm]) {
            this.thesaurus[cleanTerm] = { synonyms: [], antonyms: [], cluster: [] };
        }

        // Thesaurus -> Dictionary mutual provisioning
        for (const rawSyn of synonyms) {
            const syn = rawSyn.toLowerCase().trim();
            if (!syn || syn === cleanTerm) continue;
            if (!this.thesaurus[cleanTerm].synonyms.includes(syn)) {
                this.thesaurus[cleanTerm].synonyms.push(syn);
            }
            if (!this.dictionary[syn]) {
                this.dictionary[syn] = {
                    definition: `Semantic synonym linked to '${cleanTerm}': ${this.dictionary[cleanTerm].definition}`,
                    domain,
                    sources: [source],
                    confidence: 0.75
                };
            }
            if (!this.thesaurus[syn]) {
                this.thesaurus[syn] = { synonyms: [], antonyms: [], cluster: [] };
            }
            if (!this.thesaurus[syn].synonyms.includes(cleanTerm)) {
                this.thesaurus[syn].synonyms.push(cleanTerm);
            }
        }

        for (const rawAnt of antonyms) {
            const ant = rawAnt.toLowerCase().trim();
            if (ant && !this.thesaurus[cleanTerm].antonyms.includes(ant)) {
                this.thesaurus[cleanTerm].antonyms.push(ant);
            }
        }

        // Dictionary -> Thesaurus keyword clustering
        const words = definition.toLowerCase().split(/[^a-z0-9_]+/).filter(w => w.length > 4);
        for (const w of words) {
            if (w !== cleanTerm && !this.thesaurus[cleanTerm].cluster.includes(w) && this.thesaurus[cleanTerm].cluster.length < 16) {
                this.thesaurus[cleanTerm].cluster.push(w);
            }
        }
    }

    expandQueryTokens(tokens) {
        const expanded = new Set(tokens);
        for (const t of tokens) {
            const entry = this.thesaurus[t];
            if (entry) {
                entry.synonyms.forEach(s => expanded.add(s));
                entry.cluster.slice(0, 4).forEach(c => expanded.add(c));
            }
        }
        return Array.from(expanded);
    }

    toJSON() {
        return { dictionary: this.dictionary, thesaurus: this.thesaurus };
    }

    fromJSON(data) {
        if (!data) return;
        this.dictionary = data.dictionary || this.dictionary;
        this.thesaurus = data.thesaurus || this.thesaurus;
    }
}

class NeuroSymbolicEngine {
    constructor(tau = 0.35) {
        this.tau = tau;
        this.boxes = new Map();       // id -> ConceptualBox
        this.tethers = [];            // Tether[]
        this.tetherIndex = new Set(); // "src->tgt:rel"
        this.lexicon = new BidirectionalLexicon();

        // Inverted BM25 index: token -> Map(boxId -> termFreq)
        this.invertedIndex = new Map();
        this.docLengths = new Map();
        this.avgDocLength = 1;
        this.totalDocs = 0;

        // Symbol lookup for cross-file call-graph linking
        this.symbolToBoxIds = new Map();
        this.fileSummaries = new Map(); // path -> { lang, lines, symbols: [], includes: [] }
        this.lastActiveTethers = [];
    }

    resetWorkspace() {
        this.boxes.clear();
        this.tethers = [];
        this.tetherIndex.clear();
        this.invertedIndex.clear();
        this.docLengths.clear();
        this.symbolToBoxIds.clear();
        this.fileSummaries.clear();
        this.totalDocs = 0;
    }

    tokenize(text) {
        const stopWords = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "return", "void", "const", "static", "public", "private", "include", "define", "ifdef", "endif", "null", "true", "false"]);
        return text
            .toLowerCase()
            .split(/[^a-z0-9_]+/)
            .filter(t => t.length > 2 && !stopWords.has(t));
    }

    addBox(box) {
        this.boxes.set(box.id, box);
        const searchable = `${box.payload.name} ${box.payload.filePath} ${box.payload.signature || ""} ${box.payload.snippet || ""}`;
        const tokens = this.tokenize(searchable);
        this.docLengths.set(box.id, tokens.length || 1);
        this.totalDocs++;

        const tfMap = new Map();
        for (const tok of tokens) {
            tfMap.set(tok, (tfMap.get(tok) || 0) + 1);
        }
        for (const [tok, freq] of tfMap.entries()) {
            if (!this.invertedIndex.has(tok)) {
                this.invertedIndex.set(tok, new Map());
            }
            this.invertedIndex.get(tok).set(box.id, freq);
        }

        const symKey = box.payload.name.toLowerCase();
        if (!this.symbolToBoxIds.has(symKey)) {
            this.symbolToBoxIds.set(symKey, []);
        }
        this.symbolToBoxIds.get(symKey).push(box.id);
    }

    addTether(sourceId, targetId, weight = 0.6, relation = "relates_to") {
        if (sourceId === targetId) return;
        const key = `${sourceId}->${targetId}:${relation}`;
        if (this.tetherIndex.has(key)) return;
        this.tetherIndex.add(key);
        this.tethers.push(new Tether(sourceId, targetId, weight, relation));
    }

    ingestDocument(path, text, isManual = false) {
        const ext = path.split('.').pop().toLowerCase();
        const domain = isManual ? "n64_manual" : (path.includes("Android") || ext === "java" || ext === "kt" ? "android_wrapper" : "n64_core");
        const lines = text.split('\n');

        const fileBoxId = `file:${path}`;
        const headerPreview = lines.slice(0, 18).join('\n').slice(0, 600);
        this.addBox(new ConceptualBox(fileBoxId, isManual ? "manual_section" : "file", domain, {
            name: path.split('/').pop(),
            filePath: path,
            line: 1,
            signature: `${path} (${lines.length} lines)`,
            snippet: headerPreview
        }));

        if (isManual) {
            this._ingestManualChunks(path, lines, fileBoxId);
            return;
        }

        const summary = { lang: ext, lines: lines.length, symbols: [], includes: [], calls: [] };

        // Regex extractors for C/C++, Java/Kotlin, Assembly, and Build scripts
        const cFuncRegex = /^(?:static\s+|inline\s+|extern\s+|JNIEXPORT\s+)?(?:[a-zA-Z0-9_*&:<>\s]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;{}]*)\)\s*\{?$/;
        const structClassRegex = /^(?:typedef\s+)?(?:struct|class|enum|interface)\s+([a-zA-Z_][a-zA-Z0-9_]*)/;
        const includeRegex = /^#include\s+["<]([^">]+)[">]/;
        const callRegex = /\b([a-zA-Z_][a-zA-Z0-9_]{3,})\s*\(/g;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            // 1. Track #include dependencies
            const incMatch = trimmed.match(includeRegex);
            if (incMatch) {
                summary.includes.push(incMatch[1]);
                continue;
            }

            // 2. Track Structs / Classes
            const scMatch = trimmed.match(structClassRegex);
            if (scMatch) {
                const symName = scMatch[1];
                const boxId = `sym:${path}:${i + 1}:${symName}`;
                const snippet = lines.slice(i, Math.min(lines.length, i + 8)).join('\n');
                this.addBox(new ConceptualBox(boxId, "symbol", domain, {
                    name: symName,
                    filePath: path,
                    line: i + 1,
                    signature: trimmed,
                    snippet
                }));
                this.addTether(fileBoxId, boxId, 0.85, "defines");
                this.lexicon.learn(symName, `${symName} (${trimmed}) defined in ${path} at line ${i + 1}.`, domain, [ext], [], path);
                summary.symbols.push(symName);
                continue;
            }

            // 3. Track Functions & JNI Bridges
            const fnMatch = trimmed.match(cFuncRegex);
            if (fnMatch && !["if", "for", "while", "switch", "catch", "sizeof", "return"].includes(fnMatch[1])) {
                const fnName = fnMatch[1];
                const isJni = fnName.startsWith("Java_") || trimmed.includes("JNIEXPORT") || trimmed.includes("native ");
                const boxId = `fn:${path}:${i + 1}:${fnName}`;
                const snippet = lines.slice(i, Math.min(lines.length, i + 12)).join('\n');

                this.addBox(new ConceptualBox(boxId, isJni ? "jni_bridge" : "symbol", domain, {
                    name: fnName,
                    filePath: path,
                    line: i + 1,
                    signature: trimmed,
                    snippet
                }));
                this.addTether(fileBoxId, boxId, 0.9, "defines");
                this.lexicon.learn(
                    fnName,
                    `${isJni ? "JNI native bridge" : "Function"} '${fnName}' defined in ${path}:${i + 1} with signature: ${trimmed}`,
                    domain,
                    isJni ? ["jni", "native_bridge"] : [],
                    [],
                    path
                );
                summary.symbols.push(fnName);
            }

            // 4. Track Outgoing Function Calls
            let callMatch;
            callRegex.lastIndex = 0;
            while ((callMatch = callRegex.exec(trimmed)) !== null) {
                const callee = callMatch[1];
                if (!["if", "for", "while", "switch", "sizeof", "return", "defined"].includes(callee)) {
                    summary.calls.push({ callee, line: i + 1 });
                }
            }
        }

        this.fileSummaries.set(path, summary);
    }

    _ingestManualChunks(path, lines, fileBoxId) {
        const chunkSize = 35;
        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunkLines = lines.slice(i, i + chunkSize).filter(l => l.trim().length > 0);
            if (chunkLines.length === 0) continue;
            const titleLine = chunkLines[0].trim().slice(0, 80);
            const snippet = chunkLines.join('\n').slice(0, 750);
            const boxId = `manual:${path}:${i + 1}`;

            this.addBox(new ConceptualBox(boxId, "manual_section", "n64_manual", {
                name: titleLine,
                filePath: path,
                line: i + 1,
                signature: `Manual Section (Lines ${i + 1}-${i + chunkLines.length})`,
                snippet
            }));
            this.addTether(fileBoxId, boxId, 0.75, "documents");

            // Extract Glossary / Hardware register terms (e.g. "osCreateThread - creates a thread")
            for (const line of chunkLines) {
                const sepIdx = line.indexOf(" - ");
                if (sepIdx > 2 && sepIdx < 32) {
                    const term = line.slice(0, sepIdx).trim();
                    const def = line.slice(sepIdx + 3).trim();
                    if (/^[a-zA-Z0-9_]+$/.test(term) && def.length > 8) {
                        this.lexicon.learn(term, def, "n64_manual", [], [], path);
                    }
                }
            }
        }
    }

    finalizeCrossReferences() {
        // Compute average document length for BM25
        let sumLen = 0;
        for (const len of this.docLengths.values()) sumLen += len;
        this.avgDocLength = this.totalDocs > 0 ? sumLen / this.totalDocs : 1;

        // Wire cross-file #include and function call Tethers
        const allPaths = Array.from(this.fileSummaries.keys());
        for (const [path, summary] of this.fileSummaries.entries()) {
            const srcFileId = `file:${path}`;

            for (const inc of summary.includes) {
                const targetPath = allPaths.find(p => p.endsWith(`/${inc}`) || p === inc);
                if (targetPath) {
                    this.addTether(srcFileId, `file:${targetPath}`, 0.7, "includes");
                }
            }

            const uniqueCalls = Array.from(new Set(summary.calls.map(c => c.callee))).slice(0, 40);
            for (const callee of uniqueCalls) {
                const targetBoxIds = this.symbolToBoxIds.get(callee.toLowerCase());
                if (targetBoxIds) {
                    for (const tgtId of targetBoxIds.slice(0, 3)) {
                        this.addTether(srcFileId, tgtId, 0.65, "calls");
                    }
                }
            }
        }
    }

    retrieveAndActivate(queryText, topK = 6) {
        const rawTokens = this.tokenize(queryText);
        const expandedTokens = this.lexicon.expandQueryTokens(rawTokens);

        const scores = new Map();
        const k1 = 1.5;
        const b = 0.75;

        for (const tok of expandedTokens) {
            const postings = this.invertedIndex.get(tok);
            if (!postings) continue;
            const df = postings.size;
            const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
            const isExactQueryToken = rawTokens.includes(tok);
            const boost = isExactQueryToken ? 1.5 : 0.7;

            for (const [boxId, tf] of postings.entries()) {
                const docLen = this.docLengths.get(boxId) || 1;
                const bm25 = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / this.avgDocLength))));
                scores.set(boxId, (scores.get(boxId) || 0) + bm25 * boost);
            }
        }

        // Rank seed boxes
        const rankedSeeds = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK);

        // Spreading Activation across Conceptual Graph Tethers
        const activation = new Map();
        const frontier = [];
        const activeTethers = [];

        if (rankedSeeds.length > 0) {
            const maxScore = rankedSeeds[0][1] || 1;
            for (const [boxId, score] of rankedSeeds) {
                const norm = Math.min(1.0, score / maxScore);
                activation.set(boxId, norm);
                frontier.push(boxId);
            }
        }

        const visited = new Set();
        while (frontier.length > 0) {
            const currId = frontier.shift();
            if (visited.has(currId)) continue;
            visited.add(currId);
            const currAct = activation.get(currId) || 0;

            for (const tether of this.tethers) {
                if (tether.sourceId === currId && tether.weight >= this.tau) {
                    const signal = currAct * tether.weight;
                    if (signal >= this.tau) {
                        activeTethers.push(tether);
                        const prev = activation.get(tether.targetId) || 0;
                        if (signal > prev) {
                            activation.set(tether.targetId, signal);
                            frontier.push(tether.targetId);
                        }
                    }
                }
            }
        }

        this.lastActiveTethers = activeTethers;

        const activatedBoxes = Array.from(activation.entries())
            .map(([id, act]) => {
                const box = this.boxes.get(id);
                if (box) box.activation = act;
                return box;
            })
            .filter(Boolean)
            .sort((a, b) => b.activation - a.activation);

        return {
            rawTokens,
            expandedTokens,
            activatedBoxes: activatedBoxes.slice(0, 8),
            activeTethers: activeTethers.slice(0, 10)
        };
    }

    reinforceActiveTethers() {
        for (const t of this.lastActiveTethers) {
            t.reinforce(1.1);
        }
    }

    analyzeAndRespond(queryText) {
        const q = queryText.toLowerCase();
        const { rawTokens, expandedTokens, activatedBoxes, activeTethers } = this.retrieveAndActivate(queryText);

        // Check direct lexicon definitions matching query tokens
        const matchedDefinitions = [];
        for (const tok of rawTokens) {
            if (this.lexicon.dictionary[tok]) {
                matchedDefinitions.push({ term: tok, ...this.lexicon.dictionary[tok] });
            }
        }

        // Synthesize architectural port overview if asked about overall state/architecture
        const isOverviewQuery = q.includes("port state") || q.includes("status") || q.includes("overview") || q.includes("architecture") || q.includes("summarize");
        const isCrashQuery = q.includes("segv") || q.includes("crash") || q.includes("fault") || q.includes("error") || q.includes("fix") || q.includes("debug");
        const isPatchQuery = q.includes("fix") || q.includes("patch") || q.includes("implement") || q.includes("add") || q.includes("stub") || q.includes("wrap");

        let html = "";
        let synthesizedDiff = null;

        if (this.boxes.size === 0 && !isOverviewQuery) {
            html = `<strong>Lexical & Ontology Analysis:</strong><br>`;
            if (matchedDefinitions.length > 0) {
                html += matchedDefinitions.map(d => `• <strong>${d.term}</strong> (<em>${d.domain}</em>): ${d.definition}`).join("<br>");
            } else {
                html += `No workspace files are mounted yet. Click <strong>Open Workspace</strong> to index your Android/N64 repository or <strong>Ingest Manuals</strong> to load N64 hardware documentation.`;
            }
            return { html, synthesizedDiff: null };
        }

        if (isOverviewQuery) {
            const allPaths = Array.from(this.fileSummaries.keys());
            const androidFiles = allPaths.filter(p => p.includes("Android") || p.endsWith(".java") || p.endsWith(".kt") || p.endsWith(".gradle"));
            const cFiles = allPaths.filter(p => p.endsWith(".c") || p.endsWith(".cpp") || p.endsWith(".h"));
            const jniBoxes = Array.from(this.boxes.values()).filter(b => b.type === "jni_bridge");
            const manualBoxes = Array.from(this.boxes.values()).filter(b => b.type === "manual_section");

            html += `<strong>Neuro-Symbolic Codebase & Port Synthesis:</strong><br>`;
            html += `• <strong>Indexed Graph:</strong> ${this.boxes.size} Conceptual Boxes, ${this.tethers.length} weighted Tethers, ${Object.keys(this.lexicon.dictionary).length} Lexicon entries.<br>`;
            html += `• <strong>Codebase Composition:</strong> ${cFiles.length} C/C++ N64 native files, ${androidFiles.length} Android wrapper/Gradle files, ${jniBoxes.length} JNI native bridge symbols, ${manualBoxes.length} N64 manual sections.<br>`;
            if (activatedBoxes.length > 0) {
                html += `• <strong>Highest-Activation Hotspots:</strong> ${activatedBoxes.slice(0, 4).map(b => `<code>${b.payload.filePath}:${b.payload.line}</code> (${b.payload.name})`).join(", ")}.`;
            }
        } else {
            html += `<strong>Conceptual Graph Reasoning (${activatedBoxes.length} activated nodes, ${activeTethers.length} active tethers):</strong><br>`;

            if (matchedDefinitions.length > 0) {
                html += `<div style="margin: 6px 0; padding: 6px; background: rgba(0,0,0,0.25); border-radius: 4px;">`;
                html += matchedDefinitions.slice(0, 3).map(d => `<strong>[${d.term}]</strong> ${d.definition}`).join("<br>");
                html += `</div>`;
            }

            if (activatedBoxes.length > 0) {
                html += `<strong>Traced Symbols & Source Locations:</strong><br>`;
                for (const box of activatedBoxes.slice(0, 4)) {
                    const conf = Math.round(box.activation * 100);
                    html += `• <code>${box.payload.filePath}:${box.payload.line}</code> — <strong>${box.payload.name}</strong> [${box.type}, ${conf}% match]<br>`;
                }

                if (activeTethers.length > 0) {
                    const edgeSummary = activeTethers.slice(0, 3).map(t => {
                        const src = this.boxes.get(t.sourceId)?.payload.name || t.sourceId;
                        const tgt = this.boxes.get(t.targetId)?.payload.name || t.targetId;
                        return `<code>${src}</code> &rarr; (<em>${t.relation}</em>, w=${t.weight.toFixed(2)}) &rarr; <code>${tgt}</code>`;
                    }).join("<br>");
                    html += `<div style="margin-top: 6px;"><strong>Call-Graph / Dependency Tethers:</strong><br>${edgeSummary}</div>`;
                }
            } else {
                html += `Expanded semantic query across [<em>${expandedTokens.slice(0, 8).join(", ")}</em>] against ${this.boxes.size} indexed nodes. No exact symbol exceeded threshold &tau;=${this.tau}.`;
            }
        }

        // Synthesize an actionable diff in the workspace when debugging or patching
        const targetBox = activatedBoxes.find(b => b.type === "symbol" || b.type === "jni_bridge" || b.type === "file");
        if (targetBox && (isCrashQuery || isPatchQuery || activatedBoxes.length > 0)) {
            synthesizedDiff = this._synthesizeContextualDiff(targetBox, queryText, isCrashQuery);
            if (synthesizedDiff && (isCrashQuery || isPatchQuery)) {
                html += `<br><strong>Actionable Patch Synthesized:</strong> Staged deterministic insertion for <code>${targetBox.payload.filePath}</code> in the Diff Review workspace.`;
            }
        }

        return { html, synthesizedDiff };
    }

    _synthesizeContextualDiff(box, queryText, isCrashQuery) {
        const snippetLines = (box.payload.snippet || "").split('\n');
        const contextBefore = snippetLines.slice(0, 3);
        const contextAfter = snippetLines.slice(3, 6);

        let insertionLines = [];
        if (isCrashQuery) {
            insertionLines = [
                `// [Neuro-Symbolic Guard] Null & bounds verification synthesized for ${box.payload.name}`,
                `if (!__builtin_expect(ptr != NULL, 1)) { return; }`
            ];
        } else {
            insertionLines = [
                `// [Conceptual Linker] ARM64 / Android JNI telemetry hook for ${box.payload.name}`,
                `// Intent: ${queryText.slice(0, 64)}`
            ];
        }

        return {
            filePath: box.payload.filePath,
            line: box.payload.line,
            symbolName: box.payload.name,
            contextBefore,
            insertionLines,
            contextAfter
        };
    }

    exportState() {
        return {
            tau: this.tau,
            lexicon: this.lexicon.toJSON(),
            boxes: Array.from(this.boxes.values()),
            tethers: this.tethers
        };
    }

    importState(data) {
        if (!data) return;
        this.tau = data.tau || this.tau;
        if (data.lexicon) this.lexicon.fromJSON(data.lexicon);
        if (Array.isArray(data.boxes)) {
            this.resetWorkspace();
            for (const b of data.boxes) {
                this.addBox(new ConceptualBox(b.id, b.type, b.domain, b.payload));
            }
        }
        if (Array.isArray(data.tethers)) {
            for (const t of data.tethers) {
                this.addTether(t.sourceId, t.targetId, t.weight, t.relation);
            }
        }
        this.finalizeCrossReferences();
    }
}
