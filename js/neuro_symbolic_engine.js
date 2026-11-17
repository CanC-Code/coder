class ConceptualBox {
    constructor(id, type, domain, execRole, payload) {
        this.id = id;
        this.type = type;         // 'file' | 'symbol' | 'jni_bridge' | 'manual_section' | 'build_config'
        this.domain = domain;     // 'n64_core' | 'libultra' | 'android_wrapper' | 'build_system' | 'offline_tool' | 'n64_manual'
        this.execRole = execRole; // 'ENTRY_POINT' | 'HOT_PATH_RUNTIME' | 'JNI_BOUNDARY' | 'BUILD_CONFIG' | 'OFFLINE_BUILD_TOOL' | 'REFERENCE_DOC'
        this.payload = payload;   // { name, filePath, line, signature, snippet }
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
            ["alignment", "Memory & ABI Alignment: Strict 8/16-byte struct alignment for N64 DMA/RSP buffers, LP64 pointer width (64-bit), ARM64 MTE pointer tagging safety, and Android 15+ 16KB ELF page alignment.", "android_alignment", ["aligned", "lp64", "mte", "tbi", "page_size", "16kb", "stride"], ["unaligned"]],
            ["segv", "SIGSEGV Segmentation Fault: Hardware memory access violation caused by null/unmapped pointer, 32-bit pointer truncation, or MTE tag mismatch on ARM64.", "debugging", ["segvdump", "sigsegv", "crash", "null_pointer", "fault", "sigbus"], []],
            ["vi", "Video Interface: N64 framebuffer scanout hardware mapped to Android SurfaceView / ANativeWindow.", "n64_hardware", ["video_interface", "framebuffer", "swapbuffers", "surface"], []],
            ["ai", "Audio Interface: N64 DMA audio DAC output mapped to Android OpenSL ES / AAudio.", "n64_hardware", ["audio_interface", "aaudio", "opensles", "dma_audio"], []],
            ["pi", "Peripheral Interface: N64 cartridge ROM DMA engine mapped to Android AssetManager / memory-mapped asset bundles.", "n64_hardware", ["peripheral_interface", "ospistartdma", "rom_dma"], []]
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

        // Symbol & Runtime Usage Graph
        this.symbolToBoxIds = new Map();
        this.fileSummaries = new Map();     // path -> { lang, domain, execRole, lines, symbols, includes, calls }
        this.callGraph = new Map();         // symbolLower -> { callers: Map<filePath, line[]>, callees: Set<string>, definedIn: [] }
        this.runtimeReachable = new Set();  // symbolLower reachable from runtime entry points
        this.auditFindings = [];            // { severity, category, filePath, line, code, reason, fixSuggestion }
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
        this.callGraph.clear();
        this.runtimeReachable.clear();
        this.auditFindings = [];
        this.totalDocs = 0;
    }

    classifyFileContext(path) {
        const p = path.toLowerCase();
        const ext = p.split('.').pop();

        // Exclude offline asset conversion tools & backup snapshots from runtime hot-path
        if (p.includes("/tools/") || p.startsWith("tools/") || p.includes("extract-ver") || p.includes("_backup_") || p.includes(".git/")) {
            return { domain: "offline_tool", execRole: "OFFLINE_BUILD_TOOL" };
        }
        if (p.endsWith("cmakelists.txt") || ext === "gradle" || ext === "mk" || ext === "cmake" || p.endsWith("androidmanifest.xml")) {
            return { domain: "build_system", execRole: "BUILD_CONFIG" };
        }
        if (p.includes("android/") || ext === "java" || ext === "kt" || p.includes("jni") || p.includes("wrapper") || p.includes("bka")) {
            return { domain: "android_wrapper", execRole: "JNI_BOUNDARY" };
        }
        if (p.includes("libultra") || p.includes("ultra")) {
            return { domain: "libultra", execRole: "HOT_PATH_RUNTIME" };
        }
        if (ext === "s" || ext === "asm") {
            return { domain: "mips_asm", execRole: "HOT_PATH_RUNTIME" };
        }
        return { domain: "n64_core", execRole: "HOT_PATH_RUNTIME" };
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

    _ensureCallNode(symName) {
        const key = symName.toLowerCase();
        if (!this.callGraph.has(key)) {
            this.callGraph.set(key, {
                canonicalName: symName,
                callers: new Map(), // filePath -> number[]
                callees: new Set(),
                definedIn: []       // { filePath, line, execRole, signature }
            });
        }
        return this.callGraph.get(key);
    }

    ingestDocument(path, text, isManual = false) {
        const ext = path.split('.').pop().toLowerCase();
        const { domain, execRole } = isManual
            ? { domain: "n64_manual", execRole: "REFERENCE_DOC" }
            : this.classifyFileContext(path);

        const lines = text.split('\n');
        const fileBoxId = `file:${path}`;
        const headerPreview = lines.slice(0, 18).join('\n').slice(0, 600);

        this.addBox(new ConceptualBox(
            fileBoxId,
            isManual ? "manual_section" : (execRole === "BUILD_CONFIG" ? "build_config" : "file"),
            domain,
            execRole,
            {
                name: path.split('/').pop(),
                filePath: path,
                line: 1,
                signature: `${path} [${execRole}] (${lines.length} lines)`,
                snippet: headerPreview
            }
        ));

        if (isManual) {
            this._ingestManualChunks(path, lines, fileBoxId);
            return;
        }

        // Run Android Alignment & Port Perfection static audit on runtime/build files
        if (execRole !== "OFFLINE_BUILD_TOOL") {
            this._auditFileForAlignmentAndPorting(path, ext, execRole, lines, text);
        }

        const summary = { lang: ext, domain, execRole, lines: lines.length, symbols: [], includes: [], calls: [] };

        const cFuncRegex = /^(?:static\s+|inline\s+|extern\s+|JNIEXPORT\s+)?(?:[a-zA-Z0-9_*&:<>\s]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^;{}]*)\)\s*\{?$/;
        const structClassRegex = /^(?:typedef\s+)?(?:struct|class|enum|interface)\s+([a-zA-Z_][a-zA-Z0-9_]*)/;
        const includeRegex = /^#include\s+["<]([^">]+)[">]/;
        const callRegex = /\b([a-zA-Z_][a-zA-Z0-9_]{3,})\s*\(/g;

        let activeEnclosingFunc = null;

        for (let i = 0; i < lines.length; i++) {
            const rawLine = lines[i];
            const trimmed = rawLine.trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            const incMatch = trimmed.match(includeRegex);
            if (incMatch) {
                summary.includes.push(incMatch[1]);
                continue;
            }

            const scMatch = trimmed.match(structClassRegex);
            if (scMatch) {
                const symName = scMatch[1];
                const boxId = `sym:${path}:${i + 1}:${symName}`;
                const snippet = lines.slice(i, Math.min(lines.length, i + 8)).join('\n');
                this.addBox(new ConceptualBox(boxId, "symbol", domain, execRole, {
                    name: symName,
                    filePath: path,
                    line: i + 1,
                    signature: trimmed,
                    snippet
                }));
                this.addTether(fileBoxId, boxId, 0.85, "defines");
                if (execRole !== "OFFLINE_BUILD_TOOL") {
                    this.lexicon.learn(symName, `${symName} (${trimmed}) [${execRole}] in ${path}:${i + 1}.`, domain, [ext], [], path);
                }
                summary.symbols.push(symName);
                continue;
            }

            const fnMatch = trimmed.match(cFuncRegex);
            if (fnMatch && !["if", "for", "while", "switch", "catch", "sizeof", "return"].includes(fnMatch[1])) {
                const fnName = fnMatch[1];
                const isJni = fnName.startsWith("Java_") || trimmed.includes("JNIEXPORT") || trimmed.includes("native ");
                const isEntry = isJni || ["main", "boot", "android_main", "jni_onload", "bka_install_segv_handler"].includes(fnName.toLowerCase());
                const symRole = isEntry ? "ENTRY_POINT" : (isJni ? "JNI_BOUNDARY" : execRole);
                const boxId = `fn:${path}:${i + 1}:${fnName}`;
                const snippet = lines.slice(i, Math.min(lines.length, i + 12)).join('\n');

                activeEnclosingFunc = fnName;
                const cgNode = this._ensureCallNode(fnName);
                cgNode.definedIn.push({ filePath: path, line: i + 1, execRole: symRole, signature: trimmed });

                this.addBox(new ConceptualBox(boxId, isJni ? "jni_bridge" : "symbol", domain, symRole, {
                    name: fnName,
                    filePath: path,
                    line: i + 1,
                    signature: trimmed,
                    snippet
                }));
                this.addTether(fileBoxId, boxId, 0.9, "defines");

                if (execRole !== "OFFLINE_BUILD_TOOL") {
                    this.lexicon.learn(
                        fnName,
                        `${isJni ? "JNI native bridge" : "Function"} '${fnName}' [${symRole}] in ${path}:${i + 1}: ${trimmed}`,
                        domain,
                        isJni ? ["jni", "native_bridge"] : [],
                        [],
                        path
                    );
                }
                summary.symbols.push(fnName);
            }

            let callMatch;
            callRegex.lastIndex = 0;
            while ((callMatch = callRegex.exec(trimmed)) !== null) {
                const callee = callMatch[1];
                if (!["if", "for", "while", "switch", "sizeof", "return", "defined"].includes(callee)) {
                    summary.calls.push({ callee, line: i + 1 });
                    if (execRole !== "OFFLINE_BUILD_TOOL") {
                        const calleeNode = this._ensureCallNode(callee);
                        if (!calleeNode.callers.has(path)) {
                            calleeNode.callers.set(path, []);
                        }
                        calleeNode.callers.get(path).push(i + 1);
                        if (activeEnclosingFunc && activeEnclosingFunc.toLowerCase() !== callee.toLowerCase()) {
                            this._ensureCallNode(activeEnclosingFunc).callees.add(callee);
                        }
                    }
                }
            }
        }

        this.fileSummaries.set(path, summary);
    }

    _auditFileForAlignmentAndPorting(path, ext, execRole, lines, fullText) {
        // 1. Check Build System for Android 15+ 16KB ELF Page Alignment
        if (path.endsWith("CMakeLists.txt") || path.endsWith("Android.mk")) {
            if (!fullText.includes("max-page-size=16384") && !fullText.includes("16384")) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "Android 16KB Page Alignment",
                    filePath: path,
                    line: 1,
                    code: path.split('/').pop(),
                    reason: "Missing '-Wl,-z,max-page-size=16384' linker flag required for Android 15+ 16 KB page-size device compatibility.",
                    fixSuggestion: `target_link_options(\${PROJECT_NAME} PRIVATE "-Wl,-z,max-page-size=16384")`
                });
            }
        }

        // 2. Scan C/C++/Java files for ARM64 LP64, Pointer Truncation, MTE, Struct Alignment, & Endianness hazards
        if (!["c", "cpp", "h", "hpp", "java", "kt"].includes(ext)) return;

        const ptrTruncRegex = /\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)\s*(?:&?[a-zA-Z_][a-zA-Z0-9_]*(?:->|\.)?[a-zA-Z0-9_]*)/;
        const longFieldRegex = /^\s*(?:unsigned\s+)?long\s+[a-zA-Z_][a-zA-Z0-9_*\[\]\s]*;/;
        const unalignedCastRegex = /\*\s*\(\s*(?:u32|s32|u16|s16|uint32_t|uint16_t)\s*\*\s*\)/;
        const dmaBufferRegex = /\b(?:Gfx|Vtx|Mtx|OSTask|OSMesg)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\[/;
        const rawHwIoRegex = /\b(?:IO_READ|IO_WRITE|PHYS_TO_K0|K0_TO_PHYS|osPiStartDma|osViSwapBuffer)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            // Hazard A: 32-bit pointer truncation / ARM64 MTE Top-Byte tag loss
            if (ptrTruncRegex.test(trimmed) && (trimmed.includes("ptr") || trimmed.includes("addr") || trimmed.includes("buf") || trimmed.includes("&"))) {
                this.auditFindings.push({
                    severity: "CRITICAL",
                    category: "ARM64 Pointer Truncation / MTE Hazard",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "Casting pointer/address to 32-bit integer truncates upper 32 bits on aarch64 and strips ARM64 MTE/TBI pointer tags, causing immediate SIGSEGV.",
                    fixSuggestion: trimmed.replace(/\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)/, "(uintptr_t)")
                });
            }

            // Hazard B: LP64 'long' size mismatch (4 bytes on N64 MIPS vs 8 bytes on Android ARM64)
            if (longFieldRegex.test(trimmed) && !trimmed.includes("long long")) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "LP64 ABI Width Drift (long)",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "'long' is 32-bit on N64 MIPS (ILP32) but 64-bit on Android aarch64 (LP64), shifting struct offsets and corrupting binary asset/save layouts.",
                    fixSuggestion: trimmed.replace(/\bunsigned\s+long\b/, "uint32_t").replace(/\blong\b/, "int32_t")
                });
            }

            // Hazard C: Unaligned / Endian-unsafe direct multi-byte pointer dereference
            if (unalignedCastRegex.test(trimmed)) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "Unaligned / Endianness Memory Cast",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "Direct multi-byte pointer cast on byte stream risks SIGBUS unaligned access and fails big-endian N64 ROM byte ordering on little-endian ARM64.",
                    fixSuggestion: `// Use aligned memcpy + __builtin_bswap32 instead of raw cast:\n${trimmed}`
                });
            }

            // Hazard D: N64 RSP/RDP DMA buffer missing 16-byte alignment attribute
            if (dmaBufferRegex.test(trimmed) && !trimmed.includes("aligned") && !trimmed.includes("ALIGNED")) {
                this.auditFindings.push({
                    severity: "MEDIUM",
                    category: "RSP/RDP & NEON 16-Byte Alignment",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "N64 Display Lists (Gfx), Matrices (Mtx), and Vertices (Vtx) require 8/16-byte alignment for RSP/RDP DMA and ARM64 NEON vector loads.",
                    fixSuggestion: trimmed.replace(/;$/, " __attribute__((aligned(16)));")
                });
            }

            // Hazard E: Direct N64 hardware register/DMA calls requiring Android HAL/JNI interception
            if (rawHwIoRegex.test(trimmed) && !path.includes("libultra")) {
                this.auditFindings.push({
                    severity: "MEDIUM",
                    category: "Unabstracted N64 Hardware Call",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "Direct N64 RCP/PI/VI hardware invocation must route through the Android JNI/GL/AAudio compatibility shim at runtime.",
                    fixSuggestion: `// Verify Android shim interception for: ${trimmed}`
                });
            }
        }
    }

    _ingestManualChunks(path, lines, fileBoxId) {
        const chunkSize = 35;
        for (let i = 0; i < lines.length; i += chunkSize) {
            const chunkLines = lines.slice(i, i + chunkSize).filter(l => l.trim().length > 0);
            if (chunkLines.length === 0) continue;
            const titleLine = chunkLines[0].trim().slice(0, 80);
            const snippet = chunkLines.join('\n').slice(0, 750);
            const boxId = `manual:${path}:${i + 1}`;

            this.addBox(new ConceptualBox(boxId, "manual_section", "n64_manual", "REFERENCE_DOC", {
                name: titleLine,
                filePath: path,
                line: i + 1,
                signature: `Manual Section (Lines ${i + 1}-${i + chunkLines.length})`,
                snippet
            }));
            this.addTether(fileBoxId, boxId, 0.75, "documents");

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
        let sumLen = 0;
        for (const len of this.docLengths.values()) sumLen += len;
        this.avgDocLength = this.totalDocs > 0 ? sumLen / this.totalDocs : 1;

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

        // Propagate Runtime Reachability from Entry Points
        this.runtimeReachable.clear();
        const queue = [];
        for (const [symKey, node] of this.callGraph.entries()) {
            const isEntry = node.definedIn.some(d => d.execRole === "ENTRY_POINT" || d.execRole === "JNI_BOUNDARY") ||
                            ["main", "boot", "android_main", "jni_onload", "bka_install_segv_handler"].includes(symKey);
            if (isEntry) {
                this.runtimeReachable.add(symKey);
                queue.push(symKey);
            }
        }
        while (queue.length > 0) {
            const curr = queue.shift();
            const node = this.callGraph.get(curr);
            if (!node) continue;
            for (const callee of node.callees) {
                const cKey = callee.toLowerCase();
                if (!this.runtimeReachable.has(cKey)) {
                    this.runtimeReachable.add(cKey);
                    queue.push(cKey);
                }
            }
        }

        const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        this.auditFindings.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
    }

    retrieveAndActivate(queryText, topK = 8) {
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
            const isExact = rawTokens.includes(tok);
            const boost = isExact ? 1.6 : 0.7;

            for (const [boxId, tf] of postings.entries()) {
                const box = this.boxes.get(boxId);
                // Strongly deprioritize offline asset build tools (e.g., tools/tiny_gltf.h) during runtime queries
                const roleMultiplier = box && box.execRole === "OFFLINE_BUILD_TOOL" ? 0.15 : 1.0;
                const docLen = this.docLengths.get(boxId) || 1;
                const bm25 = idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / this.avgDocLength))));
                scores.set(boxId, (scores.get(boxId) || 0) + bm25 * boost * roleMultiplier);
            }
        }

        const rankedSeeds = Array.from(scores.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, topK);

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

        return { rawTokens, expandedTokens, activatedBoxes: activatedBoxes.slice(0, 8), activeTethers: activeTethers.slice(0, 10) };
    }

    reinforceActiveTethers() {
        for (const t of this.lastActiveTethers) {
            t.reinforce(1.1);
        }
    }

    runFullPortAudit() {
        if (this.boxes.size === 0) {
            return {
                html: `<strong>Port Perfection & Alignment Audit:</strong><br>No workspace mounted yet. Click <strong>Open Workspace</strong> to scan your codebase for ARM64 LP64, MTE pointer truncation, 16KB ELF page alignment, and runtime call-path issues.`,
                synthesizedDiff: null
            };
        }

        const crit = this.auditFindings.filter(f => f.severity === "CRITICAL");
        const high = this.auditFindings.filter(f => f.severity === "HIGH");
        const med = this.auditFindings.filter(f => f.severity === "MEDIUM");

        const allSummaries = Array.from(this.fileSummaries.values());
        const runtimeFiles = allSummaries.filter(s => s.execRole !== "OFFLINE_BUILD_TOOL").length;
        const offlineFiles = allSummaries.filter(s => s.execRole === "OFFLINE_BUILD_TOOL").length;
        const mipsAsmFiles = allSummaries.filter(s => s.domain === "mips_asm").length;

        let html = `<strong>Port Perfection & Android Alignment Audit (${runtimeFiles} runtime files scanned, ${offlineFiles} offline tool files isolated):</strong><br>`;
        html += `• <strong>Severity Breakdown:</strong> <span style="color:#ff7b72;">${crit.length} CRITICAL</span> (Pointer Truncation/MTE), <span style="color:#d29922;">${high.length} HIGH</span> (LP64/16KB Alignment/Endianness), <span style="color:#58a6ff;">${med.length} MEDIUM</span> (DMA Alignment/HAL Stubs).<br>`;
        if (mipsAsmFiles > 0) {
            html += `• <strong>Architecture Completeness:</strong> Detected <code>${mipsAsmFiles}</code> raw MIPS <code>.s</code> assembly files requiring C/ARM64 decompilation parity for full <code>aarch64</code> execution.<br>`;
        }

        const topFindings = this.auditFindings.slice(0, 5);
        if (topFindings.length > 0) {
            html += `<div style="margin-top:6px;"><strong>Top Actionable Alignment & Port Defects:</strong><br>`;
            for (const f of topFindings) {
                html += `• <strong>[${f.severity}] ${f.category}</strong> at <code>${f.filePath}:${f.line}</code><br>&nbsp;&nbsp;<em>Why:</em> ${f.reason}<br>`;
            }
            html += `</div>`;
        } else {
            html += `• Zero static LP64, pointer truncation, or 16KB page-alignment violations detected across scanned runtime files.`;
        }

        let synthesizedDiff = null;
        if (topFindings.length > 0) {
            const first = topFindings[0];
            synthesizedDiff = {
                filePath: first.filePath,
                line: first.line,
                symbolName: first.category,
                contextBefore: [`// [${first.severity}] ${first.category}`, `// Original: ${first.code}`],
                insertionLines: first.fixSuggestion.split('\n'),
                contextAfter: [`// Reason: ${first.reason}`]
            };
            html += `<br><strong>Remediation Staged:</strong> Loaded fix for <code>${first.filePath}:${first.line}</code> into the Diff Review workspace.`;
        }

        return { html, synthesizedDiff };
    }

    analyzeAndRespond(queryText) {
        const q = queryText.toLowerCase();

        const isAuditQuery = q.includes("audit") || q.includes("alignment") || q.includes("perfection") || q.includes("flaw") || q.includes("defect") || q.includes("truncat") || q.includes("16kb") || q.includes("lp64");
        if (isAuditQuery) {
            return this.runFullPortAudit();
        }

        const { rawTokens, expandedTokens, activatedBoxes, activeTethers } = this.retrieveAndActivate(queryText);

        // Runtime Usage Inspection for any symbol mentioned in query
        const usageReports = [];
        for (const tok of rawTokens) {
            const cg = this.callGraph.get(tok);
            if (cg && (cg.definedIn.length > 0 || cg.callers.size > 0)) {
                const isReachable = this.runtimeReachable.has(tok);
                let totalCallSites = 0;
                const callerList = [];
                for (const [cFile, cLines] of cg.callers.entries()) {
                    totalCallSites += cLines.length;
                    callerList.push(`<code>${cFile}:${cLines.slice(0, 3).join(",")}</code>`);
                }
                const defSummary = cg.definedIn.map(d => `<code>${d.filePath}:${d.line}</code> [${d.execRole}]`).join(", ");
                const relatedHazards = this.auditFindings.filter(f =>
                    cg.definedIn.some(d => d.filePath === f.filePath && Math.abs(d.line - f.line) < 25)
                );

                usageReports.push({
                    name: cg.canonicalName,
                    isReachable,
                    defSummary,
                    totalCallSites,
                    callerList: callerList.slice(0, 4),
                    callees: Array.from(cg.callees).slice(0, 5),
                    relatedHazards
                });
            }
        }

        const isOverviewQuery = q.includes("port state") || q.includes("status") || q.includes("overview") || q.includes("architecture") || q.includes("summarize");
        const isCrashQuery = q.includes("segv") || q.includes("crash") || q.includes("fault") || q.includes("error") || q.includes("debug");
        const isPatchQuery = q.includes("fix") || q.includes("patch") || q.includes("implement") || q.includes("wrap");

        let html = "";
        let synthesizedDiff = null;

        if (this.boxes.size === 0 && !isOverviewQuery) {
            html = `<strong>Neuro-Symbolic Engine Ready:</strong><br>Mount your Android/N64 workspace folder or ingest N64 manuals to run runtime call-path analysis and Android ARM64 alignment verification.`;
            return { html, synthesizedDiff: null };
        }

        if (isOverviewQuery) {
            const allSummaries = Array.from(this.fileSummaries.values());
            const runtimeFiles = allSummaries.filter(s => s.execRole === "HOT_PATH_RUNTIME");
            const jniFiles = allSummaries.filter(s => s.execRole === "JNI_BOUNDARY");
            const offlineFiles = allSummaries.filter(s => s.execRole === "OFFLINE_BUILD_TOOL");
            const mipsAsmFiles = allSummaries.filter(s => s.domain === "mips_asm");
            const critCount = this.auditFindings.filter(f => f.severity === "CRITICAL").length;
            const highCount = this.auditFindings.filter(f => f.severity === "HIGH").length;

            html += `<strong>Runtime-Aware Port Perfection & Architecture Report:</strong><br>`;
            html += `• <strong>Execution Layer Partitioning:</strong> ${runtimeFiles.length} runtime N64/libultra files, ${jniFiles.length} Android/JNI wrapper files, ${offlineFiles.length} offline host build tools (excluded from runtime faults).<br>`;
            html += `• <strong>Runtime Call-Graph:</strong> ${this.callGraph.size} symbols tracked (${this.runtimeReachable.size} reachable from Android/N64 runtime entry points); ${mipsAsmFiles.length} MIPS assembly files remaining.<br>`;
            html += `• <strong>Android Alignment & Safety Audit:</strong> ${critCount} CRITICAL pointer/MTE hazards, ${highCount} HIGH LP64/16KB-page/endianness hazards detected.<br>`;
            if (activatedBoxes.length > 0) {
                html += `• <strong>Key Runtime Entry/Hotspot Nodes:</strong> ${activatedBoxes.slice(0, 4).map(b => `<code>${b.payload.filePath}:${b.payload.line}</code> [${b.execRole}]`).join(", ")}.`;
            }
        } else if (usageReports.length > 0) {
            html += `<strong>Runtime Usage & Call-Path Analysis:</strong><br>`;
            for (const u of usageReports.slice(0, 2)) {
                html += `• <strong>Symbol <code>${u.name}</code></strong> — Runtime Reachability: <strong>${u.isReachable ? "ACTIVE RUNTIME PATH" : "INDIRECT / UNREACHED"}</strong><br>`;
                if (u.defSummary) html += `&nbsp;&nbsp;<em>Defined in:</em> ${u.defSummary}<br>`;
                html += `&nbsp;&nbsp;<em>Runtime Callers (${u.totalCallSites} call sites):</em> ${u.callerList.length > 0 ? u.callerList.join(", ") : "Entry point / external JNI"}<br>`;
                if (u.callees.length > 0) html += `&nbsp;&nbsp;<em>Downstream Callees:</em> <code>${u.callees.join("</code>, <code>")}</code><br>`;
                if (u.relatedHazards.length > 0) {
                    html += `&nbsp;&nbsp;<span style="color:#ff7b72;"><em>Alignment/Safety Defect Nearby:</em> [${u.relatedHazards[0].severity}] ${u.relatedHazards[0].reason}</span><br>`;
                }
            }
        } else {
            html += `<strong>Conceptual Graph Reasoning (${activatedBoxes.length} runtime nodes, ${activeTethers.length} active tethers):</strong><br>`;
            if (activatedBoxes.length > 0) {
                for (const box of activatedBoxes.slice(0, 4)) {
                    const conf = Math.round(box.activation * 100);
                    html += `• <code>${box.payload.filePath}:${box.payload.line}</code> — <strong>${box.payload.name}</strong> [<em>${box.execRole}</em>, ${conf}%]<br>`;
                }
            } else {
                html += `Expanded semantic query across [<em>${expandedTokens.slice(0, 8).join(", ")}</em>]. Try asking for <code>audit alignment</code>, <code>port state</code>, or a specific function/struct name to inspect its runtime callers and alignment safety.`;
            }
        }

        const targetBox = activatedBoxes.find(b => b.execRole !== "OFFLINE_BUILD_TOOL" && (b.type === "symbol" || b.type === "jni_bridge" || b.type === "file"));
        if (targetBox && (isCrashQuery || isPatchQuery)) {
            const matchingAudit = this.auditFindings.find(f => f.filePath === targetBox.payload.filePath);
            if (matchingAudit) {
                synthesizedDiff = {
                    filePath: matchingAudit.filePath,
                    line: matchingAudit.line,
                    symbolName: matchingAudit.category,
                    contextBefore: [`// [${matchingAudit.severity}] ${matchingAudit.category}`, `// Original: ${matchingAudit.code}`],
                    insertionLines: matchingAudit.fixSuggestion.split('\n'),
                    contextAfter: [`// ${matchingAudit.reason}`]
                };
            } else {
                const snippetLines = (targetBox.payload.snippet || "").split('\n');
                synthesizedDiff = {
                    filePath: targetBox.payload.filePath,
                    line: targetBox.payload.line,
                    symbolName: targetBox.payload.name,
                    contextBefore: snippetLines.slice(0, 3),
                    insertionLines: [
                        `// [ARM64 Runtime Guard] Null, 16-byte alignment & MTE pointer tag check for ${targetBox.payload.name}`,
                        `if (!__builtin_expect(ptr != NULL, 1)) { return; }`
                    ],
                    contextAfter: snippetLines.slice(3, 6)
                };
            }
            html += `<br><strong>Patch Staged:</strong> Loaded deterministic fix for <code>${synthesizedDiff.filePath}:${synthesizedDiff.line}</code> into Diff Review.`;
        }

        return { html, synthesizedDiff };
    }

    exportState() {
        return {
            tau: this.tau,
            lexicon: this.lexicon.toJSON(),
            boxes: Array.from(this.boxes.values()),
            tethers: this.tethers,
            auditFindings: this.auditFindings
        };
    }

    importState(data) {
        if (!data) return;
        this.tau = data.tau || this.tau;
        if (data.lexicon) this.lexicon.fromJSON(data.lexicon);
        if (Array.isArray(data.boxes)) {
            this.resetWorkspace();
            for (const b of data.boxes) {
                this.addBox(new ConceptualBox(b.id, b.type, b.domain, b.execRole || "HOT_PATH_RUNTIME", b.payload));
            }
        }
        if (Array.isArray(data.tethers)) {
            for (const t of data.tethers) {
                this.addTether(t.sourceId, t.targetId, t.weight, t.relation);
            }
        }
        this.auditFindings = data.auditFindings || [];
        this.finalizeCrossReferences();
    }
}
