/* js/port_blueprint_learner.js v29 - Semantic Android Port Establisher, Completeness Auditor & GitHub Actions APK Generator */
(function () {
  "use strict";

  const STORAGE_KEY = "coder_android_port_blueprint_v2";
  const JAVA_RESERVED = new Set([
    "abstract","assert","boolean","break","byte","case","catch","char","class","const",
    "continue","default","do","double","else","enum","extends","final","finally","float",
    "for","goto","if","implements","import","instanceof","int","interface","long","native",
    "new","package","private","protected","public","return","short","static","strictfp",
    "super","switch","synchronized","this","throw","throws","transient","try","void",
    "volatile","while","true","false","null"
  ]);

  const KERNEL_HLE_SYMBOLS = /\b(?:osCreateThread|osStartThread|osStopThread|osDestroyThread|osYieldThread|osSetThreadPri|osGetThreadPri|osCreateMesgQueue|osSetEventMesg|osRecvMesg|osSendMesg|osJamMesg|osViSetMode|osViSetEvent|osCreateViManager|osCreatePiManager|__osInitialize_common)\b/;

  function loadBlueprint() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return { version: "v29", learnedPatterns: {} };
  }

  function saveBlueprint(bp) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(bp));
    } catch (_) {}
    if (window.coderBridge && window.coderBridge.connected) {
      fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint: bp })
      }).catch(() => {});
    }
  }

  function jniEscape(ident) {
    return String(ident || "").replace(/_/g, "_1");
  }

  // 1. Semantic Port Identity: derives collision-free package, CMake target, JNI prefix, and app label
  function deriveSemanticIdentity(texts, romMeta) {
    const paths = Object.keys(texts);

    // Check if AndroidManifest.xml or app/build.gradle already defines the port identity
    for (const p of paths) {
      const src = texts[p];
      if (typeof src !== "string") continue;
      if (/AndroidManifest\.xml$/i.test(p)) {
        const pm = src.match(/\bpackage\s*=\s*"([a-zA-Z0-9_.]+)"/);
        const lm = src.match(/\bandroid:label\s*=\s*"([^"@]+)"/);
        if (pm) {
          const segs = pm[1].split(".");
          const leaf = segs[segs.length - 1];
          const slug = leaf.replace(/wrapper$/i, "").toLowerCase() || "n64port";
          return {
            packageName: pm[1],
            jniPackagePrefix: segs.map(jniEscape).join("_"),
            libName: leaf,
            slug,
            upperSlug: slug.toUpperCase(),
            appLabel: lm ? lm[1] : slug.toUpperCase(),
            existingAndroid: true
          };
        }
      }
      if (/app\/build\.gradle/i.test(p)) {
        const nm = src.match(/\b(?:namespace|applicationId)\s*[= ]\s*["']([a-zA-Z0-9_.]+)["']/);
        if (nm) {
          const segs = nm[1].split(".");
          const leaf = segs[segs.length - 1];
          const slug = leaf.replace(/wrapper$/i, "").toLowerCase() || "n64port";
          return {
            packageName: nm[1],
            jniPackagePrefix: segs.map(jniEscape).join("_"),
            libName: leaf,
            slug,
            upperSlug: slug.toUpperCase(),
            appLabel: (romMeta && romMeta.title) || slug.toUpperCase(),
            existingAndroid: true
          };
        }
      }
    }

    // Otherwise infer semantic project identity from ROM title, Makefile/YAML, README, or root folder
    let rawName = "";
    let humanTitle = "";
    if (romMeta && romMeta.title) {
      rawName = romMeta.title;
      humanTitle = romMeta.title;
    }
    if (!rawName) {
      const yamlPath = paths.find(p => /(?:splat|baserom).*\.ya?ml$/i.test(p));
      if (yamlPath && typeof texts[yamlPath] === "string") {
        const ym = texts[yamlPath].match(/\b(?:basename|name|target)\s*:\s*["']?([A-Za-z0-9 _-]+)["']?/);
        if (ym) rawName = ym[1];
      }
    }
    if (!rawName) {
      const readmePath = paths.find(p => /(?:^|\/)README\.md$/i.test(p));
      if (readmePath && typeof texts[readmePath] === "string") {
        const hm = texts[readmePath].match(/^#\s+(.+)$/m);
        if (hm) {
          rawName = hm[1].replace(/decomp(?:ilation)?|port|aarch64|android/gi, "").trim();
          humanTitle = rawName;
        }
      }
    }
    if (!rawName && paths.length > 0) {
      rawName = paths[0].split("/")[0];
    }

    let cleaned = String(rawName || "n64port")
      .replace(/(?:decomp(?:ilation)?|aarch64|android|master|main|port|wrapper)$/gi, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    if (!cleaned) cleaned = "n64port";
    if (/^[0-9]/.test(cleaned)) cleaned = "n64_" + cleaned;
    if (JAVA_RESERVED.has(cleaned)) cleaned = cleaned + "_game";

    const compactSlug = cleaned.replace(/_/g, "") || "n64port";
    const libName = `${compactSlug}wrapper`;
    const packageName = `com.${libName}`;
    return {
      packageName,
      jniPackagePrefix: `com_${jniEscape(libName)}`,
      libName,
      slug: compactSlug,
      upperSlug: compactSlug.toUpperCase(),
      appLabel: (humanTitle || rawName || compactSlug).trim(),
      existingAndroid: paths.some(p => /(?:^|\/)android\//i.test(p))
    };
  }

  // 2. Semantic Source Tree Analyzer: discovers source roots, OS kernel files to exclude, microcode, audio, and entrypoints
  function analyzeWorkspaceSemantics(texts) {
    const paths = Object.keys(texts);
    const cFiles = paths.filter(p => /\.(?:c|cpp)$/i.test(p) && !/(?:^|\/)android\//i.test(p) && !/(?:^|\/)tools\//i.test(p));
    const hFiles = paths.filter(p => /\.(?:h|hpp)$/i.test(p) && !/(?:^|\/)android\//i.test(p));

    // Discover top-level C source directories (e.g. src, game, code) and include directories
    const srcDirs = new Set();
    const incDirs = new Set(["include", "src"]);
    for (const p of cFiles) {
      const parts = p.split("/");
      // Handle mounted folder prefix if present
      const top = parts.length > 2 ? parts[1] : parts[0];
      if (top && !top.endsWith(".c") && !top.endsWith(".cpp")) srcDirs.add(top);
    }
    for (const p of hFiles) {
      const parts = p.split("/");
      const top = parts.length > 2 ? parts[1] : parts[0];
      if (top && !top.endsWith(".h") && !top.endsWith(".hpp")) incDirs.add(top);
    }

    // Identify N64 OS kernel files in this repo that define thread/message/VI/PI managers (must be excluded when HLE'd)
    const osKernelFiles = [];
    let entrySymbol = null;
    let entryHasArg = true;
    let microcode = "F3DEX2";
    let audioEngine = "none";
    const neededHwStubs = new Set();

    for (const p of cFiles) {
      const src = texts[p];
      if (typeof src !== "string") continue;
      const baseName = p.split("/").pop();

      if (/(?:libultra|ultralib|\/os\/|\/io\/)/i.test(p) && KERNEL_HLE_SYMBOLS.test(src)) {
        osKernelFiles.push(baseName);
      }

      if (!entrySymbol) {
        const em = src.match(/\bvoid\s+(bootproc|mainproc|game_init|thread1_idle|idle_thread)\s*\(([^)]*)\)/);
        if (em) {
          entrySymbol = em[1];
          entryHasArg = em[2].trim() !== "" && em[2].trim() !== "void";
        }
      }

      if (/\bF3DEX_GBI_2\b|\bG_VTX\b.*0x01/.test(src)) microcode = "F3DEX2";
      else if (/\bF3DEX_GBI\b/.test(src)) microcode = "F3DEX";
      else if (/\bF3D_OLD\b/.test(src)) microcode = "Fast3D";

      if (/\balCSPNew\b|\balSeqpNew\b|\balSynNew\b/.test(src)) audioEngine = "libultra_naudio";
      if (/\b__osSetIntMask\b/.test(src)) neededHwStubs.add("__osSetIntMask");
      if (/\bosVirtualToPhysical\b/.test(src)) neededHwStubs.add("osVirtualToPhysical");
      if (/\bosPiRawStartDma\b|\bosPiStartDma\b/.test(src)) neededHwStubs.add("osPiStartDma");
      if (/\bosSpTaskStartGo\b|\bosSpTaskLoad\b/.test(src)) neededHwStubs.add("osSpTaskStartGo");
      if (/\bosEepromProbe\b|\bosEepromLongRead\b/.test(src)) neededHwStubs.add("osEeprom");
    }

    for (const p of hFiles) {
      const src = texts[p];
      if (typeof src !== "string") continue;
      if (/\bF3DEX_GBI_2\b/.test(src)) microcode = "F3DEX2";
      else if (/\bF3DEX_GBI\b/.test(src)) microcode = "F3DEX";
    }

    return {
      cFileCount: cFiles.length,
      srcDirs: Array.from(srcDirs),
      incDirs: Array.from(incDirs),
      osKernelFiles: Array.from(new Set(osKernelFiles)),
      entrySymbol: entrySymbol || "bootproc",
      entryHasArg,
      microcode,
      audioEngine,
      neededHwStubs: Array.from(neededHwStubs)
    };
  }

  function extractJavaNativeMethods(texts) {
    const decls = [];
    for (const [filePath, src] of Object.entries(texts)) {
      if (typeof src !== "string" || !/\.java$/i.test(filePath)) continue;
      const pkgMatch = src.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m);
      const clsMatch = src.match(/\b(?:public\s+)?(?:final\s+)?class\s+([A-Za-z_]\w*)/);
      const pkg = pkgMatch ? pkgMatch[1] : "";
      const cls = clsMatch ? clsMatch[1] : filePath.split("/").pop().replace(/\.java$/i, "");
      const nativeRe = /\b(?:public|private|protected)?\s*(?:static\s+)?native\s+([A-Za-z0-9_<>\[\].]+)\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*;/g;
      let m;
      while ((m = nativeRe.exec(src)) !== null) {
        const line = src.slice(0, m.index).split("\n").length;
        const expectedJniSymbol = `Java_${pkg.split(".").map(jniEscape).join("_")}_${jniEscape(cls)}_${jniEscape(m[2])}`;
        decls.push({
          filePath,
          line,
          packageName: pkg,
          className: cls,
          returnType: m[1].trim(),
          methodName: m[2].trim(),
          params: m[3].trim(),
          expectedJniSymbol
        });
      }
    }
    return decls;
  }

  // Learn architectural idioms from an established reference port
  window.learnAndroidBlueprint = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const paths = Object.keys(texts);
    if (paths.length === 0) {
      appendAgentMessage("<strong>No workspace loaded:</strong> Open a reference port workspace first.");
      return;
    }
    const id = deriveSemanticIdentity(texts, window.lastAnalyzedRom);
    const sem = analyzeWorkspaceSemantics(texts);
    const bp = loadBlueprint();
    bp.learnedFrom = id.packageName;
    bp.updatedAt = new Date().toISOString();
    bp.learnedPatterns[id.slug] = {
      packageName: id.packageName,
      microcode: sem.microcode,
      audioEngine: sem.audioEngine,
      osKernelExclusions: sem.osKernelFiles,
      nativeMethods: extractJavaNativeMethods(texts).map(d => d.methodName)
    };
    saveBlueprint(bp);
    appendAgentMessage(
      `<strong>Port Idioms Learned (<code>${id.packageName}</code>):</strong><br>` +
      `• <strong>Detected Subsystems:</strong> Microcode <code>${sem.microcode}</code> | Audio <code>${sem.audioEngine}</code> | Entry <code>${sem.entrySymbol}()</code><br>` +
      `• <strong>OS Kernel HLE Exclusions:</strong> ${sem.osKernelFiles.length} modules indexed<br>` +
      `• <strong>JNI Native Surface:</strong> ${bp.learnedPatterns[id.slug].nativeMethods.length} native entry points stored`
    );
  };

  // Validate completeness & alignment of an existing port
  window.validateAgainstBlueprint = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const paths = Object.keys(texts);
    if (paths.length === 0) {
      appendAgentMessage("<strong>No workspace loaded:</strong> Open a workspace first.");
      return;
    }
    const id = deriveSemanticIdentity(texts, window.lastAnalyzedRom);
    const sem = analyzeWorkspaceSemantics(texts);
    const nativeDecls = extractJavaNativeMethods(texts);
    const cppCorpus = Object.entries(texts)
      .filter(([p, v]) => typeof v === "string" && /\.(?:c|cc|cpp|cxx|h|hpp)$/i.test(p))
      .map(([, v]) => v)
      .join("\n");
    const missingJni = nativeDecls.filter(d => !cppCorpus.includes(d.expectedJniSymbol));

    const cmakePath = paths.find(p => /(?:^|\/)android\/app\/src\/main\/cpp\/CMakeLists\.txt$/i.test(p));
    const unregisteredCpp = [];
    if (cmakePath && typeof texts[cmakePath] === "string") {
      const cm = texts[cmakePath];
      for (const p of paths) {
        const m = p.match(/(?:^|\/)android\/app\/src\/main\/cpp\/((?:emulator|ultra|tools|menu)\/[A-Za-z0-9_]+\.(?:c|cpp))$/i);
        if (m && !cm.includes(m[1])) unregisteredCpp.push(m[1]);
      }
    }

    const gfxHPath = paths.find(p => /gfx_interpreter\.h$/i.test(p));
    const nbCppPath = paths.find(p => /NativeBridge\.cpp$/i.test(p));
    let fbMismatch = null;
    if (gfxHPath && nbCppPath && typeof texts[gfxHPath] === "string" && typeof texts[nbCppPath] === "string") {
      const fw = texts[gfxHPath].match(/#define\s+FB_WIDTH\s+(\d+)/);
      const fh = texts[gfxHPath].match(/#define\s+FB_HEIGHT\s+(\d+)/);
      const sw = texts[nbCppPath].match(/g_surfaceWidth\s*=\s*(\d+)/);
      const sh = texts[nbCppPath].match(/g_surfaceHeight\s*=\s*(\d+)/);
      if (fw && fh && sw && sh && (fw[1] !== sw[1] || fh[1] !== sh[1])) {
        fbMismatch = { fbW: fw[1], fbH: fh[1], nbCppPath, surfW: sw[1], surfH: sh[1] };
      }
    }

    let staged = 0;
    if (typeof engine !== "undefined" && Array.isArray(engine.auditFindings)) {
      for (const mj of missingJni) {
        engine.auditFindings.push({
          severity: "HIGH",
          category: "Port Validation: Missing JNI C++ Symbol",
          filePath: nbCppPath || mj.filePath,
          line: nbCppPath ? texts[nbCppPath].split("\n").length : mj.line,
          code: `${mj.returnType} ${mj.methodName}(${mj.params});`,
          reason: `Java '${mj.className}.${mj.methodName}' (${mj.filePath}:${mj.line}) has no matching '${mj.expectedJniSymbol}' in C/C++ sources.`,
          replaceLine: false,
          fixSuggestion: `extern "C" JNIEXPORT void JNICALL ${mj.expectedJniSymbol}(JNIEnv* env, jclass clazz) { /* TODO: wire ${mj.methodName} */ }`,
          verificationStatus: "PATTERN_MATCHED",
          verificationNotes: [],
          port17: true
        });
        staged++;
      }
      if (fbMismatch) {
        const nbLines = texts[fbMismatch.nbCppPath].split("\n");
        const idx = nbLines.findIndex(l => /g_surfaceWidth\s*=/.test(l));
        if (idx !== -1) {
          engine.auditFindings.push({
            severity: "MEDIUM",
            category: "Port Alignment: FB_WIDTH vs g_surfaceWidth Drift",
            filePath: fbMismatch.nbCppPath,
            line: idx + 1,
            code: nbLines[idx].trim(),
            reason: `gfx_interpreter.h sets FB_WIDTH=${fbMismatch.fbW}x${fbMismatch.fbH} while NativeBridge.cpp sets g_surfaceWidth=${fbMismatch.surfW}x${fbMismatch.surfH}.`,
            replaceLine: true,
            fixSuggestion: nbLines[idx].trim().replace(/\d+/, fbMismatch.fbW),
            verificationStatus: "PATTERN_MATCHED",
            verificationNotes: [],
            port17: true
          });
          staged++;
        }
      }
    }

    let html = `<strong>Port Validation Report (<code>${id.packageName}</code> — ${sem.microcode} / ${sem.audioEngine}):</strong><br>` +
      `• <strong>JNI Java &lt;-&gt; C++ Linkage:</strong> ${nativeDecls.length - missingJni.length}/${nativeDecls.length} native methods matched` +
      (missingJni.length ? ` (<strong>${missingJni.length} missing</strong>)` : "") + `<br>` +
      `• <strong>CMakeLists.txt Registration:</strong> ${unregisteredCpp.length === 0 ? "All bridge sources registered" : `${unregisteredCpp.length} unregistered file(s): <code>${unregisteredCpp.join(", ")}</code>`}<br>`;
    if (fbMismatch) {
      html += `• <strong>Framebuffer Drift:</strong> <code>FB_WIDTH=${fbMismatch.fbW}x${fbMismatch.fbH}</code> vs <code>g_surfaceWidth=${fbMismatch.surfW}x${fbMismatch.surfH}</code><br>`;
    }
    if (staged > 0) {
      html += `• <strong>Staged Fixes:</strong> Added <code>${staged}</code> completion patch(es) to Findings.`;
      if (typeof renderFindingsList === "function") renderFindingsList();
    }
    appendAgentMessage(html);
  };

  // 3. Establish Android Port: semantically aligns source, generates missing Android/ files + GitHub Actions APK workflow
  window.establishAndroidPort = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const paths = Object.keys(texts);
    if (paths.length === 0) {
      appendAgentMessage("<strong>No workspace loaded:</strong> Open your N64 source folder first so I can analyze its symbols and establish the Android port.");
      return;
    }

    const id = deriveSemanticIdentity(texts, window.lastAnalyzedRom);
    const sem = analyzeWorkspaceSemantics(texts);
    const pkgPath = id.packageName.replace(/\./g, "/");

    const globLines = (sem.srcDirs.length > 0 ? sem.srcDirs : ["src"])
      .map(d => `file(GLOB_RECURSE SRC_${d.toUpperCase().replace(/[^A-Z0-9]/g, "_")} "\${REPO_ROOT}/${d}/*.c")\nlist(APPEND ALL_GAME_FILES \${SRC_${d.toUpperCase().replace(/[^A-Z0-9]/g, "_")}})`)
      .join("\n");
    const incLines = sem.incDirs.map(d => `    \${REPO_ROOT}/${d}`).join("\n");
    const excludeTokens = sem.osKernelFiles.length > 0
      ? sem.osKernelFiles.join(" ")
      : "createthread.c startthread.c stopthread.c createmesgqueue.c recvmesg.c sendmesg.c visetmode.c vimgr.c pimanager.c";

    const stubDecls = [
      `#include <stdint.h>`,
      `#include <stddef.h>`,
      ``,
      `/* Semantically generated N64 hardware/OS HLE stubs for ${id.packageName} (${sem.microcode}, audio=${sem.audioEngine}) */`,
      `void __osInitialize_common(void) {}`
    ];
    if (sem.neededHwStubs.includes("__osSetIntMask")) stubDecls.push(`uint32_t __osSetIntMask(uint32_t mask) { return mask; }`);
    if (sem.neededHwStubs.includes("osVirtualToPhysical")) stubDecls.push(`uintptr_t osVirtualToPhysical(void* addr) { return (uintptr_t)addr; }`);
    if (sem.neededHwStubs.includes("osPiStartDma")) stubDecls.push(`int32_t osPiStartDma(void* mb, int32_t pri, int32_t dir, uintptr_t devAddr, void* vAddr, size_t nbytes, void* mq) { (void)mb;(void)pri;(void)dir;(void)devAddr;(void)vAddr;(void)nbytes;(void)mq; return 0; }`);
    if (sem.neededHwStubs.includes("osSpTaskStartGo")) stubDecls.push(`void osSpTaskStartGo(void* tp) { (void)tp; }`);
    if (sem.neededHwStubs.includes("osEeprom")) stubDecls.push(`int32_t osEepromProbe(void* mq) { (void)mq; return 1; }`);

    const entryCall = sem.entryHasArg ? `${sem.entrySymbol}(nullptr);` : `${sem.entrySymbol}();`;

    const candidateFiles = {
      "Android/settings.gradle": `rootProject.name = "${id.libName}"\ninclude ':app'\n`,
      "Android/build.gradle": `buildscript {\n    repositories {\n        google()\n        mavenCentral()\n    }\n    dependencies {\n        classpath 'com.android.tools.build:gradle:8.2.2'\n    }\n}\nallprojects {\n    repositories {\n        google()\n        mavenCentral()\n    }\n}\n`,
      "Android/gradlew": `#!/usr/bin/env sh\nexec gradle "$@"\n`,
      "Android/app/build.gradle": `plugins {\n    id 'com.android.application'\n}\nandroid {\n    namespace '${id.packageName}'\n    compileSdk 34\n    defaultConfig {\n        applicationId "${id.packageName}"\n        minSdk 26\n        targetSdk 34\n        versionCode 1\n        versionName "1.0"\n        ndk {\n            abiFilters 'arm64-v8a'\n        }\n        externalNativeBuild {\n            cmake {\n                cppFlags "-std=c++17 -O2"\n            }\n        }\n    }\n    externalNativeBuild {\n        cmake {\n            path "src/main/cpp/CMakeLists.txt"\n            version "3.22.1"\n        }\n    }\n}\n`,
      "Android/app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-feature android:glEsVersion="0x00020000" android:required="true" />\n    <application android:label="${id.appLabel}" android:hasFragileUserData="true">\n        <activity android:name=".MainActivity" android:screenOrientation="landscape" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
      [`Android/app/src/main/java/${pkgPath}/NativeBridge.java`]: `package ${id.packageName};\n\nimport android.content.res.AssetManager;\nimport android.view.Surface;\n\npublic final class NativeBridge {\n    static {\n        System.loadLibrary("${id.libName}");\n    }\n    public static native void nativeInit(AssetManager mgr, String baseDir);\n    public static native void nativeSurfaceCreated(Surface surface);\n    public static native void nativeSurfaceChanged(int width, int height);\n    public static native void nativeDrawFrame();\n    public static native void nativeSetInput(int buttons, int stickX, int stickY);\n}\n`,
      [`Android/app/src/main/java/${pkgPath}/MainActivity.java`]: `package ${id.packageName};\n\nimport android.app.Activity;\nimport android.opengl.GLSurfaceView;\nimport android.os.Bundle;\nimport javax.microedition.khronos.egl.EGLConfig;\nimport javax.microedition.khronos.opengles.GL10;\n\npublic class MainActivity extends Activity {\n    private GLSurfaceView glView;\n\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        NativeBridge.nativeInit(getAssets(), getFilesDir().getAbsolutePath());\n        glView = new GLSurfaceView(this);\n        glView.setEGLContextClientVersion(2);\n        glView.setRenderer(new GLSurfaceView.Renderer() {\n            @Override public void onSurfaceCreated(GL10 gl, EGLConfig config) {\n                NativeBridge.nativeSurfaceCreated(glView.getHolder().getSurface());\n            }\n            @Override public void onSurfaceChanged(GL10 gl, int w, int h) {\n                NativeBridge.nativeSurfaceChanged(w, h);\n            }\n            @Override public void onDrawFrame(GL10 gl) {\n                NativeBridge.nativeDrawFrame();\n            }\n        });\n        setContentView(glView);\n    }\n}\n`,
      "Android/app/src/main/cpp/CMakeLists.txt": `cmake_minimum_required(VERSION 3.22.1)\nproject(${id.libName})\n\nset(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nadd_compile_definitions(PORT=1 __aarch64__ NON_MATCHING NON_EQUIVALENT ${id.upperSlug}_PORT=1 GBI_${sem.microcode}=1)\n\nset(REPO_ROOT \${CMAKE_CURRENT_SOURCE_DIR}/../../../../..)\nset(ALL_GAME_FILES "")\n${globLines}\n\nset(EXCLUDE_LIST ${excludeTokens})\nset(GAME_SOURCES "")\nforeach(F \${ALL_GAME_FILES})\n    get_filename_component(N \${F} NAME)\n    if(NOT N IN_LIST EXCLUDE_LIST)\n        list(APPEND GAME_SOURCES \${F})\n    endif()\nendforeach()\n\nadd_library(${id.libName} SHARED\n    ultra/NativeBridge.cpp\n    ${id.slug}_stubs.c\n    \${GAME_SOURCES}\n)\n\ntarget_include_directories(${id.libName} PRIVATE\n    \${CMAKE_CURRENT_SOURCE_DIR}\n    \${CMAKE_CURRENT_SOURCE_DIR}/ultra\n${incLines}\n)\n\ntarget_link_options(${id.libName} PRIVATE -Wl,--wrap=memcpy -Wl,--wrap=memmove -Wl,--wrap=memset -Wl,--export-dynamic -Wl,--wrap=__osInitialize_common)\ntarget_link_libraries(${id.libName} android log EGL GLESv2)\n`,
      [`Android/app/src/main/cpp/${id.slug}_stubs.c`]: stubDecls.join("\n") + "\n",
      "Android/app/src/main/cpp/ultra/NativeBridge.cpp": `#include <jni.h>\n#include <stdint.h>\n#include <pthread.h>\n#include <android/log.h>\n#include <android/asset_manager_jni.h>\n#include <android/native_window_jni.h>\n#include <GLES2/gl2.h>\n\n#define LOG_TAG "${id.libName}"\n#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)\n\nextern "C" void ${sem.entrySymbol}(${sem.entryHasArg ? "void*" : "void"});\nstatic AAssetManager* g_assetManager = nullptr;\nstatic ANativeWindow* g_window = nullptr;\nstatic int g_surfaceWidth = 320;\nstatic int g_surfaceHeight = 240;\n\nstatic void* game_entry_trampoline(void*) {\n    ${entryCall}\n    return nullptr;\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeInit(JNIEnv* env, jclass, jobject assetMgr, jstring) {\n    g_assetManager = AAssetManager_fromJava(env, assetMgr);\n    LOGI("Established ${id.packageName} (microcode=${sem.microcode}, entry=${sem.entrySymbol})");\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSurfaceCreated(JNIEnv* env, jclass, jobject surface) {\n    if (g_window) ANativeWindow_release(g_window);\n    g_window = surface ? ANativeWindow_fromSurface(env, surface) : nullptr;\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSurfaceChanged(JNIEnv*, jclass, jint w, jint h) {\n    g_surfaceWidth = w;\n    g_surfaceHeight = h;\n    glViewport(0, 0, w, h);\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeDrawFrame(JNIEnv*, jclass) {\n    glClearColor(0.05f, 0.07f, 0.11f, 1.0f);\n    glClear(GL_COLOR_BUFFER_BIT);\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSetInput(JNIEnv*, jclass, jint, jint, jint) {}\n`,
      ".github/workflows/build-android.yml": `name: Build Android APK (${id.packageName})\non:\n  push:\n    branches: [ main, master, '*-aarch64' ]\n  workflow_dispatch:\njobs:\n  build-apk:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n      - uses: android-actions/setup-android@v3\n      - name: Build Debug APK\n        working-directory: Android\n        run: gradle assembleDebug --no-daemon\n      - uses: actions/upload-artifact@v4\n        with:\n          name: ${id.libName}-debug-apk\n          path: Android/app/build/outputs/apk/debug/*.apk\n`
    };

    // Non-destructive merge: preserve existing custom files in workspace, only materialize missing files
    const created = [];
    const preserved = [];
    const lowerExisting = new Set(paths.map(p => p.toLowerCase()));
    for (const [relPath, content] of Object.entries(candidateFiles)) {
      if (lowerExisting.has(relPath.toLowerCase())) {
        preserved.push(relPath);
        continue;
      }
      created.push(relPath);
      if (typeof patchedContents !== "undefined") patchedContents[relPath] = content;
      if (typeof cachedFileTexts !== "undefined") cachedFileTexts[relPath] = content;
      if (typeof window.syncPatchedFileToDisk === "function") {
        window.syncPatchedFileToDisk(relPath, content);
      }
    }
    if (typeof renderFileTree === "function") renderFileTree();

    // Package all newly established files as a downloadable POSIX TAR bundle
    if (created.length > 0) {
      const enc = new TextEncoder();
      const blocks = [];
      for (const name of created) {
        const data = enc.encode(candidateFiles[name]);
        const header = new Uint8Array(512);
        header.set(enc.encode(name.slice(0, 99)), 0);
        header.set(enc.encode(name.endsWith("gradlew") ? "0000755\x00" : "0000644\x00"), 100);
        header.set(enc.encode("0000000\x00"), 108);
        header.set(enc.encode("0000000\x00"), 116);
        header.set(enc.encode(data.length.toString(8).padStart(11, "0") + "\x00"), 124);
        header.set(enc.encode(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\x00"), 136);
        header.fill(0x20, 148, 156);
        header[156] = 0x30;
        header.set(enc.encode("ustar\x0000"), 257);
        let chksum = 0;
        for (let i = 0; i < 512; i++) chksum += header[i];
        header.set(enc.encode(chksum.toString(8).padStart(6, "0") + "\x00 "), 148);
        blocks.push(header, data);
        const pad = (512 - (data.length % 512)) % 512;
        if (pad > 0) blocks.push(new Uint8Array(pad));
      }
      blocks.push(new Uint8Array(1024));
      const total = blocks.reduce((a, b) => a + b.length, 0);
      const tar = new Uint8Array(total);
      let pos = 0;
      for (const b of blocks) { tar.set(b, pos); pos += b.length; }

      const blob = new Blob([tar], { type: "application/x-tar" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id.libName}_establish_port.tar`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }

    appendAgentMessage(
      `<strong>Android Port Established (<code>${id.packageName}</code>):</strong><br>` +
      `• <strong>Semantic Resolution:</strong> App <code>"${id.appLabel}"</code> | Native Lib <code>lib${id.libName}.so</code> | Microcode <code>${sem.microcode}</code> | Audio <code>${sem.audioEngine}</code> | Entry <code>${sem.entrySymbol}()</code><br>` +
      `• <strong>Source Alignment:</strong> Discovered ${sem.cFileCount} C/C++ files across <code>${sem.srcDirs.join(", ") || "src"}</code>; auto-excluded ${sem.osKernelFiles.length} OS kernel files; synthesized ${sem.neededHwStubs.length} hardware HLE stubs<br>` +
      `• <strong>Files Established (${created.length} created, ${preserved.length} existing preserved):</strong> ` +
      (created.length ? `<code>${created.join(", ")}</code>` : "All base Android & GitHub Actions workflow files already present.")
    );
  };
})();
