/* js/port_blueprint_learner.js v28 - Neural Android Port Blueprint Learner, Completeness Auditor & Collision-Free Replicator */
(function () {
  "use strict";

  const STORAGE_KEY = "coder_android_port_blueprint_v1";
  const JAVA_RESERVED = new Set([
    "abstract","assert","boolean","break","byte","case","catch","char","class","const",
    "continue","default","do","double","else","enum","extends","final","finally","float",
    "for","goto","if","implements","import","instanceof","int","interface","long","native",
    "new","package","private","protected","public","return","short","static","strictfp",
    "super","switch","synchronized","this","throw","throws","transient","try","void",
    "volatile","while","true","false","null"
  ]);

  // Default seed blueprint modeled on proven N64-to-Android HLE wrapper architecture
  const DEFAULT_BLUEPRINT = {
    version: "v28",
    learnedFrom: "builtin-n64-android-hle-template",
    updatedAt: null,
    compileDefines: ["PORT=1", "__aarch64__", "NON_MATCHING", "NON_EQUIVALENT"],
    wrapFlags: ["-Wl,--wrap=memcpy", "-Wl,--wrap=memmove", "-Wl,--wrap=memset", "-Wl,--export-dynamic", "-Wl,--wrap=__osInitialize_common"],
    excludedLibultraModules: [
      "createthread.c","startthread.c","stopthread.c","destroythread.c","yieldthread.c",
      "settreadpri.c","getthreadpri.c","createmesgqueue.c","seteventmesg.c","recvmesg.c",
      "sendmesg.c","jammesg.c","visetmode.c","visetevent.c","overlaymanager.c",
      "pimanager.c","ucode.c","memory.c","vimgr.c","transition.c","libgcc.c","get_stack_pointer.c"
    ],
    requiredRoles: [
      { role: "gradle_app", pattern: /(?:^|\/)android\/app\/build\.gradle(?:\.kts)?$/i, label: "App Gradle Build" },
      { role: "manifest", pattern: /(?:^|\/)android\/app\/src\/main\/AndroidManifest\.xml$/i, label: "AndroidManifest.xml" },
      { role: "cmake", pattern: /(?:^|\/)android\/app\/src\/main\/cpp\/CMakeLists\.txt$/i, label: "Native CMakeLists.txt" },
      { role: "jni_bridge", pattern: /(?:^|\/)cpp\/(?:ultra\/)?NativeBridge\.(?:cpp|c)$/i, label: "JNI NativeBridge C++" },
      { role: "gfx_interpreter", pattern: /(?:^|\/)cpp\/(?:emulator\/)?gfx_interpreter\.(?:cpp|h)$/i, label: "F3DEX Graphics Interpreter" },
      { role: "ptr_shim", pattern: /(?:^|\/)cpp\/(?:emulator\/)?ptr_shim\.(?:cpp|h)$/i, label: "64-bit Pointer Shim" },
      { role: "audio_bridge", pattern: /(?:^|\/)cpp\/(?:ultra\/)?audio_bridge\.(?:cpp|c)$/i, label: "Android Audio Bridge" },
      { role: "java_activity", pattern: /(?:^|\/)java\/.+\/(?:MainActivity|NativeGameActivity)\.(?:java|kt)$/i, label: "Android Entry Activity" },
      { role: "java_gl_renderer", pattern: /(?:^|\/)java\/.+\/GLRenderer\.(?:java|kt)$/i, label: "GLSurfaceView Renderer" },
      { role: "java_native_decl", pattern: /(?:^|\/)java\/.+\/(?:Native|NativeBridge)\.(?:java|kt)$/i, label: "Java JNI Native Declarations" }
    ],
    jniSignatures: [
      { className: "NativeBridge", method: "nativeInit", sig: "(Landroid/content/res/AssetManager;Ljava/lang/String;)V" },
      { className: "NativeBridge", method: "nativeSurfaceCreated", sig: "(Landroid/view/Surface;)V" },
      { className: "NativeBridge", method: "nativeSurfaceChanged", sig: "(II)V" },
      { className: "NativeBridge", method: "nativeDrawFrame", sig: "()V" },
      { className: "NativeBridge", method: "nativeSetInput", sig: "(III)V" }
    ],
    confidenceWeights: {
      cmake: 0.95,
      jni_bridge: 0.95,
      gfx_interpreter: 0.9,
      ptr_shim: 0.9,
      audio_bridge: 0.85
    }
  };

  function loadBlueprint() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_BLUEPRINT, ...parsed, requiredRoles: DEFAULT_BLUEPRINT.requiredRoles };
      }
    } catch (_) {}
    return { ...DEFAULT_BLUEPRINT };
  }

  function saveBlueprint(bp) {
    const serializable = { ...bp };
    delete serializable.requiredRoles;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch (_) {}
    if (window.coderBridge && window.coderBridge.connected) {
      fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blueprint: serializable })
      }).catch(() => {});
    }
  }

  // Escape JNI identifier components per Oracle JNI spec (_ -> _1)
  function jniEscape(ident) {
    return String(ident || "").replace(/_/g, "_1");
  }

  // Generate valid, collision-free Java package, JNI prefix, CMake library name, and C identifiers
  function derivePortIdentity(texts, romMeta) {
    let rawSeed = "";
    if (romMeta && romMeta.title) rawSeed = romMeta.title;
    else if (romMeta && romMeta.gameCode) rawSeed = romMeta.gameCode;
    else {
      const firstPath = Object.keys(texts)[0] || "";
      rawSeed = firstPath.split("/")[0] || "n64port";
    }

    // Detect if workspace already declares a package in AndroidManifest.xml or build.gradle
    for (const [p, src] of Object.entries(texts)) {
      if (typeof src !== "string") continue;
      if (/AndroidManifest\.xml$/i.test(p)) {
        const pm = src.match(/\bpackage\s*=\s*"([a-zA-Z0-9_.]+)"/);
        if (pm) {
          const pkg = pm[1];
          const segs = pkg.split(".");
          const leaf = segs[segs.length - 1].replace(/wrapper$/i, "") || "game";
          return {
            packageName: pkg,
            jniPackagePrefix: segs.map(jniEscape).join("_"),
            libName: segs[segs.length - 1],
            slug: leaf.toLowerCase(),
            existing: true
          };
        }
      }
      if (/app\/build\.gradle/i.test(p)) {
        const nm = src.match(/\b(?:namespace|applicationId)\s*[= ]\s*["']([a-zA-Z0-9_.]+)["']/);
        if (nm) {
          const pkg = nm[1];
          const segs = pkg.split(".");
          const leaf = segs[segs.length - 1].replace(/wrapper$/i, "") || "game";
          return {
            packageName: pkg,
            jniPackagePrefix: segs.map(jniEscape).join("_"),
            libName: segs[segs.length - 1],
            slug: leaf.toLowerCase(),
            existing: true
          };
        }
      }
    }

    // Sanitize new port slug: lowercase alphanumeric, cannot start with digit, cannot be Java keyword
    let slug = rawSeed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    if (!slug) slug = "n64game";
    if (/^[0-9]/.test(slug)) slug = "n64_" + slug;
    if (JAVA_RESERVED.has(slug)) slug = slug + "_port";
    // Compact multi-word titles (e.g. "super_mario_64" -> "supermario64") for clean package segment
    const compactSlug = slug.replace(/_/g, "") || "n64game";
    const pkgLeaf = `${compactSlug}wrapper`;
    const packageName = `com.${pkgLeaf}`;
    return {
      packageName,
      jniPackagePrefix: `com_${jniEscape(pkgLeaf)}`,
      libName: pkgLeaf,
      slug: compactSlug,
      existing: false
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

  window.learnAndroidBlueprint = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const paths = Object.keys(texts);
    if (paths.length === 0) {
      appendAgentMessage("<strong>No workspace loaded:</strong> Open your reference Android port workspace first so I can learn its layout.");
      return;
    }

    const bp = loadBlueprint();
    const identity = derivePortIdentity(texts, window.lastAnalyzedRom);
    bp.learnedFrom = `${identity.packageName} (${paths.length} files)`;
    bp.updatedAt = new Date().toISOString();

    // Learn CMakeLists.txt definitions, wrap flags, and excluded OS modules
    const cmakePath = paths.find(p => /(?:^|\/)android\/app\/src\/main\/cpp\/CMakeLists\.txt$/i.test(p));
    if (cmakePath && typeof texts[cmakePath] === "string") {
      const cm = texts[cmakePath];
      const defs = cm.match(/add_compile_definitions\(([^)]+)\)/g) || [];
      const learnedDefs = new Set();
      for (const d of defs) {
        const inner = d.replace(/^add_compile_definitions\(|\)$/g, "").trim().split(/\s+/);
        for (const tok of inner) if (tok) learnedDefs.add(tok);
      }
      if (learnedDefs.size > 0) bp.compileDefines = Array.from(learnedDefs);

      const wraps = cm.match(/-Wl,--wrap=[A-Za-z0-9_]+/g);
      if (wraps && wraps.length > 0) bp.wrapFlags = Array.from(new Set(wraps));

      const excl = cm.match(/set\(EXCLUDE_LIST([\s\S]*?)\)/);
      if (excl) {
        const files = excl[1].trim().split(/\s+/).filter(x => x.endsWith(".c"));
        if (files.length > 0) bp.excludedLibultraModules = files;
      }
      bp.confidenceWeights.cmake = Math.min(1.0, (bp.confidenceWeights.cmake || 0.9) + 0.04);
    }

    // Learn all Java JNI native declarations
    const nativeDecls = extractJavaNativeMethods(texts);
    if (nativeDecls.length > 0) {
      bp.jniSignatures = nativeDecls.map(d => ({
        className: d.className,
        method: d.methodName,
        returnType: d.returnType,
        params: d.params
      }));
    }

    // Learn subsystem modules present under Android/app/src/main/cpp
    const cppModules = paths.filter(p => /(?:^|\/)android\/app\/src\/main\/cpp\/.+\.(?:c|cpp|h|hpp)$/i.test(p))
      .map(p => p.replace(/^.*?android\/app\/src\/main\/cpp\//i, ""));
    bp.learnedCppModules = cppModules;

    saveBlueprint(bp);
    appendAgentMessage(
      `<strong>Android Port Blueprint Learned & Stored:</strong><br>` +
      `• <strong>Reference Identity:</strong> <code>${identity.packageName}</code> (JNI prefix <code>Java_${identity.jniPackagePrefix}_...</code>)<br>` +
      `• <strong>Compile Defines:</strong> <code>${bp.compileDefines.join(" ")}</code><br>` +
      `• <strong>Linker Wraps:</strong> <code>${bp.wrapFlags.join(" ")}</code><br>` +
      `• <strong>Excluded Libultra HLE Modules:</strong> ${bp.excludedLibultraModules.length} files<br>` +
      `• <strong>Learned JNI Native Methods:</strong> ${nativeDecls.length} methods across Java wrappers<br>` +
      `• <strong>Native Bridge Modules Indexed:</strong> ${cppModules.length} files under <code>cpp/</code>`
    );
  };

  window.validateAgainstBlueprint = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const paths = Object.keys(texts);
    if (paths.length === 0) {
      appendAgentMessage("<strong>No workspace loaded:</strong> Open a workspace first.");
      return;
    }

    const bp = loadBlueprint();
    const identity = derivePortIdentity(texts, window.lastAnalyzedRom);
    const missingRoles = [];
    for (const r of bp.requiredRoles) {
      if (!paths.some(p => r.pattern.test(p))) missingRoles.push(r);
    }

    // 1. Cross-check Java `native` methods against C/C++ `Java_...` definitions
    const nativeDecls = extractJavaNativeMethods(texts);
    const cppCorpus = Object.entries(texts)
      .filter(([p, v]) => typeof v === "string" && /\.(?:c|cc|cpp|cxx|h|hpp)$/i.test(p))
      .map(([, v]) => v)
      .join("\n");
    const missingJni = nativeDecls.filter(d => !cppCorpus.includes(d.expectedJniSymbol));

    // 2. Check CMakeLists.txt for unreferenced .c/.cpp files inside cpp/emulator or cpp/ultra
    const cmakePath = paths.find(p => /(?:^|\/)android\/app\/src\/main\/cpp\/CMakeLists\.txt$/i.test(p));
    const unregisteredCpp = [];
    if (cmakePath && typeof texts[cmakePath] === "string") {
      const cm = texts[cmakePath];
      for (const p of paths) {
        const m = p.match(/(?:^|\/)android\/app\/src\/main\/cpp\/((?:emulator|ultra|tools|menu)\/[A-Za-z0-9_]+\.(?:c|cpp))$/i);
        if (m && !cm.includes(m[1])) {
          unregisteredCpp.push({ fullPath: p, relCpp: m[1] });
        }
      }
    }

    // 3. Check FB_WIDTH / FB_HEIGHT alignment between gfx_interpreter.h and NativeBridge.cpp
    const gfxHPath = paths.find(p => /gfx_interpreter\.h$/i.test(p));
    const nbCppPath = paths.find(p => /NativeBridge\.cpp$/i.test(p));
    let fbMismatch = null;
    if (gfxHPath && nbCppPath && typeof texts[gfxHPath] === "string" && typeof texts[nbCppPath] === "string") {
      const fw = texts[gfxHPath].match(/#define\s+FB_WIDTH\s+(\d+)/);
      const fh = texts[gfxHPath].match(/#define\s+FB_HEIGHT\s+(\d+)/);
      const sw = texts[nbCppPath].match(/g_surfaceWidth\s*=\s*(\d+)/);
      const sh = texts[nbCppPath].match(/g_surfaceHeight\s*=\s*(\d+)/);
      if (fw && fh && sw && sh && (fw[1] !== sw[1] || fh[1] !== sh[1])) {
        fbMismatch = { gfxHPath, fbW: fw[1], fbH: fh[1], nbCppPath, surfW: sw[1], surfH: sh[1] };
      }
    }

    // Stage actionable findings in engine.auditFindings
    let addedCount = 0;
    if (typeof engine !== "undefined" && Array.isArray(engine.auditFindings)) {
      for (const mj of missingJni) {
        const stubSig = `extern "C" JNIEXPORT void JNICALL ${mj.expectedJniSymbol}(JNIEnv* env, jclass clazz) { /* TODO: wire ${mj.methodName} */ }`;
        engine.auditFindings.push({
          severity: "HIGH",
          category: "Blueprint Completeness: Missing JNI C++ Implementation",
          filePath: nbCppPath || mj.filePath,
          line: nbCppPath ? texts[nbCppPath].split("\n").length : mj.line,
          code: `${mj.returnType} ${mj.methodName}(${mj.params});`,
          reason: `Java class '${mj.className}' declares native method '${mj.methodName}' (${mj.filePath}:${mj.line}), but symbol '${mj.expectedJniSymbol}' is missing from native C/C++ sources.`,
          replaceLine: false,
          fixSuggestion: stubSig,
          verificationStatus: "PATTERN_MATCHED",
          verificationNotes: [],
          port17: true
        });
        addedCount++;
      }

      if (fbMismatch) {
        const nbLines = texts[fbMismatch.nbCppPath].split("\n");
        const wLineIdx = nbLines.findIndex(l => /g_surfaceWidth\s*=/.test(l));
        if (wLineIdx !== -1) {
          engine.auditFindings.push({
            severity: "MEDIUM",
            category: "Blueprint Alignment: Framebuffer vs Surface Dimension Drift",
            filePath: fbMismatch.nbCppPath,
            line: wLineIdx + 1,
            code: nbLines[wLineIdx].trim(),
            reason: `gfx_interpreter.h defines FB_WIDTH=${fbMismatch.fbW}x${fbMismatch.fbH}, while NativeBridge.cpp initializes g_surfaceWidth=${fbMismatch.surfW}x${fbMismatch.surfH}. Aligning default dimensions prevents initial viewport aspect distortion.`,
            replaceLine: true,
            fixSuggestion: nbLines[wLineIdx].trim().replace(/\d+/, fbMismatch.fbW),
            verificationStatus: "PATTERN_MATCHED",
            verificationNotes: [],
            port17: true
          });
          addedCount++;
        }
      }
    }

    let html = `<strong>Blueprint Completeness & Alignment Report (<code>${identity.packageName}</code>):</strong><br>` +
      `• <strong>Structural Roles Present:</strong> ${bp.requiredRoles.length - missingRoles.length}/${bp.requiredRoles.length}` +
      (missingRoles.length ? ` (Missing: <code>${missingRoles.map(r => r.label).join(", ")}</code>)` : " (Complete)") + `<br>` +
      `• <strong>JNI Java &lt;-&gt; C++ Linkage:</strong> ${nativeDecls.length - missingJni.length}/${nativeDecls.length} native methods resolved` +
      (missingJni.length ? ` — <strong>${missingJni.length} missing C++ symbol(s)</strong>` : "") + `<br>` +
      `• <strong>CMake Bridge Registration:</strong> ${unregisteredCpp.length === 0 ? "All bridge sources registered" : `${unregisteredCpp.length} file(s) not listed in CMakeLists.txt: <code>${unregisteredCpp.map(x => x.relCpp).join(", ")}</code>`}<br>`;

    if (fbMismatch) {
      html += `• <strong>Graphics Dimension Drift:</strong> <code>FB_WIDTH=${fbMismatch.fbW}x${fbMismatch.fbH}</code> vs <code>g_surfaceWidth=${fbMismatch.surfW}x${fbMismatch.surfH}</code><br>`;
    }
    if (addedCount > 0) {
      html += `• <strong>Staged Fixes:</strong> Added <code>${addedCount}</code> completion/alignment patch(es) to the Findings list.`;
      if (typeof renderFindingsList === "function") renderFindingsList();
    }
    appendAgentMessage(html);
  };

  window.replicateAndroidLayout = function () {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    const bp = loadBlueprint();
    const id = derivePortIdentity(texts, window.lastAnalyzedRom);
    const pkgPath = id.packageName.replace(/\./g, "/");
    const titleLabel = (window.lastAnalyzedRom && window.lastAnalyzedRom.title)
      ? window.lastAnalyzedRom.title
      : id.slug.toUpperCase();

    // Detect N64 entry point symbol in target C source if available
    let entrySymbol = "bootproc";
    for (const [p, src] of Object.entries(texts)) {
      if (typeof src !== "string" || !/\.c$/i.test(p)) continue;
      const em = src.match(/\bvoid\s+(bootproc|mainproc|game_init|thread1_idle)\s*\(/);
      if (em) { entrySymbol = em[1]; break; }
    }

    const generatedFiles = {
      "Android/settings.gradle": `rootProject.name = "${id.libName}"\ninclude ':app'\n`,
      "Android/build.gradle": `buildscript {\n    repositories {\n        google()\n        mavenCentral()\n    }\n    dependencies {\n        classpath 'com.android.tools.build:gradle:8.2.2'\n    }\n}\nallprojects {\n    repositories {\n        google()\n        mavenCentral()\n    }\n}\n`,
      "Android/app/build.gradle": `plugins {\n    id 'com.android.application'\n}\nandroid {\n    namespace '${id.packageName}'\n    compileSdk 34\n    defaultConfig {\n        applicationId "${id.packageName}"\n        minSdk 26\n        targetSdk 34\n        versionCode 1\n        versionName "1.0"\n        ndk {\n            abiFilters 'arm64-v8a'\n        }\n        externalNativeBuild {\n            cmake {\n                cppFlags "-std=c++17 -O2"\n            }\n        }\n    }\n    externalNativeBuild {\n        cmake {\n            path "src/main/cpp/CMakeLists.txt"\n            version "3.22.1"\n        }\n    }\n}\n`,
      "Android/app/src/main/AndroidManifest.xml": `<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n    <uses-feature android:glEsVersion="0x00020000" android:required="true" />\n    <application android:label="${titleLabel}" android:hasFragileUserData="true">\n        <activity android:name=".MainActivity" android:screenOrientation="landscape" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n        </activity>\n    </application>\n</manifest>\n`,
      [`Android/app/src/main/java/${pkgPath}/NativeBridge.java`]: `package ${id.packageName};\n\nimport android.content.res.AssetManager;\nimport android.view.Surface;\n\npublic final class NativeBridge {\n    static {\n        System.loadLibrary("${id.libName}");\n    }\n    public static native void nativeInit(AssetManager mgr, String baseDir);\n    public static native void nativeSurfaceCreated(Surface surface);\n    public static native void nativeSurfaceChanged(int width, int height);\n    public static native void nativeDrawFrame();\n    public static native void nativeSetInput(int buttons, int stickX, int stickY);\n}\n`,
      [`Android/app/src/main/java/${pkgPath}/MainActivity.java`]: `package ${id.packageName};\n\nimport android.app.Activity;\nimport android.opengl.GLSurfaceView;\nimport android.os.Bundle;\nimport javax.microedition.khronos.egl.EGLConfig;\nimport javax.microedition.khronos.opengles.GL10;\n\npublic class MainActivity extends Activity {\n    private GLSurfaceView glView;\n\n    @Override\n    protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);\n        NativeBridge.nativeInit(getAssets(), getFilesDir().getAbsolutePath());\n        glView = new GLSurfaceView(this);\n        glView.setEGLContextClientVersion(2);\n        glView.setRenderer(new GLSurfaceView.Renderer() {\n            @Override public void onSurfaceCreated(GL10 gl, EGLConfig config) {\n                NativeBridge.nativeSurfaceCreated(glView.getHolder().getSurface());\n            }\n            @Override public void onSurfaceChanged(GL10 gl, int w, int h) {\n                NativeBridge.nativeSurfaceChanged(w, h);\n            }\n            @Override public void onDrawFrame(GL10 gl) {\n                NativeBridge.nativeDrawFrame();\n            }\n        });\n        setContentView(glView);\n    }\n}\n`,
      "Android/app/src/main/cpp/CMakeLists.txt": `cmake_minimum_required(VERSION 3.22.1)\nproject(${id.libName})\n\nset(CMAKE_CXX_STANDARD 17)\nset(CMAKE_CXX_STANDARD_REQUIRED ON)\nadd_compile_definitions(${bp.compileDefines.join(" ")})\n\nset(REPO_ROOT \${CMAKE_CURRENT_SOURCE_DIR}/../../../../..)\nfile(GLOB_RECURSE ALL_GAME_FILES "\${REPO_ROOT}/src/*.c")\nset(EXCLUDE_LIST ${bp.excludedLibultraModules.join(" ")})\nset(GAME_SOURCES "")\nforeach(F \${ALL_GAME_FILES})\n    get_filename_component(N \${F} NAME)\n    if(NOT N IN_LIST EXCLUDE_LIST)\n        list(APPEND GAME_SOURCES \${F})\n    endif()\nendforeach()\n\nadd_library(${id.libName} SHARED\n    ultra/NativeBridge.cpp\n    ${id.slug}_stubs.c\n    \${GAME_SOURCES}\n)\n\ntarget_include_directories(${id.libName} PRIVATE\n    \${CMAKE_CURRENT_SOURCE_DIR}\n    \${CMAKE_CURRENT_SOURCE_DIR}/ultra\n    \${REPO_ROOT}/include\n    \${REPO_ROOT}/src\n)\n\ntarget_link_options(${id.libName} PRIVATE ${bp.wrapFlags.join(" ")})\ntarget_link_libraries(${id.libName} android log EGL GLESv2)\n`,
      [`Android/app/src/main/cpp/${id.slug}_stubs.c`]: `#include <stdint.h>\n#include <stddef.h>\n\n/* Auto-generated N64 OS / hardware HLE stubs for ${id.packageName} */\nvoid __osInitialize_common(void) {}\n`,
      "Android/app/src/main/cpp/ultra/NativeBridge.cpp": `#include <jni.h>\n#include <stdint.h>\n#include <android/log.h>\n#include <android/asset_manager_jni.h>\n#include <android/native_window_jni.h>\n#include <GLES2/gl2.h>\n\n#define LOG_TAG "${id.libName}"\n#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)\n\nextern "C" void ${entrySymbol}(void* arg);\nstatic AAssetManager* g_assetManager = nullptr;\nstatic ANativeWindow* g_window = nullptr;\nstatic int g_surfaceWidth = 320;\nstatic int g_surfaceHeight = 240;\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeInit(JNIEnv* env, jclass, jobject assetMgr, jstring) {\n    g_assetManager = AAssetManager_fromJava(env, assetMgr);\n    LOGI("Initialized ${id.packageName} (entry=${entrySymbol})");\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSurfaceCreated(JNIEnv* env, jclass, jobject surface) {\n    if (g_window) ANativeWindow_release(g_window);\n    g_window = surface ? ANativeWindow_fromSurface(env, surface) : nullptr;\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSurfaceChanged(JNIEnv*, jclass, jint w, jint h) {\n    g_surfaceWidth = w;\n    g_surfaceHeight = h;\n    glViewport(0, 0, w, h);\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeDrawFrame(JNIEnv*, jclass) {\n    glClearColor(0.05f, 0.07f, 0.11f, 1.0f);\n    glClear(GL_COLOR_BUFFER_BIT);\n}\n\nextern "C" JNIEXPORT void JNICALL\nJava_${id.jniPackagePrefix}_NativeBridge_nativeSetInput(JNIEnv*, jclass, jint, jint, jint) {}\n`
    };

    // Inject generated files into workspace memory & sync to disk if Termux bridge is connected
    for (const [relPath, content] of Object.entries(generatedFiles)) {
      if (typeof patchedContents !== "undefined") patchedContents[relPath] = content;
      if (typeof cachedFileTexts !== "undefined") cachedFileTexts[relPath] = content;
      if (typeof window.syncPatchedFileToDisk === "function") {
        window.syncPatchedFileToDisk(relPath, content);
      }
    }
    if (typeof renderFileTree === "function") renderFileTree();

    // Build instant .tar download using POSIX UStar layout so GitHub Pages users get the whole Android/ folder in 1 click
    const enc = new TextEncoder();
    const blocks = [];
    for (const [name, text] of Object.entries(generatedFiles)) {
      const data = enc.encode(text);
      const header = new Uint8Array(512);
      header.set(enc.encode(name.slice(0, 99)), 0);
      header.set(enc.encode("0000644\x00"), 100);
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
    a.download = `${id.libName}_android_scaffold.tar`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    appendAgentMessage(
      `<strong>Replicated Android Port Layout Generated (<code>${id.packageName}</code>):</strong><br>` +
      `• <strong>Canonical Identifiers:</strong> Package <code>${id.packageName}</code> | Native Lib <code>lib${id.libName}.so</code> | JNI Prefix <code>Java_${id.jniPackagePrefix}_...</code> | C Entry <code>${entrySymbol}()</code><br>` +
      `• <strong>Generated Tree (${Object.keys(generatedFiles).length} files):</strong> <code>Android/settings.gradle</code>, <code>Android/build.gradle</code>, <code>Android/app/build.gradle</code>, <code>AndroidManifest.xml</code>, <code>CMakeLists.txt</code>, <code>NativeBridge.cpp</code>, <code>${id.slug}_stubs.c</code>, <code>MainActivity.java</code>, <code>NativeBridge.java</code><br>` +
      `• <strong>Exported:</strong> Downloaded <code>${a.download}</code>${(window.coderBridge && window.coderBridge.connected) ? " and synced directly to your Termux repo." : "."}`
    );
  };
})();
