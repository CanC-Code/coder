class ConceptualBox {
    constructor(id, type, domain, execRole, payload) {
        this.id = id;
        this.type = type;         // 'file' | 'symbol' | 'jni_bridge' | 'manual_section' | 'build_config' | 'android_component' | 'native_lib' | 'android_api_doc' | 'android_resource'
        this.domain = domain;     // 'n64_core' | 'libultra' | 'android_wrapper' | 'build_system' | 'offline_tool' | 'n64_manual' | 'android_sdk' | 'android_ui' | 'android_packaging' | 'mips_asm'
        this.execRole = execRole; // 'ENTRY_POINT' | 'HOT_PATH_RUNTIME' | 'JNI_BOUNDARY' | 'BUILD_CONFIG' | 'OFFLINE_BUILD_TOOL' | 'REFERENCE_DOC' | 'UI_LAYER' | 'APK_PAYLOAD'
        this.payload = payload;   // { name, filePath, line, signature, snippet, packaging }
        this.activation = 0.0;
    }
}

class Tether {
    constructor(sourceId, targetId, weight = 0.5, relation = "relates_to") {
        this.sourceId = sourceId;
        this.targetId = targetId;
        this.weight = Math.max(0.05, Math.min(1.0, weight));
        this.relation = relation; // 'defines' | 'calls' | 'includes' | 'binds_jni' | 'binds_jni_dynamic' | 'reverse_jni_lookup' | 'loads_native_lib' | 'compiles_into_so' | 'launches_component' | 'links_prefab' | 'binds_resource' | 'documents'
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
        this._seedCompleteAndroidAndN64Ontology();
    }

    _seedCompleteAndroidAndN64Ontology() {
        const seeds = [
            // --- 1. Core Android App Components, Context, IPC & System Services (developer.android.com/guide/components) ---
            ["activity", "android.app.Activity: Single focused UI screen with lifecycle callbacks onCreate -> onStart -> onResume -> onPause -> onStop -> onDestroy. Games/native wrappers must declare android:configChanges=\"orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize\" to prevent ANativeWindow destruction on rotation.", "android_sdk", ["gameactivity", "nativeactivity", "appcompatactivity", "componentactivity"], ["service"]],
            ["service", "android.app.Service: Background or foreground execution component without UI. Android 14+ (API 34+) requires explicit android:foregroundServiceType and matching FOREGROUND_SERVICE_* permission before calling startForeground().", "android_sdk", ["foreground_service", "bound_service", "intentservice", "workmanager", "startforeground"], ["activity"]],
            ["broadcastreceiver", "android.content.BroadcastReceiver: Event listener for system or app Intents. Android 14+ (API 34+) requires explicit Context.RECEIVER_EXPORTED or Context.RECEIVER_NOT_EXPORTED flag on every runtime Context.registerReceiver() call.", "android_sdk", ["receiver", "registerreceiver", "receiver_exported", "receiver_not_exported", "sendbroadcast"], []],
            ["contentprovider", "android.content.ContentProvider: Structured data sharing interface across apps via URI and ContentResolver; enforces URI permissions and Scoped Storage.", "android_sdk", ["provider", "contentresolver", "fileprovider"], []],
            ["intent", "android.content.Intent: Asynchronous messaging object binding Activities, Services, and BroadcastReceivers. Implicit intents cannot start Services (API 21+) and PendingIntents require FLAG_IMMUTABLE or FLAG_MUTABLE (API 31+).", "android_sdk", ["pendingintent", "flag_immutable", "intent_filter", "action_main", "category_launcher"], []],
            ["context", "android.content.Context: Gateway to app resources, AssetManager, getFilesDir(), getExternalFilesDir(), and system services. Never store an Activity Context in a static field or native global to avoid memory leaks.", "android_sdk", ["applicationcontext", "getapplicationcontext", "getfilesdir", "getexternalfilesdir"], []],
            ["looper", "android.os.Looper & Handler / ALooper: Thread message queue loop. Native threads must poll ALooper_pollOnce() (replacing deprecated ALooper_pollAll) to process input and lifecycle events.", "android_sdk", ["handler", "alooper", "alooper_pollonce", "messagequeue"], []],
            ["binder", "android.os.Binder / AIDL: Android kernel-mediated IPC transaction mechanism with a 1 MB per-process transaction buffer limit; never pass large framebuffers or ROMs over Binder.", "android_sdk", ["aidl", "ibinder", "parcelable", "transactiontoolargeexception"], []],

            // --- 2. Jetpack Compose, Modern Kotlin Architecture & State Management (developer.android.com/jetpack/compose) ---
            ["composable", "@Composable (Jetpack Compose): Declarative Kotlin UI function driven by immutable state. Must be idempotent and side-effect free during recomposition; wrap async work in LaunchedEffect or SideEffect.", "android_ui", ["compose", "recomposition", "launchedeffect", "sideeffect", "disposableeffect", "modifier"], ["xml_layout"]],
            ["viewmodel", "androidx.lifecycle.ViewModel: Lifecycle-aware state holder surviving configuration changes. Exposes immutable StateFlow<UiState> collected safely in UI via collectAsStateWithLifecycle().", "android_ui", ["stateflow", "mutablestateflow", "collectasstatewithlifecycle", "viewmodelscope", "livedata"], []],
            ["coroutines", "Kotlin Coroutines & Structured Concurrency: Dispatchers.Main for UI, Dispatchers.IO for disk/network/ROM I/O, Dispatchers.Default for CPU work. Never use GlobalScope; bind to viewModelScope or lifecycleScope.", "android_ui", ["suspend", "flow", "dispatchers", "lifecyclescope", "launch", "withcontext"], []],
            ["hilt", "Dagger Hilt Dependency Injection (@HiltAndroidApp, @AndroidEntryPoint, @HiltViewModel, @Inject): Compile-time dependency graph wired to Android component lifecycles.", "android_ui", ["dagger", "hiltandroidapp", "androidentrypoint", "hiltviewmodel", "inject"], []],
            ["room", "Jetpack Room Persistence (@Entity, @Dao, @Database): Compile-time verified SQLite abstraction supporting suspend functions and reactive Flow queries.", "android_ui", ["sqlite", "dao", "database", "datastore"], []],
            ["workmanager", "Jetpack WorkManager (CoroutineWorker): Guaranteed deferrable background task scheduler persisting across app restarts and reboots.", "android_ui", ["worker", "coroutineworker", "periodicworkrequest", "onetimeworkrequest"], []],
            ["navigation", "Jetpack Navigation (NavHost, NavController): Single-Activity navigation graph supporting type-safe Kotlin serializable routes and deep links.", "android_ui", ["navhost", "navcontroller", "composable_route"], []],

            // --- 3. Edge-to-Edge, WindowInsets, Large Screens & XML Resources (developer.android.com/develop/ui) ---
            ["edgetoedge", "Edge-to-Edge & WindowInsets (enableEdgeToEdge / ViewCompat.setOnApplyWindowInsetsListener): Android 15-17 enforce edge-to-edge display by default; pad HUDs and touch controls using systemBars() and displayCutout() insets.", "android_ui", ["enableedgetoedge", "windowinsets", "displaycutout", "systembars", "insets"], []],
            ["viewbinding", "ViewBinding & XML Resources (R.layout.*, R.id.*, R.string.*): Null-safe, type-safe binding classes generated from res/layout/*.xml replacing legacy findViewById() and kotlin-android-extensions.", "android_ui", ["findviewbyid", "r_layout", "r_id", "r_string", "databinding"], []],
            ["largescreen", "Android 17+ Large-Screen & Adaptive Layout Enforcement (sw >= 600dp): Android 17 ignores screenOrientation, setRequestedOrientation(), and resizeableActivity=\"false\" on tablets, foldables, and desktop windows unless android:appCategory=\"game\" is declared.", "android_compliance", ["appcategory", "setrequestedorientation", "resizeableactivity", "foldable", "tablet", "desktop_windowing"], []],

            // --- 4. Android NDK, JNI & ART Runtime (developer.android.com/ndk) ---
            ["jni", "Java Native Interface (JNI): C/C++ bridge to Android ART JVM via JNIEnv* (per-thread) and JavaVM* (process-wide). Supports static Java_pkg_Class_method exports and dynamic JNI_OnLoad + RegisterNatives(JNINativeMethod[]).", "android_ndk", ["jnienv", "javavm", "jni_onload", "registernatives", "jninativemethod", "jniexport"], []],
            ["registernatives", "JNIEnv::RegisterNatives: Dynamic native method registration inside JNI_OnLoad binding JNINativeMethod{name, signature, fnPtr} tables without exported Java_* symbol names; faster lookup and compatible with obfuscated Java classes.", "android_ndk", ["jni_onload", "jninativemethod", "dynamic_jni"], []],
            ["localref", "JNI Local Reference Table: ART limits local JNI references (jobject, jstring, jbyteArray) per native frame. Loops creating local refs must call env->DeleteLocalRef() or PushLocalFrame/PopLocalFrame to prevent JNI table overflow crashes.", "android_ndk", ["deletelocalref", "newglobalref", "deleteglobalref", "pushlocalframe", "poplocalframe"], []],
            ["attachcurrentthread", "JavaVM::AttachCurrentThread: Required before a native pthread or std::thread can obtain a valid JNIEnv* and invoke Java callbacks; must pair with DetachCurrentThread before thread exit.", "android_ndk", ["detachcurrentthread", "getenv", "javavm"], []],
            ["aassetmanager", "NDK AssetManager (AAssetManager_fromJava / AAssetManager_open): Reads compressed or uncompressed files packaged inside APK assets/ directly from C/C++ without extracting to internal storage.", "android_ndk", ["aasset", "assetmanager", "assets", "aasset_open"], []],
            ["anativewindow", "NDK ANativeWindow: Native C/C++ handle to an Android Surface (SurfaceView / TextureView). Must lock via mutex across onNativeWindowCreated / surfaceDestroyed so render threads never write to a destroyed window.", "android_ndk", ["surfaceview", "surfaceholder", "surfacedestroyed", "surfacecreated", "anativewindow_fromsurface"], []],
            ["ahardwarebuffer", "NDK AHardwareBuffer: Zero-copy shared graphic/memory buffer across CPU, OpenGL ES, Vulkan, and Android MediaCodec / SurfaceComposer.", "android_ndk", ["graphicbuffer", "eglimage", "vkimportandroidhardwarebuffer"], []],
            ["ndk", "Android Native Development Kit (NDK r27-r29+): Clang/LLVM cross-compiler toolchain targeting arm64-v8a (aarch64) with bionic libc, Unified Headers, and CMake/ndk-build integration.", "android_ndk", ["aarch64", "arm64", "cmake", "ndk_build", "bionic", "clang"], []],

            // --- 5. AGDK, Graphics & Audio (developer.android.com/games/agdk) ---
            ["gameactivity", "Jetpack GameActivity (AGDK): Modern subclass of AppCompatActivity bridging Java lifecycle, input, and SurfaceView events to native C/C++ android_main(struct android_app*) via JNI without NativeActivity limitations.", "android_agdk", ["agdk", "android_main", "android_app", "app_cmd_term_window", "gametextinput"], []],
            ["swappy", "Android Frame Pacing Library (SwappyGL / SwappyVk): Synchronizes OpenGL ES / Vulkan frame submission with SurfaceFlinger Choreographer VSYNC intervals to eliminate frame jitter and latency.", "android_agdk", ["frame_pacing", "choreographer", "vsync", "swappygl", "swappyvk"], []],
            ["oboe", "Oboe / AAudio Low-Latency Audio: High-performance C++ audio stream API targeting AAudio (API 27+) with automatic OpenSL ES fallback, exclusive MMAP mode, and real-time audio callbacks.", "android_agdk", ["aaudio", "opensles", "audiostream", "audio_interface", "ai"], []],
            ["vulkan", "Vulkan on Android (VK_KHR_android_surface): Explicit low-overhead GPU API supporting descriptor indexing, push constants, and dynamic rendering for modern N64 RDP/HLE backends.", "android_graphics", ["vkcreateandroidsurfacekhr", "vkqueuepresentkhr", "spirv", "opengles", "egl"], []],
            ["egl", "EGL Context & Window Surface: Bridges OpenGL ES 3.x contexts to ANativeWindow via eglCreateWindowSurface and eglSwapBuffers.", "android_graphics", ["opengles", "gles3", "eglswapbuffers", "eglcreatewindowsurface"], []],

            // --- 6. Build System, Play Asset Delivery, R8 & Android 14-17+ Compliance ---
            ["apk", "Android Application Package (APK / AAB / Play Asset Delivery): Signed container holding AndroidManifest.xml (binary XML), classes.dex (ART bytecode), lib/arm64-v8a/*.so (16KB page-aligned native ELF), res/, resources.arsc, and assets/.", "android_packaging", ["aab", "bundle", "classes_dex", "zipalign", "apksigner", "shared_library", "assetpack"], []],
            ["manifest", "AndroidManifest.xml: Root app descriptor declaring package, uses-sdk, uses-permission, uses-feature, queries (package visibility), appCategory, and exported/foregroundServiceType rules.", "android_packaging", ["androidmanifest", "foregroundservicetype", "exported", "uses_permission", "uses_feature"], []],
            ["gradle", "Android Gradle Plugin (AGP 8/9) & Version Catalog (libs.versions.toml): Declarative Kotlin/Groovy build configuration managing compileSdk, targetSdk, ndkVersion, abiFilters, externalNativeBuild, and Prefab AAR packages.", "android_build", ["agp", "build_gradle", "build_gradle_kts", "libs_versions_toml", "prefab", "externalnativebuild"], []],
            ["r8", "R8 Shrinking, Optimization & Obfuscation: Compiles bytecode to DEX and strips unused classes/methods. Any Java/Kotlin class, field, or method accessed from C++ via JNI FindClass/GetMethodID MUST be retained with @Keep or proguard-rules.pro -keep rules.", "android_build", ["proguard", "keep", "findclass", "getmethodid", "getfieldid", "nosuchmethoderror"], []],
            ["pagesize16kb", "Android 15-17+ 16 KB ELF & Memory Page Alignment: Devices with 16 KB kernel pages require -Wl,-z,max-page-size=16384 in CMake/NDK, uncompressed 16 KB-aligned .so packaging (useLegacyPackaging=false), and sysconf(_SC_PAGESIZE) instead of hardcoded 4096 or PAGE_SIZE.", "android_compliance", ["16kb", "max_page_size", "16384", "sysconf", "sc_pagesize", "4096", "uselegacypackaging", "extractnativelibs"], []],
            ["saferdcl", "Android 17+ Safer Dynamic Code Loading (System.load Read-Only): Any native .so loaded dynamically via System.load(path) on targetSdk 37+ must be marked read-only (File.setReadOnly() / chmod 0444) before loading or ART throws UnsatisfiedLinkError.", "android_compliance", ["system_load", "setreadonly", "dcl", "dlopen"], []],
            ["alignment", "ARM64 ABI, LP64 & MTE Alignment: 64-bit pointers (LP64) where long is 8 bytes, 16-byte NEON/DMA struct alignment, and ARM64 Memory Tagging Extension (MTE) tag preservation (never cast pointers to u32/int).", "android_compliance", ["lp64", "mte", "tbi", "aligned", "uintptr_t", "neon"], ["unaligned"]],
            ["scopedstorage", "Scoped Storage (API 29-37+): Apps read/write private files in Context.getFilesDir() / getExternalFilesDir() without permissions, and shared media/ROMs via Storage Access Framework (ACTION_OPEN_DOCUMENT) or MediaStore instead of legacy WRITE_EXTERNAL_STORAGE.", "android_compliance", ["action_open_document", "saf", "mediastore", "write_external_storage", "manage_external_storage"], []],
            ["predictiveback", "Predictive Back Gesture (API 33-37+): Replaces deprecated Activity.onBackPressed() with OnBackPressedDispatcher and OnBackPressedCallback so Android system back-to-home animations work smoothly.", "android_compliance", ["onbackpressed", "onbackpresseddispatcher", "onbackpressedcallback", "enableonbackinvokedcallback"], []],
            ["segv", "SIGSEGV / SIGBUS / Tombstone Crash Analysis: Native ARM64 fault caused by null dereference, 32-bit pointer truncation, MTE tag mismatch, unaligned access, or race on destroyed ANativeWindow.", "debugging", ["segvdump", "sigsegv", "sigbus", "tombstone", "ndk_stack", "addr2line", "crash"], []],

            // --- 7. N64 Hardware & SDK Core ---
            ["rcp", "Reality Coprocessor: N64 main graphics and audio co-processor housing the RSP and RDP.", "n64_hardware", ["coprocessor", "reality_coprocessor"], ["cpu"]],
            ["rsp", "Reality Signal Processor: MIPS-based vector processor executing N64 geometry and audio microcode.", "n64_hardware", ["signal_processor", "microcode_engine", "ucode"], []],
            ["rdp", "Reality Display Processor: N64 hardware pixel rasterizer, z-buffer, and texture combiner.", "n64_hardware", ["display_processor", "rasterizer", "combiner"], []],
            ["libultra", "Official Nintendo 64 SDK runtime library providing OS threads, VI, AI, PI, SI, and GBI display list macros.", "n64_sdk", ["ultra64", "n64_os", "gbi"], []],
            ["gbi", "Graphics Binary Interface: N64 display list command format (gSP*, gDP*) translated to OpenGL ES / Vulkan on Android.", "n64_graphics", ["display_list", "f3dex", "f3dex2", "fast3d"], []],
            ["vi", "Video Interface: N64 framebuffer scanout hardware mapped to Android SurfaceView / ANativeWindow.", "n64_hardware", ["video_interface", "framebuffer", "swapbuffers", "surface"], []],
            ["ai", "Audio Interface: N64 DMA audio DAC output mapped to Android Oboe / AAudio.", "n64_hardware", ["audio_interface", "dma_audio"], []],
            ["pi", "Peripheral Interface: N64 cartridge ROM DMA engine mapped to Android AAssetManager / memory-mapped bundles.", "n64_hardware", ["peripheral_interface", "ospistartdma", "rom_dma"], []]
        ];

        for (const [term, def, domain, syns, ants] of seeds) {
            this.learn(term, def, domain, syns, ants, "developer.android.com");
        }
        if (typeof EMBEDDED_ANDROID_KNOWLEDGE !== "undefined") {
            for (const [term, def, domain, syns] of EMBEDDED_ANDROID_KNOWLEDGE) {
                this.learn(term, def, domain, syns || [], [], "developer.android.com");
            }
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
                entry.cluster.slice(0, 5).forEach(c => expanded.add(c));
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
        this.outgoingTethers = new Map(); // sourceId -> Tether[]
        this.tetherIndex = new Set(); // "src->tgt:rel"
        this.symbolTypes = new Map(); // "StructName.field" or "varName" -> declared C type
        this.macroTable = new Map();  // MACRO_NAME -> { value, numericVal, filePath, line, domain }
        this.stubCatalog = [];        // { name, signature, stubReason, filePath, line, endLine, decompImpl, manualDoc, callersCount }
        this.lexicon = new BidirectionalLexicon();

        this.invertedIndex = new Map();
        this.docLengths = new Map();
        this.avgDocLength = 1;
        this.totalDocs = 0;

        this.symbolToBoxIds = new Map();
        this.fileSummaries = new Map();     // path -> { lang, domain, execRole, packaging, lines, symbols, includes, includedBy, calls }
        this.callGraph = new Map();         // symbolLower -> { canonicalName, callers: Map<filePath, line[]>, callees: Set<string>, definedIn: [] }
        this.runtimeReachable = new Set();
        this.auditFindings = [];            // { severity, category, filePath, line, code, reason, fixSuggestion }
        this.lastActiveTethers = [];

        this.androidModel = this._createEmptyAndroidModel();
        this._seedAndroidDocsIntoGraph();
    }

    _createEmptyAndroidModel() {
        return {
            packageName: null,
            namespace: null,
            applicationId: null,
            appCategory: null,
            compileSdk: null,
            minSdk: null,
            targetSdk: null,
            ndkVersion: null,
            extractNativeLibs: null,
            useLegacyPackaging: null,
            prefabEnabled: false,
            composeEnabled: false,
            viewBindingEnabled: false,
            abiFilters: [],
            permissions: [],
            features: [],
            components: [],           // { kind, name, shortName, exported, foregroundServiceType, configChanges, screenOrientation, resizeableActivity, hasIntentFilter, isLauncher, filePath, line }
            composables: [],          // { name, filePath, line }
            viewModels: [],           // { name, filePath, line }
            xmlResources: [],         // { kind: 'layout'|'values'|'drawable'|'menu'|'xml', resRef, ids: [], strings: [], filePath }
            resourceRefs: [],         // { ref, filePath, line }
            javaNativeMethods: [],    // { className, packageName, methodName, expectedJniSymbol, filePath, line, boundCBoxId, bindingType }
            dynamicJniMethods: [],    // { javaName, signature, cppFuncName, filePath, line }
            reverseJniLookups: [],    // { kind: 'FindClass'|'GetMethodID'|'GetFieldID', target, signature, filePath, line }
            proguardRules: [],        // { rule, filePath, line }
            proguardFiles: [],
            loadedLibraries: [],      // { libName, soFileName, loadKind: 'loadLibrary'|'load', filePath, line }
            nativeTargets: [],        // { targetName, soFileName, buildFile, line, sourceGlobs: [], explicitSources: [], linkedLibs: [], prefabPackages: [] }
            versionCatalog: { versions: {}, libraries: {}, plugins: {} },
            packagedAssets: [],       // { path, category }
            surfaceLifecycles: [],    // { event, filePath, line }
            gradleFiles: [],
            manifestFiles: [],
            cmakeFiles: []
        };
    }

    _seedAndroidDocsIntoGraph() {
        for (const [term, info] of Object.entries(this.lexicon.dictionary)) {
            if (info.sources.includes("developer.android.com")) {
                this.addBox(new ConceptualBox(
                    `android_doc:${term}`,
                    "android_api_doc",
                    info.domain,
                    "REFERENCE_DOC",
                    {
                        name: term,
                        filePath: "developer.android.com/reference",
                        line: 1,
                        signature: `Android Developer Reference: ${term}`,
                        snippet: info.definition,
                        packaging: "ANDROID_SDK_KNOWLEDGE"
                    }
                ));
            }
        }
    }

    resetWorkspace(clearAll = false) {
        // Preserve ingested reference manuals across workspace mounts (unless doing a full importState reset)
        const preservedManualBoxes = clearAll ? [] : Array.from(this.boxes.values()).filter(b => b.domain === "n64_manual" || b.type === "manual_section" || b.type === "manual_file");
        const preservedManualTethers = clearAll ? [] : this.tethers.filter(t => t.sourceId.startsWith("manual:") || t.targetId.startsWith("manual:"));

        this.boxes.clear();
        this.tethers = [];
        this.outgoingTethers.clear();
        this.tetherIndex.clear();
        this.symbolTypes.clear();
        this.macroTable.clear();
        this.stubCatalog = [];
        this.invertedIndex.clear();
        this.docLengths.clear();
        this.symbolToBoxIds.clear();
        this.fileSummaries.clear();
        this.callGraph.clear();
        this.runtimeReachable.clear();
        this.auditFindings = [];
        this.androidModel = this._createEmptyAndroidModel();
        this.totalDocs = 0;
        this._seedAndroidDocsIntoGraph();

        for (const mBox of preservedManualBoxes) {
            this.addBox(mBox);
        }
        for (const mTether of preservedManualTethers) {
            this.addTether(mTether.sourceId, mTether.targetId, mTether.weight, mTether.relation);
        }
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
        if (p.endsWith("libs.versions.toml")) {
            return { domain: "build_system", execRole: "BUILD_CONFIG", packaging: "VERSION_CATALOG" };
        }
        if (p.endsWith("proguard-rules.pro") || p.endsWith("consumer-rules.pro") || ext === "pro") {
            return { domain: "build_system", execRole: "BUILD_CONFIG", packaging: "R8_PROGUARD_RULES" };
        }
        if (p.endsWith("cmakelists.txt") || ext === "gradle" || ext === "kts" || ext === "mk" || ext === "cmake") {
            return { domain: "build_system", execRole: "BUILD_CONFIG", packaging: "BUILD_RECIPE" };
        }
        if (p.includes("/assets/") || p.startsWith("assets/")) {
            return { domain: "android_packaging", execRole: "APK_PAYLOAD", packaging: "PACKAGED_ASSET" };
        }
        if (p.includes("/res/") || p.startsWith("res/")) {
            return { domain: "android_ui", execRole: "APK_PAYLOAD", packaging: "PACKAGED_RESOURCE" };
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
        const t = new Tether(sourceId, targetId, weight, relation);
        this.tethers.push(t);
        if (!this.outgoingTethers.has(sourceId)) {
            this.outgoingTethers.set(sourceId, []);
        }
        this.outgoingTethers.get(sourceId).push(t);
    }

    _ensureCallNode(symName) {
        const key = symName.toLowerCase();
        if (!this.callGraph.has(key)) {
            this.callGraph.set(key, {
                canonicalName: symName,
                callers: new Map(),
                callees: new Set(),
                definedIn: []
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
            isManual ? "manual_file" : (execRole === "BUILD_CONFIG" ? "build_config" : "file"),
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
            return this._ingestManualChunks(path, lines, fileBoxId, arguments[3] || null);
        }

        if (packaging === "PACKAGED_ASSET") {
            this.androidModel.packagedAssets.push({ path, category: "asset" });
        } else if (packaging === "PACKAGED_RESOURCE") {
            this.androidModel.packagedAssets.push({ path, category: "resource" });
            if (ext === "xml") {
                this._parseAndroidResourceXml(path, text, fileBoxId);
            }
        }

        const lowerPath = path.toLowerCase();
        if (lowerPath.endsWith("androidmanifest.xml")) {
            this.androidModel.manifestFiles.push(path);
            this._parseAndroidManifest(path, text, fileBoxId);
        } else if (lowerPath.endsWith("libs.versions.toml")) {
            this._parseVersionCatalog(path, lines, fileBoxId);
        } else if (lowerPath.endsWith("proguard-rules.pro") || lowerPath.endsWith("consumer-rules.pro") || ext === "pro") {
            this.androidModel.proguardFiles.push(path);
            this._parseProguardRules(path, lines);
        } else if (ext === "gradle" || ext === "kts") {
            this.androidModel.gradleFiles.push(path);
            this._parseGradleBuild(path, lines, text, fileBoxId);
        } else if (lowerPath.endsWith("cmakelists.txt") || lowerPath.endsWith("android.mk") || lowerPath.endsWith("application.mk")) {
            this.androidModel.cmakeFiles.push(path);
            this._parseCMakeAndMakefiles(path, lines, text, fileBoxId);
        }

        if (execRole !== "OFFLINE_BUILD_TOOL") {
            this._auditFileForAndroidAndPorting(path, ext, execRole, lines, text);
        }

        if (ext === "java" || ext === "kt") {
            this._parseJavaKotlinAndroid(path, lines, text, fileBoxId);
        }

        if (["c", "cpp", "cc", "cxx", "h", "hpp"].includes(ext) && execRole !== "OFFLINE_BUILD_TOOL") {
            this._parseNativeJniAndSurfaceUsage(path, lines, text);
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

            // Learn #define macros, GBI/F3DDKR opcodes, and hardware constants from ingested headers & sources
            if (trimmed.startsWith("#define ")) {
                const defMatch = trimmed.match(/^#define\s+([A-Za-z_][A-Za-z0-9_]*)(?:\(([^)]*)\))?\s+(.+)$/);
                if (defMatch) {
                    const mName = defMatch[1];
                    const mParams = defMatch[2];
                    const mBody = defMatch[3].replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "").trim();
                    const numMatch = mBody.match(/^\(?(0x[0-9a-fA-F]+|\d+)[uUlL]*\)?$/);
                    const numericVal = numMatch ? Number(numMatch[1]) : null;
                    this.macroTable.set(mName, { value: mBody, numericVal, params: mParams || null, filePath: path, line: i + 1, domain });

                    if (/^(?:G_|F3D|DKR_|OS_|VI_|AI_|PI_|SP_|DP_|FB_|SCREEN_|BKA_)/.test(mName) || numericVal !== null) {
                        const boxId = `macro:${path}:${i + 1}:${mName}`;
                        this.addBox(new ConceptualBox(boxId, "symbol", domain, execRole, {
                            name: mName,
                            filePath: path,
                            line: i + 1,
                            signature: trimmed.slice(0, 140),
                            snippet: lines.slice(Math.max(0, i - 1), Math.min(lines.length, i + 4)).join('\n'),
                            packaging
                        }));
                        this.addTether(fileBoxId, boxId, 0.78, "defines");
                        if (execRole !== "OFFLINE_BUILD_TOOL" || path.includes("include/")) {
                            this.lexicon.learn(
                                mName,
                                `Macro ${mName}${mParams !== undefined ? `(${mParams})` : ""} = ${mBody.slice(0, 140)} (${path}:${i + 1})`,
                                domain,
                                mName.startsWith("G_") ? ["gbi", "f3ddkr", "opcode"] : [],
                                [],
                                path
                            );
                        }
                    }
                }
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
                const isJni = fnName.startsWith("Java_") || trimmed.includes("JNIEXPORT") || trimmed.includes("native ") || fnName === "JNI_OnLoad";
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

                // Detect no-op / dummy / stub functions in Android native targets
                if (["c", "cpp", "cc", "cxx"].includes(ext) && execRole !== "OFFLINE_BUILD_TOOL") {
                    let braceDepth = 0;
                    let foundOpen = false;
                    let endLine = i;
                    const bodyLines = [];
                    for (let j = i; j < Math.min(lines.length, i + 30); j++) {
                        const bl = lines[j];
                        for (const ch of bl) {
                            if (ch === "{") { braceDepth++; foundOpen = true; }
                            else if (ch === "}") { braceDepth--; }
                        }
                        if (j > i) bodyLines.push(bl.trim());
                        endLine = j;
                        if (foundOpen && braceDepth <= 0) break;
                    }
                    const bodyJoined = bodyLines.join(" ").replace(/\/\*.*?\*\//g, "").replace(/\/\/.*$/gm, "").replace(/[{}]/g, "").trim();
                    const isStubFile = /stub/i.test(path);
                    const hasStubMarker = /\b(?:STUB|TODO|FIXME|UNIMPLEMENTED|DUMMY|NOOP|NO-OP)\b/i.test(lines.slice(i, endLine + 1).join(" "));
                    const isTrivialBody = foundOpen && (
                        bodyJoined === "" ||
                        /^return(?:\s+(?:0|NULL|nullptr|-1|false|true|1))?\s*;$/i.test(bodyJoined) ||
                        /^\(\s*void\s*\)\s*[a-zA-Z0-9_]+\s*;\s*(?:return(?:\s+(?:0|NULL|nullptr|-1))?\s*;)?$/i.test(bodyJoined)
                    );
                    if (isStubFile || hasStubMarker || isTrivialBody) {
                        const stubReason = isTrivialBody
                            ? (bodyJoined === "" ? "Empty no-op function body" : `Trivial dummy return (${bodyJoined})`)
                            : (hasStubMarker ? "Explicit STUB/TODO marker in implementation" : "Defined inside stub translation unit");
                        this.stubCatalog.push({
                            name: fnName,
                            signature: trimmed,
                            stubReason,
                            filePath: path,
                            line: i + 1,
                            endLine: endLine + 1,
                            originalLines: lines.slice(i, endLine + 1),
                            decompImpl: null,
                            manualDoc: null,
                            callersCount: 0
                        });
                    }
                }

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

    _parseAndroidResourceXml(path, text, fileBoxId) {
        const lower = path.toLowerCase();
        const fileNameNoExt = path.split('/').pop().replace(/\.xml$/i, "");
        let kind = "xml";
        let resRef = `R.xml.${fileNameNoExt}`;

        if (lower.includes("/layout")) {
            kind = "layout";
            resRef = `R.layout.${fileNameNoExt}`;
        } else if (lower.includes("/values")) {
            kind = "values";
            resRef = `values/${fileNameNoExt}`;
        } else if (lower.includes("/drawable")) {
            kind = "drawable";
            resRef = `R.drawable.${fileNameNoExt}`;
        } else if (lower.includes("/menu")) {
            kind = "menu";
            resRef = `R.menu.${fileNameNoExt}`;
        }

        const ids = [];
        const idRegex = /android:id\s*=\s*["']@\+?id\/([a-zA-Z0-9_]+)["']/g;
        let im;
        while ((im = idRegex.exec(text)) !== null) {
            if (!ids.includes(im[1])) ids.push(im[1]);
        }

        const strings = [];
        const strRegex = /<string\s+name\s*=\s*["']([a-zA-Z0-9_]+)["']/g;
        let sm;
        while ((sm = strRegex.exec(text)) !== null) {
            if (!strings.includes(sm[1])) strings.push(sm[1]);
        }

        this.androidModel.xmlResources.push({ kind, resRef, ids, strings, filePath: path });

        const resBoxId = `res:${resRef}:${path}`;
        this.addBox(new ConceptualBox(resBoxId, "android_resource", "android_ui", "APK_PAYLOAD", {
            name: resRef,
            filePath: path,
            line: 1,
            signature: `Android Resource ${resRef} (${ids.length} IDs, ${strings.length} strings)`,
            snippet: text.slice(0, 380),
            packaging: "PACKAGED_RESOURCE"
        }));
        this.addTether(fileBoxId, resBoxId, 0.85, "defines");
    }

    _parseAndroidManifest(path, text, fileBoxId) {
        const pkgMatch = text.match(/package\s*=\s*["']([^"']+)["']/);
        if (pkgMatch) this.androidModel.packageName = pkgMatch[1];

        const appCatMatch = text.match(/android:appCategory\s*=\s*["']([^"']+)["']/);
        if (appCatMatch) this.androidModel.appCategory = appCatMatch[1];

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
            const exportedMatch = attrs.match(/android:exported\s*=\s*["'](true|false)["']/);
            const fgsMatch = attrs.match(/android:foregroundServiceType\s*=\s*["']([^"']+)["']/);
            const cfgMatch = attrs.match(/android:configChanges\s*=\s*["']([^"']+)["']/);
            const orientMatch = attrs.match(/android:screenOrientation\s*=\s*["']([^"']+)["']/);
            const resizeMatch = attrs.match(/android:resizeableActivity\s*=\s*["'](true|false)["']/);
            const hasIntentFilter = body.includes("<intent-filter");
            const isLauncher = body.includes("android.intent.category.LAUNCHER") || body.includes("android.intent.action.MAIN");
            const lineNum = text.slice(0, cm.index).split('\n').length;

            this.androidModel.components.push({
                kind,
                name: rawName,
                shortName,
                exported: exportedMatch ? exportedMatch[1] : null,
                foregroundServiceType: fgsMatch ? fgsMatch[1] : null,
                configChanges: cfgMatch ? cfgMatch[1] : null,
                screenOrientation: orientMatch ? orientMatch[1] : null,
                resizeableActivity: resizeMatch ? resizeMatch[1] : null,
                hasIntentFilter,
                isLauncher,
                filePath: path,
                line: lineNum
            });

            if (hasIntentFilter && !exportedMatch) {
                this.auditFindings.push({
                    severity: "CRITICAL",
                    category: "Android 12+ Missing android:exported",
                    filePath: path,
                    line: lineNum,
                    code: `<${kind} android:name="${rawName}">`,
                    reason: "Components declaring <intent-filter> MUST explicitly specify android:exported=\"true\" or \"false\" on Android 12+ (API 31+), or APK installation fails with INSTALL_PARSE_FAILED_MANIFEST_MALFORMED.",
                    fixSuggestion: `<${kind} android:name="${rawName}" android:exported="${isLauncher ? "true" : "false"}">`
                });
            }

            if (kind === "activity" && isLauncher && (!cfgMatch || !cfgMatch[1].includes("orientation") || !cfgMatch[1].includes("screenSize"))) {
                this.auditFindings.push({
                    severity: "MEDIUM",
                    category: "Activity Destruction on Rotation/Foldable Resize",
                    filePath: path,
                    line: lineNum,
                    code: `<activity android:name="${rawName}">`,
                    reason: "Game/Native Activity lacks android:configChanges=\"orientation|screenSize|screenLayout|keyboardHidden\", causing Android to destroy and recreate the Activity & ANativeWindow on rotation or multi-window resize.",
                    fixSuggestion: `android:configChanges="orientation|screenSize|screenLayout|keyboardHidden|smallestScreenSize"`
                });
            }

            if (kind === "activity" && (orientMatch || (resizeMatch && resizeMatch[1] === "false")) && this.androidModel.appCategory !== "game") {
                this.auditFindings.push({
                    severity: "MEDIUM",
                    category: "Android 17+ Large-Screen Orientation/Resize Restriction",
                    filePath: path,
                    line: lineNum,
                    code: `<activity android:name="${rawName}"${orientMatch ? ` android:screenOrientation="${orientMatch[1]}"` : ""}>`,
                    reason: "Android 16/17+ ignores fixed screenOrientation and resizeableActivity=\"false\" on large screens (sw >= 600dp) unless <application android:appCategory=\"game\"> is declared.",
                    fixSuggestion: `// Add android:appCategory="game" on <application> in AndroidManifest.xml`
                });
            }

            const compBoxId = `manifest:${path}:${lineNum}:${shortName}`;
            this.addBox(new ConceptualBox(compBoxId, "android_component", "android_wrapper", "ENTRY_POINT", {
                name: shortName,
                filePath: path,
                line: lineNum,
                signature: `<${kind} android:name="${rawName}">${isLauncher ? " [LAUNCHER]" : ""}${fgsMatch ? ` [FGS:${fgsMatch[1]}]` : ""}`,
                snippet: cm[0].slice(0, 380),
                packaging: "PACKAGED_MANIFEST"
            }));
            this.addTether(fileBoxId, compBoxId, 0.95, "launches_component");
            this.lexicon.learn(shortName, `AndroidManifest <${kind}> entry component '${rawName}' declared in ${path}:${lineNum}.`, "android_packaging", [kind, "manifest_entry"], [], path);
        }
    }

    _parseVersionCatalog(path, lines, fileBoxId) {
        let section = "";
        for (const raw of lines) {
            const line = raw.trim();
            if (!line || line.startsWith("#")) continue;
            if (line.startsWith("[") && line.endsWith("]")) {
                section = line.slice(1, -1).trim();
                continue;
            }
            const kv = line.match(/^([a-zA-Z0-9_-]+)\s*=\s*(.+)$/);
            if (kv && this.androidModel.versionCatalog[section]) {
                this.androidModel.versionCatalog[section][kv[1]] = kv[2].replace(/["']/g, "");
            }
        }
    }

    _parseProguardRules(path, lines) {
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith("-keep")) {
                this.androidModel.proguardRules.push({ rule: trimmed, filePath: path, line: i + 1 });
            }
        }
    }

    _parseGradleBuild(path, lines, text, fileBoxId) {
        const nsMatch = text.match(/namespace\s*[= ]\s*["']([^"']+)["']/);
        if (nsMatch) this.androidModel.namespace = nsMatch[1];

        const appMatch = text.match(/applicationId\s*[= ]\s*["']([^"']+)["']/);
        if (appMatch) this.androidModel.applicationId = appMatch[1];

        const compMatch = text.match(/compileSdk(?:Version)?\s*[= ]\s*(\d+)/);
        if (compMatch) this.androidModel.compileSdk = compMatch[1];

        const minMatch = text.match(/minSdk(?:Version)?\s*[= ]\s*(\d+)/);
        if (minMatch) this.androidModel.minSdk = minMatch[1];

        const tgtMatch = text.match(/targetSdk(?:Version)?\s*[= ]\s*(\d+)/);
        if (tgtMatch) this.androidModel.targetSdk = tgtMatch[1];

        const ndkMatch = text.match(/ndkVersion\s*[= ]\s*["']([^"']+)["']/);
        if (ndkMatch) this.androidModel.ndkVersion = ndkMatch[1];

        if (/prefab\s*[= ]\s*true/.test(text)) {
            this.androidModel.prefabEnabled = true;
        }

        if (/compose\s*[= ]\s*true/.test(text)) {
            this.androidModel.composeEnabled = true;
        }

        if (/viewBinding\s*[= ]\s*true/.test(text)) {
            this.androidModel.viewBindingEnabled = true;
        }

        const legacyPkgMatch = text.match(/useLegacyPackaging\s*[= ]\s*(true|false)/);
        if (legacyPkgMatch) {
            this.androidModel.useLegacyPackaging = legacyPkgMatch[1];
        }

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
                linkedLibs: [],
                prefabPackages: []
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

        const prefabPkgRegex = /find_package\s*\(\s*([a-zA-Z0-9_-]+)\s+REQUIRED\s+CONFIG\s*\)/g;
        let pm;
        while ((pm = prefabPkgRegex.exec(text)) !== null) {
            if (this.androidModel.nativeTargets.length > 0) {
                this.androidModel.nativeTargets[this.androidModel.nativeTargets.length - 1].prefabPackages.push(pm[1]);
            }
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
                linkedLibs: [],
                prefabPackages: []
            });
        }
    }

    _parseJavaKotlinAndroid(path, lines, text, fileBoxId) {
        let currentPackage = "";
        let currentClass = path.split('/').pop().replace(/\.(java|kt)$/, "");

        const pkgRegex = /^\s*package\s+([a-zA-Z0-9_.]+)/;
        const clsRegex = /\b(?:class|object)\s+([a-zA-Z0-9_]+)/;
        const loadLibRegex = /System\.loadLibrary\s*\(\s*["']([^"']+)["']\s*\)/;
        const loadPathRegex = /System\.load\s*\(\s*([^)]+)\)/;
        const javaNativeRegex = /\b(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:native|external)\s+(?:fun\s+)?[a-zA-Z0-9_<>\[\],\s]+\s+([a-zA-Z0-9_]+)\s*\(/;
        const resRefRegex = /\bR\.(layout|id|string|drawable|menu|xml)\.([a-zA-Z0-9_]+)/g;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            const pm = trimmed.match(pkgRegex);
            if (pm) currentPackage = pm[1];

            const cm = trimmed.match(clsRegex);
            if (cm) {
                currentClass = cm[1];
                if (trimmed.includes("ViewModel")) {
                    this.androidModel.viewModels.push({ name: currentClass, filePath: path, line: i + 1 });
                }
            }

            if (trimmed.startsWith("@Composable") && i + 1 < lines.length) {
                const nextLine = lines[i + 1].trim();
                const fnMatch = nextLine.match(/\bfun\s+([a-zA-Z0-9_]+)/);
                if (fnMatch) {
                    this.androidModel.composables.push({ name: fnMatch[1], filePath: path, line: i + 2 });
                }
            }

            let rm;
            resRefRegex.lastIndex = 0;
            while ((rm = resRefRegex.exec(trimmed)) !== null) {
                this.androidModel.resourceRefs.push({ ref: `R.${rm[1]}.${rm[2]}`, filePath: path, line: i + 1 });
            }

            const lm = trimmed.match(loadLibRegex);
            if (lm) {
                const libName = lm[1];
                const soFileName = `lib${libName}.so`;
                this.androidModel.loadedLibraries.push({
                    libName,
                    soFileName,
                    loadKind: "loadLibrary",
                    filePath: path,
                    line: i + 1
                });
                this.lexicon.learn(soFileName, `Native library loaded at runtime via System.loadLibrary("${libName}") in ${path}:${i + 1}.`, "android_packaging", [libName, "loadlibrary"], [], path);
            }

            const lpm = trimmed.match(loadPathRegex);
            if (lpm) {
                const rawArg = lpm[1].trim();
                const baseName = rawArg.split('/').pop().replace(/["')]/g, "") || "dynamic.so";
                this.androidModel.loadedLibraries.push({
                    libName: baseName.replace(/^lib/, "").replace(/\.so$/, ""),
                    soFileName: baseName,
                    loadKind: "load",
                    filePath: path,
                    line: i + 1
                });
                if (!text.includes("setReadOnly")) {
                    this.auditFindings.push({
                        severity: "HIGH",
                        category: "Android 17+ Safer DCL (System.load Read-Only)",
                        filePath: path,
                        line: i + 1,
                        code: trimmed,
                        reason: "Apps targeting Android 17 (API 37+) must call file.setReadOnly() (chmod 0444) on dynamically loaded native libraries before System.load(), or ART throws UnsatisfiedLinkError.",
                        fixSuggestion: `soFile.setReadOnly();\n${trimmed}`
                    });
                }
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
                    boundCBoxId: null,
                    bindingType: null
                });
            }

            if (trimmed.includes("surfaceCreated") || trimmed.includes("surfaceDestroyed") || trimmed.includes("surfaceChanged")) {
                this.androidModel.surfaceLifecycles.push({ event: trimmed.slice(0, 60), filePath: path, line: i + 1 });
            }
        }
    }

    _parseNativeJniAndSurfaceUsage(path, lines, text) {
        const dynEntryRegex = /\{\s*["']([a-zA-Z0-9_]+)["']\s*,\s*["']([^"']+)["']\s*,\s*(?:\(\s*void\s*\*\s*\)|reinterpret_cast\s*<\s*void\s*\*\s*>\s*\(?)\s*&?\s*([a-zA-Z0-9_]+)\s*\)?\s*\}/g;
        let dm;
        while ((dm = dynEntryRegex.exec(text)) !== null) {
            const lineNum = text.slice(0, dm.index).split('\n').length;
            this.androidModel.dynamicJniMethods.push({
                javaName: dm[1],
                signature: dm[2],
                cppFuncName: dm[3],
                filePath: path,
                line: lineNum
            });
        }

        const revRegex = /\b(FindClass|GetMethodID|GetStaticMethodID|GetFieldID|GetStaticFieldID)\s*\([^,]+,\s*["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/g;
        let rm;
        while ((rm = revRegex.exec(text)) !== null) {
            const lineNum = text.slice(0, rm.index).split('\n').length;
            this.androidModel.reverseJniLookups.push({
                kind: rm[1],
                target: rm[2],
                signature: rm[3] || "",
                filePath: path,
                line: lineNum
            });
        }

        for (let i = 0; i < lines.length; i++) {
            const t = lines[i].trim();
            if (t.includes("ANativeWindow_fromSurface") || t.includes("ANativeWindow_release") || t.includes("APP_CMD_TERM_WINDOW")) {
                this.androidModel.surfaceLifecycles.push({ event: t.slice(0, 60), filePath: path, line: i + 1 });
            }
        }
    }

    _auditFileForAndroidAndPorting(path, ext, execRole, lines, fullText) {
        if (path.endsWith("CMakeLists.txt") || path.endsWith("Android.mk")) {
            if (!fullText.includes("max-page-size=16384") && !fullText.includes("16384")) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "Android 15-17+ 16KB ELF Page Alignment",
                    filePath: path,
                    line: 1,
                    code: path.split('/').pop(),
                    reason: "Missing '-Wl,-z,max-page-size=16384' linker flag required by Google Play and Android 15-17+ 16 KB page-size kernels.",
                    fixSuggestion: `target_link_options(\${PROJECT_NAME} PRIVATE "-Wl,-z,max-page-size=16384")`
                });
            }
        }

        if (ext === "java" || ext === "kt") {
            let inComposable = false;
            for (let i = 0; i < lines.length; i++) {
                const t = lines[i].trim();
                if (!t || t.startsWith("//") || t.startsWith("*")) continue;

                if (t.startsWith("@Composable")) {
                    inComposable = true;
                } else if (t.startsWith("fun ") && !lines[Math.max(0, i - 1)].includes("@Composable")) {
                    inComposable = false;
                }

                if (inComposable && /\b(?:viewModelScope|lifecycleScope|GlobalScope)\.launch\s*\{/.test(t)) {
                    this.auditFindings.push({
                        severity: "HIGH",
                        category: "Jetpack Compose Recomposition Side-Effect Hazard",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "Launching a coroutine directly inside a @Composable body triggers duplicate executions on every recomposition; wrap it inside LaunchedEffect(key).",
                        fixSuggestion: `LaunchedEffect(Unit) {\n    ${t}\n}`
                    });
                }

                if (t.includes("GlobalScope.")) {
                    this.auditFindings.push({
                        severity: "MEDIUM",
                        category: "Unstructured Kotlin GlobalScope Usage",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "GlobalScope leaks coroutines across Activity/ViewModel lifecycles; use lifecycleScope or viewModelScope.",
                        fixSuggestion: t.replace("GlobalScope.", "lifecycleScope.")
                    });
                }

                if (t.includes("registerReceiver(") && !fullText.includes("RECEIVER_EXPORTED") && !fullText.includes("RECEIVER_NOT_EXPORTED")) {
                    this.auditFindings.push({
                        severity: "CRITICAL",
                        category: "Android 14+ Missing RECEIVER_EXPORTED / NOT_EXPORTED Flag",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "Dynamic Context.registerReceiver() on targetSdk 34+ throws SecurityException unless Context.RECEIVER_EXPORTED or Context.RECEIVER_NOT_EXPORTED is specified.",
                        fixSuggestion: `ContextCompat.registerReceiver(this, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED);`
                    });
                }

                if (t.includes("PendingIntent.get") && !t.includes("FLAG_IMMUTABLE") && !t.includes("FLAG_MUTABLE")) {
                    this.auditFindings.push({
                        severity: "CRITICAL",
                        category: "Android 12+ Missing PendingIntent Mutability Flag",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "PendingIntent creation on targetSdk 31+ throws IllegalArgumentException without PendingIntent.FLAG_IMMUTABLE or FLAG_MUTABLE.",
                        fixSuggestion: t.replace(/(\)\s*;?)$/, " /* add PendingIntent.FLAG_IMMUTABLE */$1")
                    });
                }

                if (t.includes("startForeground(")) {
                    const hasFgsType = this.androidModel.components.some(c => c.kind === "service" && c.foregroundServiceType);
                    if (!hasFgsType) {
                        this.auditFindings.push({
                            severity: "CRITICAL",
                            category: "Android 14+ Missing foregroundServiceType",
                            filePath: path,
                            line: i + 1,
                            code: t,
                            reason: "Calling startForeground() on targetSdk 34+ without declaring android:foregroundServiceType in AndroidManifest.xml throws MissingForegroundServiceTypeException.",
                            fixSuggestion: `// In AndroidManifest.xml <service>:\n// android:foregroundServiceType="mediaPlayback"\n// And add <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK" />`
                        });
                    }
                }

                if (/\bonBackPressed\s*\(/.test(t)) {
                    this.auditFindings.push({
                        severity: "MEDIUM",
                        category: "Deprecated onBackPressed() (Predictive Back API 33+)",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "Activity.onBackPressed() is deprecated in API 33+ and breaks Android 14-17 Predictive Back gestures; migrate to OnBackPressedDispatcher.",
                        fixSuggestion: `getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) { @Override public void handleOnBackPressed() { /* handle back */ } });`
                    });
                }

                if (t.includes("Environment.getExternalStorageDirectory(")) {
                    this.auditFindings.push({
                        severity: "HIGH",
                        category: "Scoped Storage Violation (API 29+)",
                        filePath: path,
                        line: i + 1,
                        code: t,
                        reason: "Environment.getExternalStorageDirectory() is blocked under Scoped Storage; use Context.getExternalFilesDir(null) or Storage Access Framework (ACTION_OPEN_DOCUMENT).",
                        fixSuggestion: t.replace("Environment.getExternalStorageDirectory()", "getExternalFilesDir(null)")
                    });
                }
            }
            return;
        }

        if (!["c", "cpp", "cc", "cxx", "h", "hpp"].includes(ext)) return;

        // Build per-file symbol table of actual pointer-typed variables (*) so integer ROM/file offsets
        // (e.g., assetOffset, romOffset, bufferSize) are NEVER misflagged as 64-bit pointers.
        const pointerIdentifiers = new Set();
        const scalarIntIdentifiers = new Set();
        const typeDeclRegex = /\b(void|char|u8|s8|u16|s16|u32|s32|u64|s64|uint8_t|int8_t|uint16_t|int16_t|uint32_t|int32_t|uint64_t|int64_t|uintptr_t|size_t|float|double|Gfx|Vtx|Mtx|OSTask|OSMesg|OSThread|OSPiHandle|ALHeap|struct\s+[a-zA-Z_][a-zA-Z0-9_]*|[A-Z][a-zA-Z0-9_]+)(\s*\*+\s*|\s+)(?:const\s+|restrict\s+)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let pdm;
        while ((pdm = typeDeclRegex.exec(fullText)) !== null) {
            const baseType = pdm[1].trim();
            const isPtr = pdm[2].includes("*");
            const ident = pdm[3];
            if (["if", "for", "while", "switch", "return", "sizeof", "else"].includes(ident)) continue;
            if (isPtr) {
                pointerIdentifiers.add(ident);
                this.symbolTypes.set(ident, `${baseType}*`);
            } else if (/^(?:u8|s8|u16|s16|u32|s32|uint8_t|int8_t|uint16_t|int16_t|uint32_t|int32_t|int|unsigned)$/.test(baseType)) {
                scalarIntIdentifiers.add(ident);
                if (!this.symbolTypes.has(ident)) this.symbolTypes.set(ident, baseType);
            }
        }
        // Index struct fields: typedef struct { u32 startAddr; ... } AMDMABuffer;
        const structBlockRe = /typedef\s+struct(?:\s+[a-zA-Z0-9_]+)?\s*\{([^{}]+)\}\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*;/g;
        let sbm;
        while ((sbm = structBlockRe.exec(fullText)) !== null) {
            const body = sbm[1];
            const structName = sbm[2];
            const fieldRe = /\b([a-zA-Z_][a-zA-Z0-9_\s*]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:\[[^\]]*\])?\s*;/g;
            let fm;
            while ((fm = fieldRe.exec(body)) !== null) {
                this.symbolTypes.set(`${structName}.${fm[2]}`, fm[1].trim());
                this.symbolTypes.set(`*.${fm[2]}`, { type: fm[1].trim(), structName, filePath: path });
            }
        }
        const intOffsetBlocklist = /(?:offset|size|len|length|count|samples|index|idx|num|id|flags|mask|stride|width|height|pitch|format|type|state|mode|status|timer|frame|tick|seed|crc|hash|volume|pan|freq|rate|channel|voice|seq|bank|track|rom|vrom|segment|page|sector|block|tag|key|val|value|param|arg|res|ret|err|code|cmd|op|table|tbl|lut|array|list|map)$/i;
        const ptrCastRegex = /\(\s*(?:u32|s32|uint32_t|int32_t|unsigned\s+int|int)\s*\)\s*(&?[a-zA-Z_][a-zA-Z0-9_]*(?:(?:->|\.)[a-zA-Z_][a-zA-Z0-9_]*)?)/g;
        const longFieldRegex = /^\s*(?:unsigned\s+)?long\s+[a-zA-Z_][a-zA-Z0-9_*\[\]\s]*;/;
        const unalignedCastRegex = /\*\s*\(\s*(?:u32|s32|u16|s16|uint32_t|uint16_t)\s*\*\s*\)/;
        const dmaBufferRegex = /\b(?:Gfx|Vtx|Mtx|OSTask|OSMesg)\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\[/;
        const rawHwIoRegex = /\b(?:IO_READ|IO_WRITE|PHYS_TO_K0|K0_TO_PHYS|osPiStartDma|osViSwapBuffer)\s*\(/;
        const hardcoded4kRegex = /\b(?:4096|0x1000|PAGE_SIZE)\b/;

        let loopDepth = 0;

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

            if (/^(?:for|while)\s*\(/.test(trimmed)) loopDepth++;
            if (loopDepth > 0 && trimmed === "}") loopDepth = Math.max(0, loopDepth - 1);

            ptrCastRegex.lastIndex = 0;
            let pcm;
            const confirmedPtrExprs = [];
            while ((pcm = ptrCastRegex.exec(trimmed)) !== null) {
                const expr = pcm[1];
                const isAddressOf = expr.startsWith("&");
                const cleanExpr = expr.replace(/^&/, "");
                const parts = cleanExpr.split(/->|\./);
                const leafIdent = parts[parts.length - 1];
                // If accessing a struct field (e.g. bf->bankCount), inspect the leaf field name, NOT the struct pointer!
                const isExplicitPtr = parts.length === 1 && pointerIdentifiers.has(leafIdent);
                const hasPtrNaming = /(?:^|_)(?:ptr|addr|address|buf|buffer|mem|heap|stack|dst|src|handle|win|window|surface|ctx|context)(?:_|$)/i.test(leafIdent);
                const isKnownScalar = parts.length === 1 && scalarIntIdentifiers.has(leafIdent) && !isExplicitPtr && !isAddressOf;
                if (!isKnownScalar && (isAddressOf || isExplicitPtr || hasPtrNaming) && !intOffsetBlocklist.test(leafIdent)) {
                    confirmedPtrExprs.push(expr);
                }
            }
            if (confirmedPtrExprs.length > 0) {
                let fixedLine = trimmed;
                for (const expr of confirmedPtrExprs) {
                    const escapedExpr = expr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    const exactCastRe = new RegExp(`\\(\\s*(?:u32|s32|uint32_t|int32_t|unsigned\\s+int|int)\\s*\\)\\s*${escapedExpr}`, "g");
                    fixedLine = fixedLine.replace(exactCastRe, `(uintptr_t)${expr}`);
                }
                this.auditFindings.push({
                    severity: "CRITICAL",
                    category: "ARM64 Pointer Truncation / MTE Hazard",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: `Confirmed pointer/address expression (${confirmedPtrExprs.join(", ")}) cast to 32-bit integer; truncates upper 32 bits on aarch64 and strips ARM64 MTE/TBI pointer tags, causing immediate SIGSEGV.`,
                    replaceLine: true,
                    fixSuggestion: fixedLine
                });
            }

            if (hardcoded4kRegex.test(trimmed) && (trimmed.includes("mmap") || trimmed.includes("mprotect") || trimmed.includes("align") || trimmed.includes("page") || trimmed.includes("PAGE"))) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "16 KB Page-Size Hardcoded 4096/PAGE_SIZE Trap",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "NDK r27+ removes compile-time PAGE_SIZE and Android 15-17 devices use 16 KB (16384) pages. Replace hardcoded 4096/0x1000/PAGE_SIZE with sysconf(_SC_PAGESIZE).",
                    replaceLine: true,
                    fixSuggestion: trimmed.replace(/\b(?:4096|0x1000|PAGE_SIZE)\b/g, "(size_t)sysconf(_SC_PAGESIZE)")
                });
            }

            if (loopDepth > 0 && /\b(?:NewStringUTF|NewObject|NewByteArray|GetObjectArrayElement|CallObjectMethod)\s*\(/.test(trimmed) && !fullText.includes("DeleteLocalRef") && !fullText.includes("PushLocalFrame")) {
                this.auditFindings.push({
                    severity: "HIGH",
                    category: "ART JNI Local Reference Table Overflow Risk",
                    filePath: path,
                    line: i + 1,
                    code: trimmed,
                    reason: "Allocating JNI local references inside a loop without env->DeleteLocalRef() or PushLocalFrame/PopLocalFrame exhausts the ART local reference table.",
                    fixSuggestion: `${trimmed}\n// Ensure env->DeleteLocalRef(localObj) before next loop iteration`
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
                    replaceLine: true,
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
                    reason: "Direct N64 RCP/PI/VI hardware invocation must route through the Android JNI/GL/Oboe compatibility shim at runtime.",
                    fixSuggestion: `// Verify Android shim interception for: ${trimmed}`
                });
            }
        }
    }

    async _ingestManualChunks(path, lines, fileBoxId, onProgress = null) {
        const chunkSize = 35;
        const overlap = 5;
        let chunksSinceYield = 0;
        let prevBoxId = null;
        let learnedTerms = 0;

        // Patterns for N64 SDK functions, registers, macros, and section headers
        const fnProtoRe = /\b(?:void|s8|u8|s16|u16|s32|u32|s64|u64|f32|f64|int|char|OSMesg|OSTask|OSThread|OSPiHandle|Gfx|Vtx|Mtx|AL[A-Za-z0-9_]+)\s*\*?\s*([a-zA-Z_][a-zA-Z0-9_]{2,})\s*\(/;
        const macroRegRe = /^(?:#define\s+)?([A-Z][A-Z0-9_]{2,})(?:\s+\(?0x[0-9a-fA-F]+\)?|\s+[-:=]\s+(.+))?$/;
        const sdkSymbolRe = /\b((?:os|gu|gSP|gDP|al|nu|__os)[A-Za-z0-9_]{2,})\b/g;

        for (let i = 0; i < lines.length; i += (chunkSize - overlap)) {
            const rawSlice = lines.slice(i, i + chunkSize);
            const chunkLines = rawSlice.filter(l => l.trim().length > 0);
            if (chunkLines.length === 0) continue;

            // Prefer a heading or prototype as the section title
            const headingLine = chunkLines.find(l => /^(?:\d+(?:\.\d+)*\s+[A-Z]|[A-Z][A-Z0-9 _/-]{4,60}$|(?:os|gu|gSP|gDP|al)[A-Za-z0-9_]+)/.test(l.trim())) || chunkLines[0];
            const titleLine = headingLine.trim().slice(0, 90);
            const fullChunkText = chunkLines.join('\n');
            const snippet = fullChunkText.slice(0, 2800);
            const boxId = `manual:${path}:${i + 1}`;

            this.addBox(new ConceptualBox(boxId, "manual_section", "n64_manual", "REFERENCE_DOC", {
                name: titleLine,
                filePath: path,
                line: i + 1,
                signature: `Manual Section (Lines ${i + 1}-${i + rawSlice.length})`,
                snippet,
                packaging: "REFERENCE_DOC"
            }));

            // Bidirectional tethers with parent manual and sequential neighbor chunks
            this.addTether(fileBoxId, boxId, 0.75, "documents");
            this.addTether(boxId, fileBoxId, 0.45, "part_of_manual");
            if (prevBoxId) {
                this.addTether(prevBoxId, boxId, 0.65, "next_section");
                this.addTether(boxId, prevBoxId, 0.65, "prev_section");
            }
            prevBoxId = boxId;

            const chunkContext = chunkLines.slice(0, 6).join(' ').replace(/\s+/g, ' ').slice(0, 260);
            const chunkSymbols = new Set();

            for (let idx = 0; idx < chunkLines.length; idx++) {
                const line = chunkLines[idx].trim();
                const nextContext = chunkLines.slice(idx, idx + 3).join(' ').replace(/\s+/g, ' ').slice(0, 240);

                // 1. Glossary "TERM - Definition" or "TERM : Definition"
                const sepMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_]{1,35})\s+[-:]\s+(.{8,})$/);
                if (sepMatch) {
                    this.lexicon.learn(sepMatch[1], sepMatch[2].slice(0, 260), "n64_manual", [], [], path);
                    chunkSymbols.add(sepMatch[1].toLowerCase());
                    learnedTerms++;
                }

                // 2. C function prototypes in manual
                const fnMatch = line.match(fnProtoRe);
                if (fnMatch && !["if", "for", "while", "switch", "return", "sizeof"].includes(fnMatch[1])) {
                    this.lexicon.learn(fnMatch[1], `${line} — ${nextContext}`, "n64_manual", [], [], path);
                    chunkSymbols.add(fnMatch[1].toLowerCase());
                    learnedTerms++;
                }

                // 3. Hardware registers / #define constants
                const regMatch = line.match(macroRegRe);
                if (regMatch && regMatch[1].length >= 4 && !["NOTE", "WARNING", "EXAMPLE", "SYNTAX", "RETURN", "DESCRIPTION", "ARGUMENTS", "SEE"].includes(regMatch[1])) {
                    const desc = regMatch[2] ? `${regMatch[1]}: ${regMatch[2]}` : `${line} — ${nextContext}`;
                    this.lexicon.learn(regMatch[1], desc.slice(0, 260), "n64_manual", [], [], path);
                    chunkSymbols.add(regMatch[1].toLowerCase());
                    learnedTerms++;
                }

                // 4. Inline libultra / GBI / RSP / RDP symbols
                sdkSymbolRe.lastIndex = 0;
                let sm;
                while ((sm = sdkSymbolRe.exec(line)) !== null) {
                    const sym = sm[1];
                    chunkSymbols.add(sym.toLowerCase());
                    if (!this.lexicon.dictionary[sym.toLowerCase()]) {
                        this.lexicon.learn(sym, `${titleLine}: ${nextContext || chunkContext}`, "n64_manual", [], [], path);
                        learnedTerms++;
                    }
                }
            }

            // Cross-link manual section bidirectionally with any matching C/C++ codebase symbols
            for (const symLower of chunkSymbols) {
                const codeBoxes = this.symbolToBoxIds.get(symLower);
                if (codeBoxes) {
                    for (const cId of codeBoxes) {
                        if (!cId.startsWith("manual:")) {
                            this.addTether(boxId, cId, 0.85, "documents_symbol");
                            this.addTether(cId, boxId, 0.85, "documented_in_manual");
                        }
                    }
                }
            }

            chunksSinceYield++;
            if (chunksSinceYield >= 12) {
                chunksSinceYield = 0;
                if (onProgress) onProgress(Math.min(100, Math.round(((i + chunkSize) / Math.max(1, lines.length)) * 100)));
                await new Promise(r => setTimeout(r, 0));
            }
        }
        return { learnedTerms };
    }

    _analyzeStubsAgainstDecompAndManual() {
        for (const stub of this.stubCatalog) {
            const symLower = stub.name.toLowerCase();
            const cg = this.callGraph.get(symLower);
            stub.callersCount = cg ? Array.from(cg.callers.values()).reduce((a, b) => a + b.length, 0) : 0;
            stub.isRuntimeReachable = this.runtimeReachable.has(symLower) || stub.callersCount > 0;

            // Find non-stub implementation elsewhere in the workspace (e.g., Diddy-Kong-Racing/src/ or libultra)
            const candidateBoxIds = this.symbolToBoxIds.get(symLower) || [];
            for (const bId of candidateBoxIds) {
                const box = this.boxes.get(bId);
                if (!box || !box.payload) continue;
                if (box.payload.filePath !== stub.filePath && !/stub/i.test(box.payload.filePath) && box.type !== "manual_section") {
                    stub.decompImpl = {
                        filePath: box.payload.filePath,
                        line: box.payload.line,
                        signature: box.payload.signature,
                        snippet: box.payload.snippet
                    };
                    this.addTether(`fn:${stub.filePath}:${stub.line}:${stub.name}`, bId, 0.9, "stubs_decomp_symbol");
                    break;
                }
            }

            // Check N64 Manual lexicon / manual_section
            const lexEntry = this.lexicon.dictionary[symLower];
            if (lexEntry && (lexEntry.domain === "n64_manual" || lexEntry.domain.startsWith("n64_"))) {
                stub.manualDoc = lexEntry.definition;
            }

            // Surface high-impact runtime-reachable stubs in auditFindings with synthesized implementation guidance
            if (stub.isRuntimeReachable && (stub.decompImpl || stub.manualDoc || stub.callersCount >= 2)) {
                const refNote = stub.decompImpl
                    ? `Decomp reference at ${stub.decompImpl.filePath}:${stub.decompImpl.line}`
                    : (stub.manualDoc ? `N64 Manual: ${stub.manualDoc.slice(0, 140)}` : `${stub.callersCount} active runtime call site(s)`);
                const synthesizedBody = stub.decompImpl
                    ? `// [Ported from ${stub.decompImpl.filePath}:${stub.decompImpl.line}]
${stub.decompImpl.snippet}`
                    : `${stub.signature} {
    // [N64 Spec] ${(stub.manualDoc || stub.stubReason).slice(0, 160)}
    // TODO: Wire to Android bridge (gN64_RDRAM / bka_lookup_addr_by_low32 / Oboe)
}`;

                this.auditFindings.push({
                    severity: stub.callersCount >= 3 ? "HIGH" : "MEDIUM",
                    category: "Runtime-Reachable Native Stub",
                    filePath: stub.filePath,
                    line: stub.line,
                    endLine: stub.endLine,
                    replaceSpan: true,
                    code: stub.signature,
                    reason: `'${stub.name}' is called ${stub.callersCount} time(s) on the active runtime path but is currently a stub (${stub.stubReason}). ${refNote}.`,
                    fixSuggestion: synthesizedBody
                });
            }
        }
    }

    _computeRelativeInclude(fromFilePath, toFilePath) {
        const fromParts = fromFilePath.split('/').slice(0, -1);
        const toParts = toFilePath.split('/');
        let common = 0;
        while (common < fromParts.length && common < toParts.length - 1 && fromParts[common] === toParts[common]) {
            common++;
        }
        const ups = Array(fromParts.length - common).fill('..');
        const rel = [...ups, ...toParts.slice(common)].join('/');
        return rel || toParts[toParts.length - 1];
    }

    planFileMove(oldQuery, newPath, getFileText) {
        const allPaths = Array.from(this.fileSummaries.keys());
        const oldPath = allPaths.find(p => p === oldQuery || p.endsWith(`/${oldQuery}`));
        if (!oldPath) {
            return { html: `<strong>File Move Error:</strong> Could not find <code>${oldQuery}</code> in mounted workspace.`, fileEdits: [] };
        }
        const cleanNewPath = newPath.trim().replace(/^\/+/, "");
        const oldBase = oldPath.split('/').pop();
        const fileEdits = [];
        const updatedRefs = [];

        // 1. Move file content itself (oldPath -> deleted, cleanNewPath -> created)
        const origContent = getFileText(oldPath);
        fileEdits.push({ filePath: oldPath, action: "delete", newText: null, summary: `Delete old path ${oldPath}` });
        fileEdits.push({ filePath: cleanNewPath, action: "create", newText: origContent, summary: `Create new path ${cleanNewPath}` });

        // 2. Rewrite #include directives in every dependent file
        for (const [p, sum] of this.fileSummaries.entries()) {
            if (p === oldPath) continue;
            const text = getFileText(p);
            if (!text) continue;
            let modified = false;
            const nextLines = text.split('\n').map((line, idx) => {
                const m = line.match(/^(\s*#include\s+")([^"]+)(".*)$/);
                if (m && (m[2].endsWith(`/${oldBase}`) || m[2] === oldBase)) {
                    const newInc = this._computeRelativeInclude(p, cleanNewPath);
                    modified = true;
                    updatedRefs.push(`<code>${p}:${idx + 1}</code>: <code>#include "${m[2]}"</code> &rarr; <code>#include "${newInc}"</code>`);
                    return `${m[1]}${newInc}${m[3]}`;
                }
                return line;
            });
            if (modified) {
                fileEdits.push({ filePath: p, action: "modify", newText: nextLines.join('\n'), summary: `Update #include to ${cleanNewPath}` });
            }
        }

        // 3. Rewrite explicit source paths in CMakeLists.txt / Android.mk
        for (const buildPath of this.androidModel.cmakeFiles) {
            const bText = getFileText(buildPath);
            if (!bText) continue;
            const buildDir = buildPath.includes('/') ? buildPath.slice(0, buildPath.lastIndexOf('/')) : '';
            const relOld = buildDir && oldPath.startsWith(`${buildDir}/`) ? oldPath.slice(buildDir.length + 1) : oldBase;
            const relNew = buildDir && cleanNewPath.startsWith(`${buildDir}/`) ? cleanNewPath.slice(buildDir.length + 1) : cleanNewPath;
            if (bText.includes(relOld)) {
                const updatedBuild = bText.split(relOld).join(relNew);
                fileEdits.push({ filePath: buildPath, action: "modify", newText: updatedBuild, summary: `Update build recipe ${relOld} -> ${relNew}` });
                updatedRefs.push(`<code>${buildPath}</code>: <code>${relOld}</code> &rarr; <code>${relNew}</code>`);
            }
        }

        const html = `<strong>Cross-File Move & Reference Refactor Staged:</strong><br>` +
            `• Moved <code>${oldPath}</code> &rarr; <code>${cleanNewPath}</code><br>` +
            `• Automatically updated <strong>${updatedRefs.length}</strong> dependent reference(s) across <strong>${fileEdits.length}</strong> total file operations:<br>` +
            (updatedRefs.length > 0 ? updatedRefs.slice(0, 8).map(r => `&nbsp;&nbsp;- ${r}`).join('<br>') + '<br>' : '') +
            `• Tap <strong>Export .patch</strong> to download the multi-file <code>git apply</code> refactor.`;
        return { html, fileEdits };
    }

    planFileDelete(targetQuery, getFileText) {
        const allPaths = Array.from(this.fileSummaries.keys());
        const targetPath = allPaths.find(p => p === targetQuery || p.endsWith(`/${targetQuery}`));
        if (!targetPath) {
            return { html: `<strong>File Delete Error:</strong> Could not find <code>${targetQuery}</code> in mounted workspace.`, fileEdits: [] };
        }
        const baseName = targetPath.split('/').pop();
        const fileEdits = [{ filePath: targetPath, action: "delete", newText: null, summary: `Delete ${targetPath}` }];
        const cleanedRefs = [];

        for (const [p] of this.fileSummaries.entries()) {
            if (p === targetPath) continue;
            const text = getFileText(p);
            if (!text) continue;
            let modified = false;
            const filtered = text.split('\n').filter((line, idx) => {
                const m = line.match(/^\s*#include\s+"([^"]+)"/);
                if (m && (m[1].endsWith(`/${baseName}`) || m[1] === baseName)) {
                    modified = true;
                    cleanedRefs.push(`Removed dead include in <code>${p}:${idx + 1}</code>`);
                    return false;
                }
                return true;
            });
            if (modified) {
                fileEdits.push({ filePath: p, action: "modify", newText: filtered.join('\n'), summary: `Remove #include "${baseName}"` });
            }
        }

        for (const buildPath of this.androidModel.cmakeFiles) {
            const bText = getFileText(buildPath);
            if (!bText) continue;
            const buildDir = buildPath.includes('/') ? buildPath.slice(0, buildPath.lastIndexOf('/')) : '';
            const relTarget = buildDir && targetPath.startsWith(`${buildDir}/`) ? targetPath.slice(buildDir.length + 1) : baseName;
            if (bText.includes(relTarget)) {
                const nextBuild = bText.split('\n').filter(l => !l.includes(relTarget)).join('\n');
                fileEdits.push({ filePath: buildPath, action: "modify", newText: nextBuild, summary: `Remove ${relTarget} from build` });
                cleanedRefs.push(`Removed build target entry in <code>${buildPath}</code>`);
            }
        }

        const html = `<strong>Cross-File Deletion & Reference Cleanup Staged:</strong><br>` +
            `• Marked <code>${targetPath}</code> for deletion and cleaned <strong>${cleanedRefs.length}</strong> dependent reference(s):<br>` +
            (cleanedRefs.length > 0 ? cleanedRefs.slice(0, 8).map(r => `&nbsp;&nbsp;- ${r}`).join('<br>') + '<br>' : '') +
            `• Tap <strong>Export .patch</strong> to apply cleanly with <code>git apply</code>.`;
        return { html, fileEdits };
    }

    planStubUnification(getFileText) {
        const stubFiles = Array.from(this.fileSummaries.keys()).filter(p =>
            /stub/i.test(p) && /\.(c|cpp|cc|cxx)$/i.test(p) && !p.includes("/tools/")
        );
        if (stubFiles.length === 0) {
            return { html: `<strong>Stub Unification:</strong> No stub C/C++ translation units found in mounted workspace.`, fileEdits: [] };
        }

        const primaryCppDir = stubFiles[0].includes("/cpp/")
            ? stubFiles[0].slice(0, stubFiles[0].indexOf("/cpp/") + 4)
            : stubFiles[0].split('/').slice(0, -1).join('/');
        const unifiedPath = `${primaryCppDir}/dkr_unified_stubs.cpp`;

        const seenSymbols = new Set();
        const unifiedBlocks = [
            `// Auto-Unified Android N64/DKR Stubs (Consolidated from ${stubFiles.length} translation units)`,
            `#include <stdint.h>`,
            `#include <stddef.h>`,
            `#include <android/log.h>`,
            ``,
            `#ifdef __cplusplus`,
            `extern "C" {`,
            `#endif`,
            ``
        ];

        let deduplicatedCount = 0;
        for (const sf of stubFiles) {
            const text = getFileText(sf);
            if (!text) continue;
            unifiedBlocks.push(`// --- Source: ${sf} ---`);
            for (const line of text.split('\n')) {
                const t = line.trim();
                if (t.startsWith("#include ")) continue;
                const fnMatch = t.match(/^(?:extern\s+"C"\s+)?(?:static\s+|inline\s+)?(?:[a-zA-Z0-9_*&:\s]+?)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^;{}]*\)\s*\{/);
                if (fnMatch) {
                    const sym = fnMatch[1];
                    if (seenSymbols.has(sym)) {
                        deduplicatedCount++;
                        unifiedBlocks.push(`// [Deduplicated duplicate symbol: ${sym} from ${sf}]`);
                        continue;
                    }
                    seenSymbols.add(sym);
                }
                unifiedBlocks.push(line);
            }
            unifiedBlocks.push(``);
        }
        unifiedBlocks.push(`#ifdef __cplusplus`, `}`, `#endif`, ``);

        const fileEdits = [
            { filePath: unifiedPath, action: "create", newText: unifiedBlocks.join('\n'), summary: `Create unified stub file ${unifiedPath}` }
        ];

        for (const sf of stubFiles) {
            if (sf !== unifiedPath) {
                fileEdits.push({ filePath: sf, action: "delete", newText: null, summary: `Remove consolidated stub file ${sf}` });
            }
        }

        // Update CMakeLists.txt files to replace old stub files with dkr_unified_stubs.cpp
        for (const buildPath of this.androidModel.cmakeFiles) {
            const bText = getFileText(buildPath);
            if (!bText) continue;
            const buildDir = buildPath.includes('/') ? buildPath.slice(0, buildPath.lastIndexOf('/')) : '';
            const relUnified = buildDir && unifiedPath.startsWith(`${buildDir}/`) ? unifiedPath.slice(buildDir.length + 1) : "dkr_unified_stubs.cpp";
            let modified = false;
            let addedUnified = false;
            const nextLines = [];
            for (const line of bText.split('\n')) {
                const matchesStub = stubFiles.some(sf => {
                    const relSf = buildDir && sf.startsWith(`${buildDir}/`) ? sf.slice(buildDir.length + 1) : sf.split('/').pop();
                    return line.includes(relSf);
                });
                if (matchesStub) {
                    modified = true;
                    if (!addedUnified) {
                        const indent = (line.match(/^\s*/) || [""])[0];
                        nextLines.push(`${indent}${relUnified}`);
                        addedUnified = true;
                    }
                } else {
                    nextLines.push(line);
                }
            }
            if (modified) {
                fileEdits.push({ filePath: buildPath, action: "modify", newText: nextLines.join('\n'), summary: `Point ${buildPath} to ${relUnified}` });
            }
        }

        const html = `<strong>Stub Unification Plan Staged:</strong><br>` +
            `• Consolidated <strong>${stubFiles.length}</strong> stub files into <code>${unifiedPath}</code> (${seenSymbols.size} unique functions preserved, ${deduplicatedCount} duplicate definitions flagged).<br>` +
            `• Updated <code>CMakeLists.txt</code> source targets and marked obsolete stub files for deletion:<br>` +
            stubFiles.map(sf => `&nbsp;&nbsp;- <code>${sf}</code>`).join('<br>') + `<br>` +
            `• Tap <strong>Export .patch</strong> to download the complete multi-file refactor.`;
        return { html, fileEdits };
    }

    runStubParityReport() {
        if (this.stubCatalog.length === 0) {
            return {
                html: `<strong>Native Stub & Decomp Parity Report:</strong><br>No stub functions detected yet. Mount your workspace first.`,
                synthesizedDiff: null
            };
        }
        const activeStubs = this.stubCatalog
            .filter(s => s.isRuntimeReachable)
            .sort((a, b) => b.callersCount - a.callersCount);
        const deadStubs = this.stubCatalog.length - activeStubs.length;

        let html = `<strong>Native Stub & Decomp Parity Report (${this.stubCatalog.length} total stubs: ${activeStubs.length} runtime-reachable, ${deadStubs} uncalled):</strong><br>`;
        for (const s of activeStubs.slice(0, 8)) {
            const decompTag = s.decompImpl ? ` &rarr; Decomp: <code>${s.decompImpl.filePath}:${s.decompImpl.line}</code>` : "";
            const manTag = s.manualDoc ? ` [N64 Manual Spec]` : "";
            html += `• <code>${s.name}</code> in <code>${s.filePath}:${s.line}</code> (<strong>${s.callersCount} callers</strong>) — <em>${s.stubReason}</em>${decompTag}${manTag}<br>`;
        }
        let synthesizedDiff = null;
        if (activeStubs.length > 0) {
            const top = activeStubs[0];
            synthesizedDiff = {
                filePath: top.filePath,
                line: top.line,
                endLine: top.endLine,
                replaceSpan: true,
                symbolName: `Stub Parity: ${top.name}`,
                contextBefore: [`// [Stub Parity] ${top.stubReason} (${top.callersCount} active callers)`],
                insertionLines: top.decompImpl
                    ? [`// Reference implementation from ${top.decompImpl.filePath}:${top.decompImpl.line}:`, ...top.decompImpl.snippet.split('\n')]
                    : [`// N64 Manual Spec: ${top.manualDoc || "Implement hardware shim"}`, ...top.originalLines],
                contextAfter: []
            };
            html += `<br><strong>Staged Highest-Impact Stub:</strong> Loaded <code>${top.name}</code> (<code>${top.filePath}:${top.line}</code>) into Diff Review.`;
        }
        return { html, synthesizedDiff };
    }

    _crossVerifyEmulatorAgainstSpecs() {
        const gfxFiles = Array.from(this.fileSummaries.keys()).filter(p => /gfx_interpreter\.(c|cpp|h)$/.test(p));
        if (gfxFiles.length === 0) return;

        // Collect all case labels / opcode references inside gfx_interpreter
        const handledOpcodes = new Set();
        for (const box of this.boxes.values()) {
            if (box.payload && /gfx_interpreter\.(c|cpp|h)$/.test(box.payload.filePath) && box.payload.snippet) {
                const caseRe = /\bcase\s+(0x[0-9a-fA-F]+|[A-Za-z_][A-Za-z0-9_]*)\s*:/g;
                let cm;
                while ((cm = caseRe.exec(box.payload.snippet)) !== null) {
                    handledOpcodes.add(cm[1]);
                    if (cm[1].startsWith("0x")) handledOpcodes.add(String(Number(cm[1])));
                }
            }
        }

        // Cross-link F3DDKR / GBI macros to gfx_interpreter boxes and flag mismatched constants
        const fbW = this.macroTable.get("FB_WIDTH");
        const fbH = this.macroTable.get("FB_HEIGHT");
        const scrW = this.macroTable.get("SCREEN_WIDTH");
        const scrH = this.macroTable.get("SCREEN_HEIGHT");
        if (fbW && scrW && fbW.numericVal && scrW.numericVal && fbW.numericVal !== scrW.numericVal) {
            this.auditFindings.push({
                severity: "HIGH",
                category: "Emulator vs Game Framebuffer Resolution Mismatch",
                filePath: fbW.filePath,
                line: fbW.line,
                code: `#define FB_WIDTH ${fbW.value} (vs SCREEN_WIDTH ${scrW.value} in ${scrW.filePath}:${scrW.line})`,
                reason: `Software rasterizer framebuffer (${fbW.numericVal}x${fbH ? fbH.numericVal : "?"}) differs from game SCREEN_WIDTH (${scrW.numericVal}x${scrH ? scrH.numericVal : "?"}), causing viewport/scissor clipping or aspect scaling artifacts.`,
                replaceLine: true,
                fixSuggestion: `#define FB_WIDTH  ${scrW.numericVal}`
            });
        }

        for (const [mName, info] of this.macroTable.entries()) {
            if (!mName.startsWith("G_") || info.numericVal === null) continue;
            if (!/(?:f3ddkr|gbi|mbi)\.h$/i.test(info.filePath)) continue;
            const gfxBox = this.boxes.get(`file:${gfxFiles[0]}`);
            if (gfxBox) {
                this.addTether(`macro:${info.filePath}:${info.line}:${mName}`, gfxBox.id, 0.85, "specifies_opcode");
            }
        }
    }

    verifyFindingEndToEnd(finding) {
        if (!finding) return null;
        const verifiedNotes = [];
        let verificationStatus = "VERIFIED_SAFE";

        // 1. Check binary comparison / assignment type symmetry (e.g. dmaPtr->startAddr > (uintptr_t)addr)
        if (finding.category.includes("Pointer Truncation")) {
            const fieldCmp = finding.code.match(/([a-zA-Z_][a-zA-Z0-9_]*)(?:->|\.)([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:[<>!=]=?|\+|-|=)\s*\(\s*(?:u32|s32|uint32_t|int32_t|int)\s*\)\s*([a-zA-Z_][a-zA-Z0-9_]*)/);
            if (fieldCmp) {
                const rhsIdent = fieldCmp[3];
                const lhsField = fieldCmp[2];
                const rhsType = this.symbolTypes.get(rhsIdent);
                const lhsMeta = this.symbolTypes.get(`*.${lhsField}`);

                // If RHS is confirmed scalar u32/s32 ROM offset (not a pointer), drop false positive!
                if (rhsType && !rhsType.includes("*") && !rhsType.includes("void") && !rhsType.includes("uintptr")) {
                    return null;
                }
                if (lhsMeta && typeof lhsMeta === "object" && /^(?:u32|s32|uint32_t|int32_t)$/.test(lhsMeta.type)) {
                    verificationStatus = "COUPLED_STRUCT_FIELD_REQUIRED";
                    verifiedNotes.push(`Coupled field '${lhsMeta.structName}.${lhsField}' in ${lhsMeta.filePath} is currently '${lhsMeta.type}' and must also widen to 'uintptr_t'.`);
                    finding.fixSuggestion = `${finding.fixSuggestion}\n// [Co-requisite in ${lhsMeta.filePath}] Widen ${lhsMeta.structName}.${lhsField} from ${lhsMeta.type} -> uintptr_t`;
                }
            }
            // Verify <stdint.h> availability for uintptr_t
            const sum = this.fileSummaries.get(finding.filePath);
            if (sum && !sum.includes.some(inc => inc.includes("stdint.h") || inc.includes("ultra64.h") || inc.includes("types.h"))) {
                verifiedNotes.push("Requires #include <stdint.h> for uintptr_t.");
            }
        }

        // 2. Check balanced delimiters in synthesized fixSuggestion
        const codeOnly = finding.fixSuggestion.split("\n").filter(l => !l.trim().startsWith("//")).join("\n");
        const openParens = (codeOnly.match(/\(/g) || []).length;
        const closeParens = (codeOnly.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
            verificationStatus = "SYNTAX_REVIEW_NEEDED";
            verifiedNotes.push(`Unbalanced parentheses in synthesized line (${openParens} '(' vs ${closeParens} ')').`);
        }

        finding.verificationStatus = verificationStatus;
        finding.verificationNotes = verifiedNotes;
        return finding;
    }

    finalizeCrossReferences() {
        let sumLen = 0;
        for (const len of this.docLengths.values()) sumLen += len;
        this.avgDocLength = this.totalDocs > 0 ? sumLen / this.totalDocs : 1;

        const allPaths = Array.from(this.fileSummaries.keys());

        // 1. Resolve #include dependencies bidirectionally
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

        // 3. Link R.layout.* / R.id.* references to XML resource files
        for (const rRef of this.androidModel.resourceRefs) {
            const parts = rRef.ref.split('.');
            const kind = parts[1];
            const name = parts[2];
            const xmlMatch = this.androidModel.xmlResources.find(x =>
                (kind === "layout" && x.resRef === rRef.ref) ||
                (kind === "id" && x.ids.includes(name)) ||
                (kind === "string" && x.strings.includes(name))
            );
            if (xmlMatch) {
                this.addTether(`file:${rRef.filePath}`, `res:${xmlMatch.resRef}:${xmlMatch.filePath}`, 0.85, "binds_resource");
            }
        }

        // 4. Link System.loadLibrary(...) calls to CMake/Android.mk native .so targets
        for (const lib of this.androidModel.loadedLibraries) {
            if (lib.loadKind === "load") continue;
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

        // 5. Mark C/C++ files compiled into native .so targets (both explicitSources & CMake GLOBs) & link Prefab AAR packages
        for (const target of this.androidModel.nativeTargets) {
            const libBoxId = `nativelib:${target.buildFile}:${target.targetName}`;
            const cmakeDir = target.buildFile.includes("/") ? target.buildFile.slice(0, target.buildFile.lastIndexOf("/")) : "";
            for (const pkg of target.prefabPackages) {
                this.addTether(libBoxId, `android_doc:${pkg.replace(/-/g, "")}`, 0.85, "links_prefab");
            }
            const markPackagedSource = (matchedPath) => {
                const sum = this.fileSummaries.get(matchedPath);
                if (sum) sum.packaging = `PACKAGED_IN_${target.soFileName}`;
                const fBox = this.boxes.get(`file:${matchedPath}`);
                if (fBox) fBox.payload.packaging = `PACKAGED_IN_${target.soFileName}`;
                this.addTether(`file:${matchedPath}`, libBoxId, 0.9, "compiles_into_so");
            };
            for (const srcRel of target.explicitSources) {
                const cleanSrc = srcRel.replace(/^\$\{CMAKE_CURRENT_SOURCE_DIR\}\//, "").replace(/^\.\//, "");
                const matchedPath = allPaths.find(p => p.endsWith(`/${cleanSrc}`) || p === cleanSrc);
                if (matchedPath) markPackagedSource(matchedPath);
            }
            for (const globPat of target.sourceGlobs) {
                const cleanGlob = globPat.replace(/^\$\{CMAKE_CURRENT_SOURCE_DIR\}\//, "").replace(/^\.\//, "");
                const extMatch = cleanGlob.match(/\*\.([a-zA-Z0-9]+)$/);
                const subDir = cleanGlob.split("*")[0].replace(/\/$/, "");
                const prefix = cmakeDir ? (subDir ? `${cmakeDir}/${subDir}` : cmakeDir) : subDir;
                for (const p of allPaths) {
                    if (prefix && !p.startsWith(prefix)) continue;
                    if (extMatch && !p.toLowerCase().endsWith(`.${extMatch[1].toLowerCase()}`)) continue;
                    if (/\.(c|cpp|cc|cxx|s|asm)$/i.test(p)) markPackagedSource(p);
                }
            }
        }

        // 6. Bind Java/Kotlin native methods to Static Java_* OR Dynamic RegisterNatives C/C++ implementations
        for (const jniMethod of this.androidModel.javaNativeMethods) {
            const expectedKey = jniMethod.expectedJniSymbol.toLowerCase();
            const fallbackSuffix = `_${jniMethod.methodName.toLowerCase()}`;
            let matchedCBoxId = null;
            let bindingType = null;

            for (const [symKey, boxIds] of this.symbolToBoxIds.entries()) {
                if (symKey === expectedKey || (symKey.startsWith("java_") && symKey.endsWith(fallbackSuffix))) {
                    matchedCBoxId = boxIds[0];
                    bindingType = "Static JNI (Java_*)";
                    break;
                }
            }

            if (!matchedCBoxId) {
                const dynMatch = this.androidModel.dynamicJniMethods.find(d => d.javaName === jniMethod.methodName);
                if (dynMatch) {
                    const cppBoxes = this.symbolToBoxIds.get(dynMatch.cppFuncName.toLowerCase());
                    matchedCBoxId = cppBoxes ? cppBoxes[0] : `file:${dynMatch.filePath}`;
                    bindingType = `Dynamic JNI (RegisterNatives -> ${dynMatch.cppFuncName})`;
                    this._ensureCallNode(dynMatch.cppFuncName).definedIn.push({
                        filePath: dynMatch.filePath,
                        line: dynMatch.line,
                        execRole: "JNI_BOUNDARY",
                        signature: `JNINativeMethod {"${dynMatch.javaName}", "${dynMatch.signature}", ${dynMatch.cppFuncName}}`
                    });
                }
            }

            if (matchedCBoxId) {
                jniMethod.boundCBoxId = matchedCBoxId;
                jniMethod.bindingType = bindingType;
                this.addTether(
                    `file:${jniMethod.filePath}`,
                    matchedCBoxId,
                    0.95,
                    bindingType.startsWith("Dynamic") ? "binds_jni_dynamic" : "binds_jni"
                );
            } else {
                this.auditFindings.push({
                    severity: "CRITICAL",
                    category: "Unresolved JNI Native Binding",
                    filePath: jniMethod.filePath,
                    line: jniMethod.line,
                    code: `native ${jniMethod.methodName}(...) -> ${jniMethod.expectedJniSymbol}`,
                    reason: `Java/Kotlin native method '${jniMethod.className}.${jniMethod.methodName}' has neither a static '${jniMethod.expectedJniSymbol}' export nor a RegisterNatives JNINativeMethod entry; calling it throws UnsatisfiedLinkError.`,
                    fixSuggestion: `extern "C" JNIEXPORT void JNICALL ${jniMethod.expectedJniSymbol}(JNIEnv* env, jobject thiz) { /* TODO */ }`
                });
            }
        }

        // 7. Cross-check Reverse-JNI Lookups (FindClass / GetMethodID) against R8 / ProGuard keep rules
        for (const rev of this.androidModel.reverseJniLookups) {
            const dottedClass = rev.target.replace(/\//g, ".");
            const shortClass = dottedClass.split('.').pop();
            const isSystemClass = dottedClass.startsWith("java.") || dottedClass.startsWith("android.");
            if (!isSystemClass) {
                const isProtected = this.androidModel.proguardRules.some(r =>
                    r.rule.includes(dottedClass) || r.rule.includes(shortClass)
                );
                if (!isProtected && this.androidModel.proguardFiles.length > 0) {
                    this.auditFindings.push({
                        severity: "HIGH",
                        category: "R8 Full-Mode Reverse-JNI Strip Risk",
                        filePath: rev.filePath,
                        line: rev.line,
                        code: `${rev.kind}(..., "${rev.target}"${rev.signature ? `, "${rev.signature}"` : ""})`,
                        reason: `C/C++ invokes ${rev.kind} on app class '${dottedClass}', which is not matched in proguard-rules.pro. R8 minification will rename/strip it in release builds and throw NoClassDefFoundError/NoSuchMethodError.`,
                        fixSuggestion: `-keep class ${dottedClass} { *; }`
                    });
                }
            }
        }

        // 8. Propagate Runtime Reachability from Android & Native Entry Points
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

        // 9. Cross-link N64 manual sections with codebase C/C++ symbols bidirectionally
        for (const [boxId, box] of this.boxes.entries()) {
            if (box.type !== "manual_section" || !box.payload || !box.payload.snippet) continue;
            const tokens = new Set(this.tokenize(box.payload.snippet));
            for (const tok of tokens) {
                if (tok.length < 4) continue;
                const matches = this.symbolToBoxIds.get(tok);
                if (!matches) continue;
                for (const targetId of matches) {
                    if (!targetId.startsWith("manual:")) {
                        this.addTether(boxId, targetId, 0.82, "documents_symbol");
                        this.addTether(targetId, boxId, 0.82, "documented_in_manual");
                    }
                }
            }
        }

        // 9b. Spec-vs-Emulator Cross-Verification & Stub-vs-Decomp Parity Resolution
        this._crossVerifyEmulatorAgainstSpecs();
        this._analyzeStubsAgainstDecompAndManual();

        // 10. End-to-End Self-Verification Pass on all Audit Findings & Synthesized Fixes
        this.auditFindings = this.auditFindings.map(f => this.verifyFindingEndToEnd(f)).filter(Boolean);

        const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
        this.auditFindings.sort((a, b) => (rank[a.severity] ?? 3) - (rank[b.severity] ?? 3));
        if (typeof window !== "undefined" && window.triggerCoderSnapshot) window.triggerCoderSnapshot();
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
            const boost = isExact ? 1.6 : 0.75;

            for (const [boxId, tf] of postings.entries()) {
                const box = this.boxes.get(boxId);
                const roleMultiplier = !box ? 1.0 : (box.execRole === "OFFLINE_BUILD_TOOL" ? 0.15 : (box.type === "manual_file" ? 0.2 : 1.0));
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

            const edges = this.outgoingTethers.get(currId) || [];
            for (const tether of edges) {
                if (tether.weight >= this.tau) {
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
        if (typeof window !== "undefined" && window.triggerCoderSnapshot) window.triggerCoderSnapshot();
    }

    analyzeAndroidPackagingAndOperation() {
        if (this.fileSummaries.size === 0) {
            return {
                html: `<strong>Android APK Packaging & Runtime Operation Inspector:</strong><br>No workspace mounted yet. Click <strong>Open Workspace</strong> to inspect AndroidManifest.xml, Gradle/Version Catalogs, Jetpack Compose/XML UI, CMake/Prefab native libraries, R8 ProGuard rules, and the end-to-end runtime boot flow.`,
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
        const sdkRange = (am.compileSdk || am.minSdk || am.targetSdk)
            ? `compileSdk ${am.compileSdk || "?"} | minSdk ${am.minSdk || "?"} | targetSdk ${am.targetSdk || "?"}`
            : "Not declared";
        const abis = am.abiFilters.length > 0 ? am.abiFilters.join(", ") : "Default NDK ABIs (verify arm64-v8a)";
        const vcVersions = Object.entries(am.versionCatalog.versions).slice(0, 5).map(([k, v]) => `${k}=${v}`).join(", ");
        const uiStack = am.composables.length > 0
            ? `Jetpack Compose (${am.composables.length} @Composable, ${am.viewModels.length} ViewModel)`
            : `XML Views / SurfaceView (${am.xmlResources.length} XML res${am.viewBindingEnabled ? ", ViewBinding" : ""})`;

        let html = `<strong>Android Dependent Files, APK Packaging & Full-Stack SDK Architecture:</strong><br>`;
        html += `• <strong>App Identity & Toolchain:</strong> <code>${pkgId}</code> | ${sdkRange}${am.ndkVersion ? ` | NDK <code>${am.ndkVersion}</code>` : ""} | ABIs: <code>${abis}</code><br>`;
        if (vcVersions) {
            html += `• <strong>Version Catalog (<code>libs.versions.toml</code>):</strong> <code>${vcVersions}</code><br>`;
        }
        html += `• <strong>UI & Architecture Layer:</strong> ${uiStack}<br>`;
        html += `• <strong>APK Payload Breakdown:</strong><br>`;
        html += `&nbsp;&nbsp;1. <code>AndroidManifest.xml</code> (${am.manifestFiles.length} file): ${am.components.length} components (${am.components.map(c => `<code>&lt;${c.kind}&gt; ${c.shortName}${c.isLauncher ? " [LAUNCHER]" : ""}${c.foregroundServiceType ? ` [FGS:${c.foregroundServiceType}]` : ""}</code>`).join(", ") || "none"})<br>`;
        html += `&nbsp;&nbsp;2. <code>classes.dex</code>: ${dexFiles} Java/Kotlin source files (${am.javaNativeMethods.length} <code>native</code> JNI declarations; ${am.proguardRules.length} R8 <code>-keep</code> rules)<br>`;
        html += `&nbsp;&nbsp;3. <code>lib/arm64-v8a/*.so</code>: ${am.nativeTargets.length} native target(s) [${am.nativeTargets.map(t => `<code>${t.soFileName}</code>`).join(", ") || "none"}] (${packagedSoSrc} compiled C/C++ files, ${candidateNative} candidate C/C++ runtime files, ${prebuiltSo} prebuilt <code>.so</code>${am.prefabEnabled ? ", Prefab AAR enabled" : ""})<br>`;
        html += `&nbsp;&nbsp;4. <code>assets/</code> & <code>res/</code>: ${assetFiles} asset files, ${resFiles} resource files (${offlineTools} host tools in <code>tools/</code> excluded from APK)<br>`;

        const launcher = am.components.find(c => c.isLauncher) || am.components[0];
        const services = am.components.filter(c => c.kind === "service");
        const loadedLibs = am.loadedLibraries.map(l => `<code>${l.soFileName}</code> (in <code>${l.filePath.split('/').pop()}:${l.line}</code>)`).join(", ");
        const boundStatic = am.javaNativeMethods.filter(m => m.bindingType && m.bindingType.startsWith("Static")).length;
        const boundDyn = am.javaNativeMethods.filter(m => m.bindingType && m.bindingType.startsWith("Dynamic")).length;
        const unboundJni = am.javaNativeMethods.length - (boundStatic + boundDyn);

        html += `<div style="margin-top:6px;"><strong>End-to-End Android Runtime Operation Pipeline:</strong><br>`;
        html += `1. <strong>ART Process & Component Launch:</strong> ${launcher ? `Zygote forks app process & instantiates <code>${launcher.name}</code>` : "Android Runtime entry"}${services.length > 0 ? ` + service(s) <code>${services.map(s => s.shortName).join(", ")}</code>` : ""}<br>`;
        html += `2. <strong>Dynamic Linker (<code>dlopen</code>):</strong> ${loadedLibs || "No explicit System.loadLibrary() detected"}<br>`;
        html += `3. <strong>Bidirectional JNI Bridge:</strong> ${boundStatic} static <code>Java_*</code> + ${boundDyn} dynamic <code>RegisterNatives</code> bound (${am.reverseJniLookups.length} C++ &rarr; Java reverse-JNI lookups)${unboundJni > 0 ? ` (<span style="color:#ff7b72;">${unboundJni} unresolved</span>)` : ""}<br>`;
        html += `4. <strong>Surface, Audio & Native Loop:</strong> ${am.surfaceLifecycles.length} surface lifecycle hooks traced across ${this.runtimeReachable.size} runtime-reachable C/C++ symbols (${am.features.join(", ") || "SurfaceView / GLES / Oboe-AAudio"}).</div>`;

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
            const isAndroidBuild = sum.packaging === "PACKAGED_MANIFEST" || sum.packaging === "BUILD_RECIPE" || sum.packaging === "VERSION_CATALOG" || sum.packaging === "R8_PROGUARD_RULES";
            let html = `<strong>Complete File & Packaging Trace: <code>${matchedPath}</code></strong><br>`;
            html += `• <strong>APK Packaging Role:</strong> <code>${sum.packaging}</code> | Domain: <em>${sum.domain}</em> | Execution Role: <em>${sum.execRole}</em> (${sum.lines} lines)<br>`;
            html += `• <strong>Outgoing Dependencies (#include / imports):</strong> ${sum.includes.length > 0 ? sum.includes.slice(0, 8).map(i => `<code>${i}</code>`).join(", ") : "None"}<br>`;
            html += `• <strong>Incoming Dependents (Included by):</strong> ${sum.includedBy.length > 0 ? sum.includedBy.slice(0, 6).map(i => `<code>${i}</code>`).join(", ") : "Top-level entry or build-configured unit"}<br>`;
            html += `• <strong>Defined Symbols (${sum.symbols.length}):</strong> ${sum.symbols.length > 0 ? sum.symbols.slice(0, 10).map(s => `<code>${s}</code>`).join(", ") : "None"}<br>`;

            const fileFindings = this.auditFindings.filter(f => f.filePath === matchedPath);
            if (fileFindings.length > 0) {
                html += `• <span style="color:#ff7b72;"><strong>Android & Alignment Findings (${fileFindings.length}):</strong></span> ${fileFindings.slice(0, 3).map(f => `[${f.severity}] L${f.line}: ${f.category}`).join("; ")}`;
            } else if (!isAndroidBuild) {
                html += `• <strong>Android & ABI Status:</strong> Clean (0 JNI, Compose/Lifecycle, 16KB page, LP64, or pointer truncation issues flagged).`;
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
                html: `<strong>Modern Android & Port Perfection Audit:</strong><br>No workspace mounted yet. Click <strong>Open Workspace</strong> to scan Manifest/Gradle/R8 rules, Compose/Lifecycle safety, JNI static & RegisterNatives bindings, 16 KB page-size alignment, and ARM64 LP64/MTE safety.`,
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

        let html = `<strong>Modern Android & Port Perfection Audit (${runtimeFiles} runtime/build files scanned, ${offlineFiles} offline tool files isolated):</strong><br>`;
        html += `• <strong>Severity Breakdown:</strong> <span style="color:#ff7b72;">${crit.length} CRITICAL</span> (Pointer Truncation / Unresolved JNI / Missing exported/receiver flag), <span style="color:#d29922;">${high.length} HIGH</span> (16KB Page Size / Safer DCL / R8 Strip / Compose Side-Effect / LP64), <span style="color:#58a6ff;">${med.length} MEDIUM</span> (Predictive Back / Large-Screen / DMA Alignment).<br>`;
        if (mipsAsmFiles > 0) {
            html += `• <strong>Architecture Completeness:</strong> Detected <code>${mipsAsmFiles}</code> raw MIPS <code>.s</code> assembly files requiring C/ARM64 decompilation parity for full <code>aarch64</code> execution.<br>`;
        }

        const topFindings = this.auditFindings.slice(0, 5);
        if (topFindings.length > 0) {
            html += `<div style="margin-top:6px;"><strong>Top Actionable Android SDK, JNI & Alignment Defects:</strong><br>`;
            for (const f of topFindings) {
                html += `• <strong>[${f.severity}] ${f.category}</strong> at <code>${f.filePath}:${f.line}</code><br>&nbsp;&nbsp;<em>Why:</em> ${f.reason}<br>`;
            }
            html += `</div>`;
        } else {
            html += `• Zero Android Manifest/R8, Compose/Lifecycle, JNI binding, 16 KB page-size, LP64, or pointer truncation violations detected across scanned runtime files.`;
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

        const isPackagingOrRuntimeOp = q.includes("packag") || q.includes("apk") || q.includes("aab") || q.includes("manifest") || q.includes("gradle") || q.includes("cmake") || q.includes("operate") || q.includes("operation") || q.includes("android dependent") || q.includes("android file") || q.includes("boot") || q.includes("lifecycle") || q.includes("r8") || q.includes("proguard");
        if (isPackagingOrRuntimeOp) {
            return this.analyzeAndroidPackagingAndOperation();
        }

        const isAuditQuery = q.includes("audit") || q.includes("alignment") || q.includes("perfection") || q.includes("flaw") || q.includes("defect") || q.includes("truncat") || q.includes("16kb") || q.includes("lp64") || q.includes("compliance");
        if (isAuditQuery) {
            return this.runFullPortAudit();
        }

        if (q.includes("stub")) {
            return this.runStubParityReport();
        }

        const isOverviewQuery = q.includes("port state") || q.includes("status") || q.includes("overview") || q.includes("architecture") || q.includes("summarize");
        if (isOverviewQuery) {
            return this.analyzeAndroidPackagingAndOperation();
        }

        if (q.split(/\s+/).length <= 3) {
            const directTrace = this.traceFileOrSymbol(queryText);
            if (directTrace) {
                const { activatedBoxes } = this.retrieveAndActivate(queryText, 4);
                const manualHits = activatedBoxes.filter(b => b.type === "manual_section" && b.id !== `file:${b.payload.filePath}`);
                if (manualHits.length > 0) {
                    const topM = manualHits[0];
                    const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    directTrace.html += `<div style="margin-top:8px;padding:6px 8px;border-left:2px solid #58a6ff;background:rgba(88,166,255,0.08);"><strong>N64 Manual Reference (<code>${topM.payload.filePath}:${topM.payload.line}</code>):</strong><pre style="white-space:pre-wrap;margin:4px 0 0;font-size:11px;">${esc(topM.payload.snippet.slice(0, 650))}</pre></div>`;
                }
                return directTrace;
            }
        }

        const { rawTokens, expandedTokens, activatedBoxes, activeTethers } = this.retrieveAndActivate(queryText);

        const isCrashQuery = q.includes("segv") || q.includes("crash") || q.includes("fault") || q.includes("error") || q.includes("debug") || q.includes("render") || q.includes("display") || q.includes("inaccura") || q.includes("gfx") || q.includes("tlut") || q.includes("texture") || q.includes("matrix");
        const isPatchQuery = q.includes("fix") || q.includes("patch") || q.includes("implement") || q.includes("wrap") || q.includes("diagnos");

        let html = "";
        let synthesizedDiff = null;

        const workspaceBoxes = activatedBoxes.filter(b => b.type !== "android_api_doc");
        const docBoxes = activatedBoxes.filter(b => b.type === "android_api_doc");

        html += `<strong>Android & Neuro-Symbolic Graph Reasoning (${workspaceBoxes.length} workspace nodes, ${docBoxes.length} Android SDK refs, ${activeTethers.length} active tethers):</strong><br>`;

        if (docBoxes.length > 0) {
            for (const dBox of docBoxes.slice(0, 2)) {
                html += `• <strong>[Android SDK Ref: <code>${dBox.payload.name}</code>]</strong> ${dBox.payload.snippet}<br>`;
            }
        }

        const matchedLexicon = rawTokens
            .map(t => ({ term: t, entry: this.lexicon.dictionary[t] }))
            .filter(x => x.entry && x.entry.domain === "n64_manual");
        if (matchedLexicon.length > 0) {
            for (const item of matchedLexicon.slice(0, 2)) {
                html += `• <strong>[N64 Manual Lexicon: <code>${item.term}</code>]</strong> ${item.entry.definition}<br>`;
            }
        }

        if (workspaceBoxes.length > 0) {
            const escHtml = s => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            for (const box of workspaceBoxes.slice(0, 5)) {
                const conf = Math.round(box.activation * 100);
                const pkg = box.payload.packaging || box.execRole;
                html += `• <code>${box.payload.filePath}:${box.payload.line}</code> — <strong>${box.payload.name}</strong> [<code>${pkg}</code>, ${conf}%]<br>`;
                if (box.type === "manual_section" && box.payload.snippet) {
                    html += `<pre style="white-space:pre-wrap;margin:4px 0 6px 14px;padding:6px 8px;border-left:2px solid #58a6ff;background:rgba(88,166,255,0.08);font-size:11px;">${escHtml(box.payload.snippet.slice(0, 700))}</pre>`;
                }
            }
            if (activeTethers.length > 0) {
                const edgeSummary = activeTethers.slice(0, 3).map(t => {
                    const src = this.boxes.get(t.sourceId)?.payload.name || t.sourceId;
                    const tgt = this.boxes.get(t.targetId)?.payload.name || t.targetId;
                    return `<code>${src}</code> &rarr; (<em>${t.relation}</em>) &rarr; <code>${tgt}</code>`;
                }).join("<br>");
                html += `<div style="margin-top:6px;"><strong>Traced Dependency / Runtime Tethers:</strong><br>${edgeSummary}</div>`;
            }
        } else if (docBoxes.length === 0) {
            html += `Expanded semantic query across [<em>${expandedTokens.slice(0, 8).join(", ")}</em>]. Try <code>apk packaging</code>, <code>audit alignment</code>, or <code>trace &lt;file_or_symbol&gt;</code>.`;
        }

        const targetBox = workspaceBoxes.find(b => b.execRole !== "OFFLINE_BUILD_TOOL" && (b.type === "symbol" || b.type === "jni_bridge" || b.type === "file"));
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
                const relatedManual = workspaceBoxes.find(b => b.type === "manual_section" && b.payload && b.payload.snippet);
                const manualComment = relatedManual
                    ? `// [N64 Manual Ref: ${relatedManual.payload.filePath}:${relatedManual.payload.line}] ${relatedManual.payload.name}`
                    : `// [ARM64 Runtime Guard] Null, 16-byte alignment & MTE pointer tag check for ${targetBox.payload.name}`;
                synthesizedDiff = {
                    filePath: targetBox.payload.filePath,
                    line: targetBox.payload.line,
                    symbolName: targetBox.payload.name,
                    contextBefore: snippetLines.slice(0, 3),
                    insertionLines: [
                        manualComment,
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
            boxes: Array.from(this.boxes.values()).filter(b => b.type !== "android_api_doc"),
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
            this.resetWorkspace(true);
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
