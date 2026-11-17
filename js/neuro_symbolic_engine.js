class ConceptualBox {
    constructor(id, type, domain, execRole, payload) {
        this.id = id;
        this.type = type;         // 'file' | 'symbol' | 'jni_bridge' | 'manual_section' | 'build_config' | 'android_component' | 'native_lib'
        this.domain = domain;     // 'n64_core' | 'libultra' | 'android_wrapper' | 'build_system' | 'offline_tool' | 'n64_manual'
        this.execRole = execRole; // 'ENTRY_POINT' | 'HOT_PATH_RUNTIME' | 'JNI_BOUNDARY' | 'BUILD_CONFIG' | 'OFFLINE_BUILD_TOOL' | 'REFERENCE_DOC'
        this.payload = payload;   // { name, filePath, line, signature, snippet, packaging }
        this.activation = 0.0;
    }
}

class Tether {
    constructor(sourceId, targetId, weight = 0.5, relation = "relates_to") {
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.weight = Math.max(0.05, Math.min(1.0, weight));
        this.relation = relation; // 'defines' | 'calls' | 'includes' | 'binds_jni' | 'loads_native_lib' | 'compiles_into_so' | 'launches_component' | 'packages_asset' | 'documents'
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
            ["jni", "Java Native Interface: C/C++ bridge connecting Android Dalvik/ART JVM classes to native aarch64 shared libraries.", "android_ndk", ["native_interface", "jni_bridge", "javah", "jni_onload"], []],
            ["ndk", "Android Native Development Kit: Toolchain compiling C/C++ N64 source into ARM64 (.so) native binaries.", "android_ndk", ["aarch64", "arm64", "cmake", "ndk_build"], []],
            ["apk", "Android Application Package: Final deployable archive bundling classes.dex, AndroidManifest.xml, lib/arm64-v8a/*.so, and assets/.", "android_packaging", ["packaging", "bundle", "classes_dex", "shared_library", "so"], []],
            ["manifest", "AndroidManifest.xml: Declares package identity, SDK versions, permissions, hardware features, Activities, Services, and native library extraction rules.", "android_packaging", ["androidmanifest", "activity", "service", "intent"], []],
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
        this.fileSummaries = new Map();     // path -> { lang, domain, execRole, packaging, lines, symbols, includes, includedBy, calls }
        this.callGraph = new Map();         // symbolLower -> { canonicalName, callers: Map<filePath, line[]>, callees: Set<string>, definedIn: [] }
        this.runtimeReachable = new Set();  // symbolLower reachable from runtime entry points
        this.auditFindings = [];            // { severity, category, filePath, line, code, reason, fixSuggestion }
        this.lastActiveTethers = [];

        // Android Packaging & Runtime Architecture Model
        this.androidModel = this._createEmptyAndroidModel();
    }

    _createEmptyAndroidModel() {
        return {
            packageName: null,
            namespace: null,
            applicationId: null,
            minSdk: null,
            targetSdk: null,
            extractNativeLibs: null,
            abiFilters: [],
            permissions: [],
            features: [],
            components: [],        // { kind: 'activity'|'service'|'receiver'|'provider', name, shortName, isLauncher, filePath, line }
            javaNativeMethods: [], // { className, packageName, methodName, expectedJniSymbol, filePath, line, boundCBoxId }
            loadedLibraries: [],   // { libName, soFileName, filePath, line }
            nativeTargets: [],     // { targetName, soFileName, buildFile, line, sourceGlobs: [], explicitSources: [], linkedLibs: [] }
            packagedAssets: [],    // { path, category: 'asset'|'resource'|'baserom'|'prebuilt_so' }
            gradleFiles: [],
            manifestFiles: [],
            cmakeFiles: []
        };
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
        this.androidModel = this._createEmptyAndroidModel();
        this.totalDocs = 0;
    }

    registerNonTextAsset(path) {
        const p = path.toLowerCase();
        if (p.includes(".git/") || p.includes("_backup_") || p.includes("extract-ver/")) return;

        let packaging = "UNPACKAGED_HOST_FILE";
        if (p.includes("/assets/") || p.startsWith("assets/")) {
            packaging = "PACKAGED_ASSET";
            this.androidModel.packagedAssets.push({ path, category: "asset" });
        } else if (p.includes("/res/") || p.startsWith("res/")) {
            packaging = "PACKAGED_RESOURCE";
            this.androidModel.packagedAssets.push({ path, category: "resource" });
        } else if (p.includes("/jnilibs/") && p.endsWith(".so")) {
            packaging = "PACKAGED_PREBUILT_SO";
            this.androidModel.packagedAssets.push({ path, category: "prebuilt_so" });
        } else if (p.includes("baseroms/")) {
            packaging = "ROM_SOURCE_INPUT";
            this.androidModel.packagedAssets.push({ path, category: "baserom" });
        }

        this.fileSummaries.set(path, {
            lang: path.split('.').pop().toLowerCase(),
            domain: packaging === "PACKAGED_ASSET" || packaging === "PACKAGED_RESOURCE" ? "android_packaging" : "asset_data",
            execRole: packaging.startsWith("PACKAGED_") ? "APK_PAYLOAD" : "OFFLINE_BUILD_TOOL",
            packaging,
            lines: 0,
            symbols: [],
            includes: [],
            includedBy: [],
            calls: []
        });
    }

    classifyFileContext(path) {
        const p = path.toLowerCase();
        const ext = p.split('.').pop();

        if (p.includes("/tools/") || p.startsWith("tools/") || p.includes("extract-ver") || p.includes("_backup_") || p.includes(".git/")) {
            return { domain: "offline_tool", execRole: "OFFLINE_BUILD_TOOL", packaging: "UNPACKAGED_HOST_TOOL" };
        }
        if (p.endsWith("androidmanifest.xml")) {
            return { domain: "android_wrapper", execRole: "BUILD_CONFIG", packaging: "PACKAGED_MANIFEST" };
        }
        if (p.endsWith("cmakelists.txt") || ext === "gradle" || ext === "kts" || ext === "mk" || ext === "cmake") {
            return { domain: "build_system", execRole: "BUILD_CONFIG", packaging: "BUILD_RECIPE" };
        }
        if (p.includes("/assets/") || p.startsWith("assets/")) {
            return { domain: "android_packaging", execRole: "APK_PAYLOAD", packaging: "PACKAGED_ASSET" };
        }
        if (p.includes("/res/") || p.startsWith("res/")) {
            return { domain: "android_packaging", execRole: "APK_PAYLOAD", packaging: "PACKAGED_RESOURCE" };
        }
        if (ext === "java" || ext === "kt") {
            return { domain: "android_wrapper", execRole: "JNI_BOUNDARY", packaging: "PACKAGED_DEX" };
        }
        if (p.includes("android/") || p.includes("jni") || p.includes("wrapper") || p.includes("bka")) {
            return { domain: "android_wrapper", execRole: "JNI_BOUNDARY", packaging: "CANDIDATE_NATIVE_SO" };
        }
        if (p.includes("libultra") || p.includes("ultra")) {
            return { domain: "libultra", execRole: "HOT_PATH_RUNTIME", packaging: "CANDIDATE_NATIVE_SO" };
        }
        if (ext === "s" || ext === "asm") {
            return { domain: "mips_asm", execRole: "HOT_PATH_RUNTIME", packaging: "MIPS_ASM_SOURCE" };
        }
        if (["c", "cpp", "h", "hpp"].includes(ext)) {
            return { domain: "n64_core", execRole: "HOT_PATH_RUNTIME", packaging: "CANDIDATE_NATIVE_SO" };
        }
        return { domain: "n64_core", execRole: "HOT_PATH_RUNTIME", packaging: "WORKSPACE_FILE" };
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
        const { domain, execRole, packaging } = isManual
            ? { domain: "n64_manual", execRole: "REFERENCE_DOC", packaging: "REFERENCE_DOC" }
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
                signature: `${path} [${packaging}] (${lines.length} lines)`,
                snippet: headerPreview,
                packaging
            }
        ));

        if (isManual) {
            this._ingestManualChunks(path, lines, fileBoxId);
            return;
        }

        if (packaging === "PACKAGED_ASSET") {
            this.androidModel.packagedAssets.push({ path, category: "asset" });
        } else if (packaging === "PACKAGED_RESOURCE") {
            this.androidModel.packagedAssets.push({ path, category: "resource" });
        }

        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith("androidmanifest.xml")) {
            this.androidModel.manifestFiles.push(path);
            this._parseAndroidManifest(path, text, fileBoxId);
        } else if (ext === "gradle" || ext === "kts") {
            this.androidModel.gradleFiles.push(path);
            this._parseGradleBuild(path, lines, text, fileBoxId);
        } else if (lowerPath.endsWith("cmakelists.txt") || lowerPath.endsWith("android.mk") || lowerPath.endsWith("application.mk")) {
            this.androidModel.cmakeFiles.push(path);
            this._parseCMakeAndMakefiles(path, lines, text, fileBoxId);
        }

        if (execRole !== "OFFLINE_BUILD_TOOL") {
            this._auditFileForAlignmentAndPorting(path, ext, execRole, lines, text);
        }

        if (ext === "java" || ext === "kt") {
            this._parseJavaKotlinAndroid(path, lines, fileBoxId);
        }

        const summary = {
            lang: ext,
            domain,
            execRole,
            packaging,
            lines: lines.length,
            symbols: [],
            includes: [],
            includedBy: [],
            calls: []
        };

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
                    snippet,
                    packaging
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
                    snippet,
                    packaging
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

    _parseAndroidManifest(path, text, fileBoxId) {
        const pkgMatch = text.match(/package\s*=\s*["']([^"']+)["']/);
        if (pkgMatch) this.androidModel.packageName = pkgMatch[1];

        const minSdkMatch = text.match(/android:minSdkVersion\s*=\s*["'](\d+)["']/);
        if (minSdkMatch) this.androidModel.minSdk = minSdkMatch[1];

        const targetSdkMatch = text.match(/android:targetSdkVersion\s*=\s*["'](\d+)["']/);
        if (targetSdkMatch) this.androidModel.targetSdk = targetSdkMatch[1];

        const extractMatch = text.match(/android:extractNativeLibs\s*=\s*["'](true|false)["']/);
        if (extractMatch) this.androidModel.extractNativeLibs = extractMatch[1];

        const permRegex = /<uses-permission[^>]*android:name\s*=\s*["']([^"']+)["']/g;
        let pm;
        while ((pm = permRegex.exec(text)) !== null) {
            if (!this.androidModel.permissions.includes(pm[1])) {
                this.androidModel.permissions.push(pm[1]);
            }
        }

        const featRegex = /<uses-feature[^>]*android:(?:name|glEsVersion)\s*=\s*["']([^"']+)["']/g;
        let fm;
        while ((fm = featRegex.exec(text)) !== null) {
            if (!this.androidModel.features.includes(fm[1])) {
                this.androidModel.features.push(fm[1]);
            }
        }

        const compRegex = /<(activity|service|receiver|provider)\b([^>]*)>([\s\S]*?)<\/\1>|<(activity|service|receiver|provider)\b([^>]*)\/>/g;
        let cm;
        while ((cm = compRegex.exec(text)) !== null) {
            const kind = cm[1] || cm[4];
            const attrs = cm[2] || cm[5] || "";
            const body = cm[3] || "";
            const nameMatch = attrs.match(/android:name\s*=\s*["']([^"']+)["']/);
            if (!nameMatch) continue;
            const rawName = nameMatch[1];
            const shortName = rawName.split('.').pop();
            const isLauncher = body.includes("android.intent.category.LAUNCHER") || body.includes("android.intent.action.MAIN");
            const lineNum = text.slice(0, cm.index).split('\n').length;

            this.androidModel.components.push({
                kind,
                name: rawName,
                shortName,
                isLauncher,
                filePath: path,
                line: lineNum
            });

            const compBoxId = `manifest:${path}:${lineNum}:${shortName}`;
            this.addBox(new ConceptualBox(compBoxId, "android_component", "android_wrapper", "ENTRY_POINT", {
                name: shortName,
                filePath: path,
                line: lineNum,
                signature: `<${kind} android:name="${rawName}">${isLauncher ? " [LAUNCHER]" : ""}`,
                snippet: cm[0].slice(0, 350),
                packaging: "PACKAGED_MANIFEST"
            }));
            this.addTether(fileBoxId, compBoxId, 0.95, "launches_component");
            this.lexicon.learn(shortName, `AndroidManifest <${kind}> entry component '${rawName}' declared in ${path}:${lineNum}.`, "android_packaging", [kind, "manifest_entry"], [], path);
        }
    }

    _parseGradleBuild(path, lines, text, fileBoxId) {
        const nsMatch = text.match(/namespace\s*[= ]\s*["']([^"']+)["']/);
        if (nsMatch) this.androidModel.namespace = nsMatch[1];

        const appMatch = text.match(/applicationId\s*[= ]\s*["']([^"']+)["']/);
        if (appMatch) this.androidModel.applicationId = appMatch[1];

        const minMatch = text.match(/minSdk(?:Version)?\s*[= ]\s*(\d+)/);
        if (minMatch) this.androidModel.minSdk = minMatch[1];

        const tgtMatch = text.match(/targetSdk(?:Version)?\s*[= ]\s*(\d+)/);
        if (tgtMatch) this.androidModel.targetSdk = tgtMatch[1];

        const abiMatch = text.match(/abiFilters\s+([^\n}]+)/);
        if (abiMatch) {
            const abis = abiMatch[1].match(/["']([^"']+)["']/g);
            if (abis) {
                abis.forEach(a => {
                    const clean = a.replace(/["']/g, "");
                    if (!this.androidModel.abiFilters.includes(clean)) {
                        this.androidModel.abiFilters.push(clean);
                    }
                });
            }
        }
    }

    _parseCMakeAndMakefiles(path, lines, text, fileBoxId) {
        const addLibRegex = /add_library\s*\(\s*([a-zA-Z0-9_-]+)\s+(?:SHARED|STATIC|MODULE|OBJECT)?\s*([^)]+)\)/g;
        let m;
        while ((m = addLibRegex.exec(text)) !== null) {
            const targetName = m[1];
            const args = m[2].split(/\s+/).map(s => s.trim()).filter(Boolean);
            const explicitSources = args.filter(a => /\.(c|cpp|cc|cxx|s|asm)$/i.test(a));
            const lineNum = text.slice(0, m.index).split('\n').length;

            const targetObj = {
                targetName,
                soFileName: `lib${targetName}.so`,
                buildFile: path,
                line: lineNum,
                explicitSources,
                sourceGlobs: [],
                linkedLibs: []
            };
            this.androidModel.nativeTargets.push(targetObj);

            const libBoxId = `nativelib:${path}:${targetName}`;
            this.addBox(new ConceptualBox(libBoxId, "native_lib", "build_system", "BUILD_CONFIG", {
                name: `lib${targetName}.so`,
                filePath: path,
                line: lineNum,
                signature: `CMake Target '${targetName}' -> lib/arm64-v8a/lib${targetName}.so (${explicitSources.length} explicit sources)`,
                snippet: m[0].slice(0, 450),
                packaging: "PACKAGED_NATIVE_SO"
            }));
            this.addTether(fileBoxId, libBoxId, 0.95, "compiles_into_so");
            this.lexicon.learn(`lib${targetName}.so`, `Packaged Android native shared library built by target '${targetName}' in ${path}:${lineNum}.`, "android_packaging", [targetName, "shared_library"], [], path);
        }

        const globRegex = /file\s*\(\s*GLOB(?:_RECURSE)?\s+[a-zA-Z0-9_]+\s+([^)]+)\)/g;
        let gm;
        while ((gm = globRegex.exec(text)) !== null) {
            const patterns = gm[1].split(/\s+/).map(s => s.replace(/["']/g, "").trim()).filter(Boolean);
            if (this.androidModel.nativeTargets.length > 0) {
                this.androidModel.nativeTargets[this.androidModel.nativeTargets.length - 1].sourceGlobs.push(...patterns);
            }
        }

        const linkRegex = /target_link_libraries\s*\(\s*([a-zA-Z0-9_-]+)\s+([^)]+)\)/g;
        let lm;
        while ((lm = linkRegex.exec(text)) !== null) {
            const tName = lm[1];
            const libs = lm[2].split(/\s+/).filter(l => !["PRIVATE", "PUBLIC", "INTERFACE", "${log-lib}"].includes(l) && !l.startsWith("$"));
            const target = this.androidModel.nativeTargets.find(t => t.targetName === tName);
            if (target) {
                target.linkedLibs.push(...libs);
            }
        }

        const localModMatch = text.match(/LOCAL_MODULE\s*:=\s*([a-zA-Z0-9_-]+)/);
        if (localModMatch) {
            const targetName = localModMatch[1];
            const srcMatch = text.match(/LOCAL_SRC_FILES\s*[:+]=\s*([^\n\\]+(?:\\\n[^\n\\]+)*)/);
            const explicitSources = srcMatch
                ? srcMatch[1].replace(/\\\n/g, " ").split(/\s+/).filter(s => /\.(c|cpp|s|asm)$/i.test(s))
                : [];
            this.androidModel.nativeTargets.push({
                targetName,
                soFileName: `lib${targetName}.so`,
                buildFile: path,
                line: 1,
                explicitSources,
                sourceGlobs: [],
                linkedLibs: []
            });
        }
    }

    _parseJavaKotlinAndroid(path, lines, fileBoxId) {
        let currentPackage = "";
        let currentClass = path.split('/').pop().replace(/\.(java|kt)$/, "");

        const pkgRegex = /^\s*package\s+([a-zA-Z0-9_.]+)/;
        const clsRegex = /\b(?:class|object)\s+([a-zA-Z0-9_]+)/;
        const loadLibRegex = /System\.loadLibrary\s*\(\s*["']([^"']+)["']\s*\)/;
        const javaNativeRegex = /\b(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:native|external)\s+(?:fun\s+)?[a-zA-Z0-9_<>\[\],\s]+\s+([a-zA-Z0-9_]+)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            const pm = trimmed.match(pkgRegex);
            if (pm) currentPackage = pm[1];

            const cm = trimmed.match(clsRegex);
            if (cm) currentClass = cm[1];

            const lm = trimmed.match(loadLibRegex);
            if (lm) {
                const libName = lm[1];
                const soFileName = `lib${libName}.so`;
                this.androidModel.loadedLibraries.push({
                    libName,
                    soFileName,
                    filePath: path,
                    line: i + 1
                });
                this.lexicon.learn(soFileName, `Native library loaded at runtime via System.loadLibrary("${libName}") in ${path}:${i + 1}.`, "android_packaging", [libName, "loadlibrary"], [], path);
            }

            const nm = trimmed.match(javaNativeRegex);
            if (nm) {
                const methodName = nm[1];
                const mangledPkg = currentPackage.replace(/_/g, "_1").replace(/\./g, "_");
                const mangledCls = currentClass.replace(/_/g, "_1");
                const mangledMethod = methodName.replace(/_/g, "_1");
                const expectedJniSymbol = mangledPkg
                    ? `Java_${mangledPkg}_${mangledCls}_${mangledMethod}`
                    : `Java_${mangledCls}_${mangledMethod}`;

                this.androidModel.javaNativeMethods.push({
                    className: currentClass,
                    packageName: currentPackage,
                    methodName,
                    expectedJniSymbol,
                    filePath: path,
                    line: i + 1,
                    boundCBoxId: null
                });
            }
        }
    }

    _auditFileForAlignmentAndPorting(path, ext, execRole, lines, fullText) {
        if (path.endsWith("CMakeLists.txt") || path.endsWith("Android.mk")) {
            if (!fullText.includes("max-page-size=16384") && !fullText.includes("16384")) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "Android 15+ 16KB ELF Page Alignment",
                    filePath: path,
                    line: 1,
                    code: path.split('/').pop(),
                    reason: "Missing '-Wl,-z,max-page-size=16384' linker flag required for Android 15+ 16 KB page-size device compatibility.",
                    fixSuggestion: `target_link_options(\${PROJECT_NAME} PRIVATE "-Wl,-z,max-page-size=16384")`
                });
            }
        }

        if (!["c", "cpp", "h", "hpp", "java", "kt"].includes(ext)) return;

        const ptrTruncRegex = /\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)\s*(?:&?[a-zA-Z_][a-zA-Z0-9_]*(?:->|\.)?[a-zA-Z0-9_]*)/;
        const longFieldRegex = /^\s*(?:unsigned\s+)?long\s+[a-zA-Z_][a-zA-Z0-9_*\[\]\s]*;/;
        const unalignedCastRegex = /\*\s*\(\s*(?:u32|s32|u16|s16|uint32_t|uint16_t)\s*\*\s*\)/;
        const dmaBufferRegex = /\b(?:Gfx|Vtx|Mtx|OSTask|OSMesg)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\[/;
        const rawHwIoRegex = /\b(?:IO_READ|IO_WRITE|PHYS_TO_K0|K0_TO_PHYS|osPiStartDma|osViSwapBuffer)\s*\(/;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

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
                snippet,
                packaging: "REFERENCE_DOC"
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

        // 1. Resolve #include dependencies bidirectionally (includes & includedBy)
        for (const [path, summary] of this.fileSummaries.entries()) {
            const srcFileId = `file:${path}`;

            for (const inc of summary.includes) {
                const targetPath = allPaths.find(p => p.endsWith(`/${inc}`) || p === inc);
                if (targetPath) {
                    this.addTether(srcFileId, `file:${targetPath}`, 0.75, "includes");
                    const tgtSum = this.fileSummaries.get(targetPath);
                    if (tgtSum && !tgtSum.includedBy.includes(path)) {
                        tgtSum.includedBy.push(path);
                    }
                }
            }

            const uniqueCalls = Array.from(new Set(summary.calls.map(c => c.callee))).slice(0, 45);
            for (const callee of uniqueCalls) {
                const targetBoxIds = this.symbolToBoxIds.get(callee.toLowerCase());
                if (targetBoxIds) {
                    for (const tgtId of targetBoxIds.slice(0, 3)) {
                        this.addTether(srcFileId, tgtId, 0.65, "calls");
                    }
                }
            }
        }

        // 2. Link AndroidManifest components to Java/Kotlin class files
        for (const comp of this.androidModel.components) {
            const matchFile = allPaths.find(p => p.endsWith(`/${comp.shortName}.java`) || p.endsWith(`/${comp.shortName}.kt`));
            if (matchFile) {
                this.addTether(`manifest:${comp.filePath}:${comp.line}:${comp.shortName}`, `file:${matchFile}`, 0.95, "launches_component");
            }
        }

        // 3. Link System.loadLibrary(...) calls to CMake/Android.mk native .so targets
        for (const lib of this.androidModel.loadedLibraries) {
            const target = this.androidModel.nativeTargets.find(t => t.targetName === lib.libName);
            if (target) {
                this.addTether(`file:${lib.filePath}`, `nativelib:${target.buildFile}:${target.targetName}`, 0.95, "loads_native_lib");
            } else {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "Unmatched System.loadLibrary Target",
                    filePath: lib.filePath,
                    line: lib.line,
                    code: `System.loadLibrary("${lib.libName}")`,
                    reason: `Java/Kotlin loads '${lib.soFileName}', but no matching add_library(${lib.libName} ...) target was found in CMakeLists.txt or Android.mk.`,
                    fixSuggestion: `add_library(${lib.libName} SHARED ...)`
                });
            }
        }

        // 4. Mark C/C++ files compiled into native .so targets and wire tethers
        for (const target of this.androidModel.nativeTargets) {
            const libBoxId = `nativelib:${target.buildFile}:${target.targetName}`;
            for (const srcRel of target.explicitSources) {
                const cleanSrc = srcRel.replace(/^\$\{CMAKE_CURRENT_SOURCE_DIR\}\//, "").replace(/^\.\//, "");
                const matchedPath = allPaths.find(p => p.endsWith(`/${cleanSrc}`) || p === cleanSrc);
                if (matchedPath) {
                    const sum = this.fileSummaries.get(matchedPath);
                    if (sum) sum.packaging = `PACKAGED_IN_${target.soFileName}`;
                    const fBox = this.boxes.get(`file:${matchedPath}`);
                    if (fBox) fBox.payload.packaging = `PACKAGED_IN_${target.soFileName}`;
                    this.addTether(`file:${matchedPath}`, libBoxId, 0.9, "compiles_into_so");
                }
            }
        }

        // 5. Bind Java/Kotlin native methods to C/C++ JNIEXPORT implementations
        for (const jniMethod of this.androidModel.javaNativeMethods) {
            const expectedKey = jniMethod.expectedJniSymbol.toLowerCase();
            const fallbackSuffix = `_${jniMethod.methodName.toLowerCase()}`;
            let matchedCBoxId = null;

            for (const [symKey, boxIds] of this.symbolToBoxIds.entries()) {
                if (symKey === expectedKey || (symKey.startsWith("java_") && symKey.endsWith(fallbackSuffix))) {
                    matchedCBoxId = boxIds[0];
                    break;
                }
            }

            if (matchedCBoxId) {
                jniMethod.boundCBoxId = matchedCBoxId;
                this.addTether(`file:${jniMethod.filePath}`, matchedCBoxId, 0.95, "binds_jni");
            } else {
                this.auditFindings.push({
                    severity: "CRITICAL",
                    category: "Unresolved JNI Native Binding",
                    filePath: jniMethod.filePath,
                    line: jniMethod.line,
                    code: `native ${jniMethod.methodName}(...) -> ${jniMethod.expectedJniSymbol}`,
                    reason: `Java/Kotlin native method '${jniMethod.className}.${jniMethod.methodName}' has no matching C/C++ '${jniMethod.expectedJniSymbol}' implementation; calling it at runtime throws UnsatisfiedLinkError.`,
                    fixSuggestion: `extern "C" JNIEXPORT void JNICALL ${jniMethod.expectedJniSymbol}(JNIEnv* env, jobject thiz) { /* TODO */ }`
                });
            }
        }

        // 6. Propagate Runtime Reachability from Android & Native Entry Points
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

    analyzeAndroidPackagingAndOperation() {
        if (this.fileSummaries.size === 0) {
            return {
                html: `<strong>Android APK Packaging & Runtime Operation Inspector:</strong><br>No workspace mounted yet. Click <strong>Open Workspace</strong> to inspect AndroidManifest.xml, Gradle/CMake native libraries, packaged assets, and the runtime boot-to-frame execution flow.`,
                synthesizedDiff: null
            };
        }

        const am = this.androidModel;
        const allSums = Array.from(this.fileSummaries.entries());
        const dexFiles = allSums.filter(([, s]) => s.packaging === "PACKAGED_DEX").length;
        const packagedSoSrc = allSums.filter(([, s]) => s.packaging.startsWith("PACKAGED_IN_")).length;
        const candidateNative = allSums.filter(([, s]) => s.packaging === "CANDIDATE_NATIVE_SO").length;
        const assetFiles = am.packagedAssets.filter(a => a.category === "asset").length;
        const resFiles = am.packagedAssets.filter(a => a.category === "resource").length;
        const prebuiltSo = am.packagedAssets.filter(a => a.category === "prebuilt_so").length;
        const offlineTools = allSums.filter(([, s]) => s.packaging === "UNPACKAGED_HOST_TOOL").length;

        const pkgId = am.applicationId || am.packageName || "Not detected (no Manifest/Gradle)";
        const sdkRange = (am.minSdk || am.targetSdk) ? `minSdk ${am.minSdk || "?"} / targetSdk ${am.targetSdk || "?"}` : "Not declared";
        const abis = am.abiFilters.length > 0 ? am.abiFilters.join(", ") : "Default NDK ABIs (verify arm64-v8a)";

        let html = `<strong>Android Dependent Files, APK Packaging & Runtime Operation:</strong><br>`;
        html += `• <strong>App Identity & ABI:</strong> <code>${pkgId}</code> | ${sdkRange} | ABIs: <code>${abis}</code>${am.extractNativeLibs ? ` | extractNativeLibs=<code>${am.extractNativeLibs}</code>` : ""}<br>`;
        html += `• <strong>APK Payload Breakdown:</strong><br>`;
        html += `&nbsp;&nbsp;1. <code>AndroidManifest.xml</code> (${am.manifestFiles.length} file): ${am.components.length} components (${am.components.map(c => `<code>&lt;${c.kind}&gt; ${c.shortName}${c.isLauncher ? " [LAUNCHER]" : ""}</code>`).join(", ") || "none"})<br>`;
        html += `&nbsp;&nbsp;2. <code>classes.dex</code>: ${dexFiles} Java/Kotlin source files (${am.javaNativeMethods.length} <code>native</code> JNI declarations)<br>`;
        html += `&nbsp;&nbsp;3. <code>lib/arm64-v8a/*.so</code>: ${am.nativeTargets.length} native target(s) [${am.nativeTargets.map(t => `<code>${t.soFileName}</code>`).join(", ") || "none"}] (${packagedSoSrc} explicitly compiled C/C++ files, ${candidateNative} candidate C/C++ runtime files, ${prebuiltSo} prebuilt <code>.so</code>)<br>`;
        html += `&nbsp;&nbsp;4. <code>assets/</code> & <code>res/</code>: ${assetFiles} asset files, ${resFiles} resource files (${offlineTools} host tools in <code>tools/</code> excluded from APK)<br>`;

        const launcher = am.components.find(c => c.isLauncher) || am.components[0];
        const services = am.components.filter(c => c.kind === "service");
        const loadedLibs = am.loadedLibraries.map(l => `<code>${l.soFileName}</code> (in <code>${l.filePath.split('/').pop()}:${l.line}</code>)`).join(", ");
        const boundJni = am.javaNativeMethods.filter(m => m.boundCBoxId).length;
        const unboundJni = am.javaNativeMethods.length - boundJni;

        html += `<div style="margin-top:6px;"><strong>End-to-End Runtime Execution Pipeline:</strong><br>`;
        html += `1. <strong>Entry Launch:</strong> ${launcher ? `Android OS instantiates <code>${launcher.name}</code>` : "Android Runtime entry"}${services.length > 0 ? ` + background service(s) <code>${services.map(s => s.shortName).join(", ")}</code>` : ""}<br>`;
        html += `2. <strong>Native Library Load:</strong> ${loadedLibs || "No explicit System.loadLibrary() detected"}<br>`;
        html += `3. <strong>JNI Bridge Binding:</strong> ${boundJni}/${am.javaNativeMethods.length} Java/Kotlin <code>native</code> methods bound to C/C++ <code>JNIEXPORT</code> symbols${unboundJni > 0 ? ` (<span style="color:#ff7b72;">${unboundJni} unresolved</span>)` : ""}<br>`;
        html += `4. <strong>Native Execution & HAL:</strong> Executes ${this.runtimeReachable.size} runtime-reachable C/C++ functions across N64 core & <code>libultra</code>, rendering via ${am.features.join(", ") || "SurfaceView / GLES / AAudio"}.</div>`;

        return { html, synthesizedDiff: null };
    }

    traceFileOrSymbol(targetQuery) {
        const clean = targetQuery.replace(/^(trace|inspect|where is|usage of|usages of|dependencies of|who calls|file)\s+/i, "").trim();
        const lower = clean.toLowerCase();

        const matchedPath = Array.from(this.fileSummaries.keys()).find(p =>
            p.toLowerCase() === lower || p.toLowerCase().endsWith(`/${lower}`) || p.toLowerCase().includes(lower)
        );

        if (matchedPath) {
            const sum = this.fileSummaries.get(matchedPath);
            const isAndroidBuild = sum.packaging === "PACKAGED_MANIFEST" || sum.packaging === "BUILD_RECIPE";
            let html = `<strong>Complete File & Packaging Trace: <code>${matchedPath}</code></strong><br>`;
            html += `• <strong>APK Packaging Role:</strong> <code>${sum.packaging}</code> | Domain: <em>${sum.domain}</em> | Execution Role: <em>${sum.execRole}</em> (${sum.lines} lines)<br>`;
            html += `• <strong>Outgoing Dependencies (#include / imports):</strong> ${sum.includes.length > 0 ? sum.includes.slice(0, 8).map(i => `<code>${i}</code>`).join(", ") : "None"}<br>`;
            html += `• <strong>Incoming Dependents (Included by):</strong> ${sum.includedBy.length > 0 ? sum.includedBy.slice(0, 6).map(i => `<code>${i}</code>`).join(", ") : "Top-level entry or build-configured unit"}<br>`;
            html += `• <strong>Defined Symbols (${sum.symbols.length}):</strong> ${sum.symbols.length > 0 ? sum.symbols.slice(0, 10).map(s => `<code>${s}</code>`).join(", ") : "None"}<br>`;

            const fileFindings = this.auditFindings.filter(f => f.filePath === matchedPath);
            if (fileFindings.length > 0) {
                html += `• <span style="color:#ff7b72;"><strong>Alignment / Packaging Findings (${fileFindings.length}):</strong></span> ${fileFindings.slice(0, 3).map(f => `[${f.severity}] L${f.line}: ${f.category}`).join("; ")}`;
            } else if (!isAndroidBuild) {
                html += `• <strong>Alignment & ABI Status:</strong> Clean (0 pointer truncation, LP64, or DMA alignment issues flagged).`;
            }

            return { html, synthesizedDiff: null };
        }

        const cg = this.callGraph.get(lower) || Array.from(this.callGraph.entries()).find(([k]) => k.includes(lower))?.[1];
        if (cg) {
            const isReachable = this.runtimeReachable.has(cg.canonicalName.toLowerCase());
            const callerEntries = Array.from(cg.callers.entries());
            const totalSites = callerEntries.reduce((acc, [, lns]) => acc + lns.length, 0);

            let html = `<strong>Complete Symbol & Runtime Usage Trace: <code>${cg.canonicalName}</code></strong><br>`;
            html += `• <strong>Runtime Reachability:</strong> <strong>${isReachable ? "ACTIVE ANDROID RUNTIME PATH" : "INDIRECT / EXTERNAL JNI"}</strong><br>`;
            if (cg.definedIn.length > 0) {
                html += `• <strong>Defined At:</strong> ${cg.definedIn.map(d => {
                    const pkg = this.fileSummaries.get(d.filePath)?.packaging || "WORKSPACE";
                    return `<code>${d.filePath}:${d.line}</code> [<code>${pkg}</code>]`;
                }).join(", ")}<br>`;
            }
            html += `• <strong>Callers (${totalSites} call sites across ${callerEntries.length} files):</strong> ${callerEntries.length > 0 ? callerEntries.slice(0, 6).map(([f, lns]) => `<code>${f}:${lns.slice(0, 3).join(",")}</code>`).join(", ") : "Root entry / JNI callback"}<br>`;
            html += `• <strong>Callees (${cg.callees.size} downstream functions):</strong> ${cg.callees.size > 0 ? Array.from(cg.callees).slice(0, 8).map(c => `<code>${c}</code>`).join(", ") : "Leaf function"}`;

            return { html, synthesizedDiff: null };
        }

        return null;
    }

    runFullPortAudit() {
        if (this.boxes.size === 0) {
            return {
                html: `<strong>Port Perfection & Alignment Audit:</strong><br>No workspace mounted yet. Click <strong>Open Workspace</strong> to scan your codebase for ARM64 LP64, MTE pointer truncation, 16KB ELF page alignment, JNI bindings, and runtime call-path issues.`,
                synthesizedDiff: null
            };
        }

        const crit = this.auditFindings.filter(f => f.severity === "CRITICAL");
        const high = this.auditFindings.filter(f => f.severity === "HIGH");
        const med = this.auditFindings.filter(f => f.severity === "MEDIUM");

        const allSummaries = Array.from(this.fileSummaries.values());
        const runtimeFiles = allSummaries.filter(s => s.execRole !== "OFFLINE_BUILD_TOOL").length;
        const offlineFiles = allSummaries.filter(s => s.execRole === "OFFLINE_BUILD_TOOL").length;
        const mipsAsmFiles = allSumsCount(allSummaries, s => s.domain === "mips_asm");

        let html = `<strong>Port Perfection & Android Alignment Audit (${runtimeFiles} runtime/build files scanned, ${offlineFiles} offline tool files isolated):</strong><br>`;
        html += `• <strong>Severity Breakdown:</strong> <span style="color:#ff7b72;">${crit.length} CRITICAL</span> (Pointer Truncation/MTE/Unresolved JNI), <span style="color:#d29922;">${high.length} HIGH</span> (LP64/16KB Page/LoadLibrary), <span style="color:#58a6ff;">${med.length} MEDIUM</span> (DMA Alignment/HAL Stubs).<br>`;
        if (mipsAsmFiles > 0) {
            html += `• <strong>Architecture Completeness:</strong> Detected <code>${mipsAsmFiles}</code> raw MIPS <code>.s</code> assembly files requiring C/ARM64 decompilation parity for full <code>aarch64</code> execution.<br>`;
        }

        const topFindings = this.auditFindings.slice(0, 5);
        if (topFindings.length > 0) {
            html += `<div style="margin-top:6px;"><strong>Top Actionable Alignment, JNI & Packaging Defects:</strong><br>`;
            for (const f of topFindings) {
                html += `• <strong>[${f.severity}] ${f.category}</strong> at <code>${f.filePath}:${f.line}</code><br>&nbsp;&nbsp;<em>Why:</em> ${f.reason}<br>`;
            }
            html += `</div>`;
        } else {
            html += `• Zero static LP64, pointer truncation, JNI mismatch, or 16KB page-alignment violations detected across scanned runtime files.`;
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

        if (q.startsWith("trace ") || q.startsWith("inspect ") || q.includes("who calls") || q.includes("usages of") || q.includes("dependencies of")) {
            const traced = this.traceFileOrSymbol(queryText);
            if (traced) return traced;
        }

        const isPackagingOrRuntimeOp = q.includes("packag") || q.includes("apk") || q.includes("manifest") || q.includes("gradle") || q.includes("cmake") || q.includes("operate") || q.includes("operation") || q.includes("android dependent") || q.includes("android file") || q.includes("boot") || q.includes("lifecycle");
        if (isPackagingOrRuntimeOp) {
            return this.analyzeAndroidPackagingAndOperation();
        }

        const isAuditQuery = q.includes("audit") || q.includes("alignment") || q.includes("perfection") || q.includes("flaw") || q.includes("defect") || q.includes("truncat") || q.includes("16kb") || q.includes("lp64");
        if (isAuditQuery) {
            return this.runFullPortAudit();
        }

        const isOverviewQuery = q.includes("port state") || q.includes("status") || q.includes("overview") || q.includes("architecture") || q.includes("summarize");
        if (isOverviewQuery) {
            return this.analyzeAndroidPackagingAndOperation();
        }

        if (q.split(/\s+/).length <= 3) {
            const directTrace = this.traceFileOrSymbol(queryText);
            if (directTrace) return directTrace;
        }

        const { rawTokens, expandedTokens, activatedBoxes, activeTethers } = this.retrieveAndActivate(queryText);

        const isCrashQuery = q.includes("segv") || q.includes("crash") || q.includes("fault") || q.includes("error") || q.includes("debug");
        const isPatchQuery = q.includes("fix") || q.includes("patch") || q.includes("implement") || q.includes("wrap");

        let html = "";
        let synthesizedDiff = null;

        if (this.boxes.size === 0) {
            html = `<strong>Neuro-Symbolic Engine Ready:</strong><br>Mount your Android/N64 workspace folder or ingest N64 manuals to inspect Android packaging, runtime call paths, and ARM64 alignment.`;
            return { html, synthesizedDiff: null };
        }

        html += `<strong>Conceptual Graph Reasoning (${activatedBoxes.length} runtime nodes, ${activeTethers.length} active tethers):</strong><br>`;
        if (activatedBoxes.length > 0) {
            for (const box of activatedBoxes.slice(0, 5)) {
                const conf = Math.round(box.activation * 100);
                const pkg = box.payload.packaging || box.execRole;
                html += `• <code>${box.payload.filePath}:${box.payload.line}</code> — <strong>${box.payload.name}</strong> [<code>${pkg}</code>, ${conf}%]<br>`;
            }
            if (activeTethers.length > 0) {
                const edgeSummary = activeTethers.slice(0, 3).map(t => {
                    const src = this.boxes.get(t.sourceId)?.payload.name || t.sourceId;
                    const tgt = this.boxes.get(t.targetId)?.payload.name || t.targetId;
                    return `<code>${src}</code> &rarr; (<em>${t.relation}</em>) &rarr; <code>${tgt}</code>`;
                }).join("<br>");
                html += `<div style="margin-top:6px;"><strong>Traced Dependency / Runtime Tethers:</strong><br>${edgeSummary}</div>`;
            }
        } else {
            html += `Expanded semantic query across [<em>${expandedTokens.slice(0, 8).join(", ")}</em>]. Try <code>apk packaging</code>, <code>audit alignment</code>, or <code>trace &lt;file_or_symbol&gt;</code>.`;
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
            auditFindings: this.auditFindings,
            androidModel: this.androidModel
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
        if (data.androidModel) this.androidModel = data.androidModel;
        this.finalizeCrossReferences();
    }
}

function allSumsCount(arr, pred) {
    let c = 0;
    for (const item of arr) if (pred(item)) c++;
    return c;
}
