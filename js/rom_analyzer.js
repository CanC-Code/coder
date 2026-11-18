/* js/rom_analyzer.js v26 - Universal N64 ROM & Asset Extractor / Cross-Referencer (100% Client-Side + Bridge) */
(function () {
  "use strict";

  const CIC_SIGNATURES = {
    "617025797": "CIC-NUS-6101 (Star Fox 64 NTSC)",
    "90f053bd":  "CIC-NUS-6102 / 7101 (Standard NTSC/PAL - Mario 64, DKR, etc.)",
    "48500368":  "CIC-NUS-6103 / 7103 (Banjo-Kazooie, Paper Mario)",
    "9e919200":  "CIC-NUS-6105 / 7105 (Zelda OoT / MM - 0x80000400+ challenges)",
    "587bd543":  "CIC-NUS-6106 / 7106 (F-Zero X, Yoshi's Story)"
  };

  const REGION_MAP = {
    E: "NTSC-U (North America)",
    P: "PAL (Europe)",
    J: "NTSC-J (Japan)",
    D: "PAL (Germany)",
    F: "PAL (France)",
    I: "PAL (Italy)",
    S: "PAL (Spain)",
    U: "PAL (Australia)",
    C: "iQue Player (China)"
  };

  // Built-in DKR table fallback when no *_extract.json is mounted in workspace
  const BUILTIN_ROM_PROFILES = [
    { name: "DKR USA 1.0 (v77)", sha1: "0cb115d8716dbbc2922fda38e533b9fe63bb9670", assets: 969568, assets_end: 11310640, version: "us_1.0" },
    { name: "DKR USA 1.1 (v80)", sha1: "6d96743d46f8c0cd0edb0ec5600b003c89b93755", assets: 970976, assets_end: 12111824, version: "us_1.1" },
    { name: "DKR PAL 1.0 (v77)", sha1: "dd5d64dd140cb7aa28404fa35abdcaba33c29260", assets: 969712, assets_end: 11310784, version: "eu_1.0" },
    { name: "DKR PAL 1.1 (v80)", sha1: "b7f628073237b3d211d40406aa0884ff8fdd70d5", assets: 971120, assets_end: 12111968, version: "eu_1.1" },
    { name: "DKR JAPAN (v79)",   sha1: "23ba3d302025153d111416e751027cef11213a19", assets: 976336, assets_end: 12117216, version: "jp" }
  ];

  function normalizeToBigEndian(rawBuffer) {
    const src = new Uint8Array(rawBuffer);
    if (src.length < 64) throw new Error("File is smaller than 64-byte N64 ROM header.");
    const magic = ((src[0] << 24) | (src[1] << 16) | (src[2] << 8) | src[3]) >>> 0;
    const out = new Uint8Array(src.length);

    if (magic === 0x80371240) {
      out.set(src);
      return { bytes: out, format: ".z64 (Big-Endian Native)" };
    }
    if (magic === 0x37804012) {
      // .v64 byte-swapped pairs
      for (let i = 0; i + 1 < src.length; i += 2) {
        out[i] = src[i + 1];
        out[i + 1] = src[i];
      }
      return { bytes: out, format: ".v64 (Byte-Swapped -> Normalized to Big-Endian)" };
    }
    if (magic === 0x40123780) {
      // .n64 little-endian 32-bit words
      for (let i = 0; i + 3 < src.length; i += 4) {
        out[i] = src[i + 3];
        out[i + 1] = src[i + 2];
        out[i + 2] = src[i + 1];
        out[i + 3] = src[i];
      }
      return { bytes: out, format: ".n64 (Little-Endian -> Normalized to Big-Endian)" };
    }
    throw new Error(`Unrecognized N64 ROM PI magic: 0x${magic.toString(16).toUpperCase().padStart(8, "0")}`);
  }

  function crc32Range(bytes, start, end) {
    let crc = 0xFFFFFFFF;
    const limit = Math.min(bytes.length, end);
    for (let i = start; i < limit; i++) {
      crc ^= bytes[i];
      for (let k = 0; k < 8; k++) {
        crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
      }
    }
    return ((crc ^ 0xFFFFFFFF) >>> 0).toString(16).padStart(8, "0");
  }

  async function sha1Hex(bytes) {
    if (window.crypto && window.crypto.subtle) {
      const digest = await window.crypto.subtle.digest("SHA-1", bytes);
      return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    }
    return "unavailable-insecure-context";
  }

  function scanGenericN64Structures(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const compressedBlocks = [];
    let f3dexEndDlCount = 0;
    let audioBankCount = 0;

    // Scan on 4-byte aligned boundaries for Yaz0, MIO0, Yay0, gzip, and F3DEX G_ENDDL
    for (let off = 0x1000; off + 16 < bytes.length; off += 4) {
      const w0 = view.getUint32(off, false);
      if (w0 === 0x59617A30 || w0 === 0x4D494F30 || w0 === 0x59617930) {
        const tag = String.fromCharCode((w0 >>> 24) & 0xFF, (w0 >>> 16) & 0xFF, (w0 >>> 8) & 0xFF, w0 & 0xFF);
        const uncompSize = view.getUint32(off + 4, false);
        if (uncompSize > 0 && uncompSize < 32 * 1024 * 1024 && compressedBlocks.length < 2000) {
          compressedBlocks.push({ tag, offset: off, uncompressedSize: uncompSize });
        }
      } else if ((w0 >>> 16) === 0x1F8B && bytes[off + 2] === 0x08) {
        if (compressedBlocks.length < 2000) {
          compressedBlocks.push({ tag: "GZIP", offset: off, uncompressedSize: null });
        }
      } else if (w0 === 0xDF000000 && view.getUint32(off + 4, false) === 0x00000000) {
        f3dexEndDlCount++;
      } else if ((w0 >>> 16) === 0x4231) {
        // 'B1' ALBankFile magic
        const bankCount = view.getUint16(off + 2, false);
        if (bankCount > 0 && bankCount < 64) audioBankCount++;
      }
    }

    return { compressedBlocks, f3dexEndDlCount, audioBankCount };
  }

  function findWorkspaceRomManifest(sha1, gameCode) {
    const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};
    let matchedProfile = null;
    let manifestFile = null;
    let manifestFileEntries = [];
    let splatSegments = [];

    for (const [path, content] of Object.entries(texts)) {
      if (typeof content !== "string") continue;

      // 1. Check JSON extraction manifests (e.g. dkr_assets_tool_extract.json or similar)
      if (path.endsWith(".json") && content.includes("inputs-supported")) {
        try {
          const parsed = JSON.parse(content);
          const inputs = parsed["inputs-supported"] || [];
          const hit = inputs.find(x => (x.sha1 || "").toLowerCase() === sha1.toLowerCase());
          if (hit) {
            matchedProfile = hit;
            manifestFile = path;
            manifestFileEntries = Array.isArray(parsed.files) ? parsed.files : [];
          }
        } catch (_) {}
      }

      // 2. Check splat / YAML ROM segment maps
      if (/splat.*\.ya?ml$/i.test(path) || (/\.ya?ml$/i.test(path) && content.includes("segments:"))) {
        const segRe = /-\s*\[\s*(0x[0-9a-fA-F]+)\s*,\s*([a-zA-Z0-9_-]+)(?:\s*,\s*([^\]]+))?\]/g;
        let m;
        while ((m = segRe.exec(content)) !== null && splatSegments.length < 40) {
          splatSegments.push({ offset: Number(m[1]), kind: m[2], name: (m[3] || "").trim(), source: path });
        }
      }
    }

    if (!matchedProfile && gameCode.startsWith("NDK")) {
      const builtin = BUILTIN_ROM_PROFILES.find(p => p.sha1 === sha1.toLowerCase());
      if (builtin) {
        matchedProfile = builtin;
        manifestFile = "builtin-dkr-spec";
      }
    }

    return { matchedProfile, manifestFile, manifestFileEntries, splatSegments };
  }

  function inspectAssetLookupTable(bytes, assetsStart, assetsEnd) {
    if (!assetsStart || assetsStart + 16 >= bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // DKR / standard N64 asset section table: count (u32) followed by relative offsets (u32[])
    const count = view.getUint32(assetsStart, false);
    if (count === 0 || count > 256) return null;
    const sections = [];
    for (let i = 0; i < count && (assetsStart + 4 + (i + 1) * 4) <= bytes.length; i++) {
      const relStart = view.getUint32(assetsStart + 4 + i * 4, false);
      const relEnd = view.getUint32(assetsStart + 4 + (i + 1) * 4, false);
      if (relEnd >= relStart && (assetsStart + relEnd) <= (assetsEnd || bytes.length)) {
        sections.push({ index: i, romOffset: assetsStart + relStart, size: relEnd - relStart });
      }
    }
    return sections.length > 0 ? { tableOffset: assetsStart, sectionCount: count, sections } : null;
  }

  function decompressYaz0(bytes, offset) {
    if (offset + 16 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(offset, false) !== 0x59617A30) return null;
    const uncompSize = view.getUint32(offset + 4, false);
    if (uncompSize === 0 || uncompSize > 16 * 1024 * 1024) return null;
    const dst = new Uint8Array(uncompSize);
    let srcPos = offset + 16;
    let dstPos = 0;
    let validBits = 0;
    let codeByte = 0;

    while (dstPos < uncompSize && srcPos < bytes.length) {
      if (validBits === 0) {
        codeByte = bytes[srcPos++];
        validBits = 8;
      }
      if ((codeByte & 0x80) !== 0) {
        dst[dstPos++] = bytes[srcPos++];
      } else {
        if (srcPos + 1 >= bytes.length) break;
        const b1 = bytes[srcPos++];
        const b2 = bytes[srcPos++];
        const dist = (((b1 & 0x0F) << 8) | b2) + 1;
        let copyLen = (b1 >>> 4) + 2;
        if (copyLen === 2) {
          if (srcPos >= bytes.length) break;
          copyLen = bytes[srcPos++] + 0x12;
        }
        let copySrc = dstPos - dist;
        if (copySrc < 0) break;
        for (let i = 0; i < copyLen && dstPos < uncompSize; i++) {
          dst[dstPos++] = dst[copySrc++];
        }
      }
      codeByte <<= 1;
      validBits--;
    }
    return dst.subarray(0, dstPos);
  }

  function buildTarArchive(entries) {
    // Standard 512-byte POSIX UStar TAR builder (zero dependencies, works offline on GitHub Pages)
    const enc = new TextEncoder();
    const blocks = [];
    for (const entry of entries) {
      const data = entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
      const header = new Uint8Array(512);
      const nameBytes = enc.encode(entry.name.slice(0, 99));
      header.set(nameBytes, 0);
      header.set(enc.encode("0000644\0"), 100);
      header.set(enc.encode("0000000\0"), 108);
      header.set(enc.encode("0000000\0"), 116);
      header.set(enc.encode(data.length.toString(8).padStart(11, "0") + "\0"), 124);
      header.set(enc.encode(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0"), 136);
      header.fill(0x20, 148, 156);
      header[156] = 0x30; // '0' regular file
      header.set(enc.encode("ustar\x0000"), 257);

      let chksum = 0;
      for (let i = 0; i < 512; i++) chksum += header[i];
      header.set(enc.encode(chksum.toString(8).padStart(6, "0") + "\0 "), 148);

      blocks.push(header);
      blocks.push(data);
      const pad = (512 - (data.length % 512)) % 512;
      if (pad > 0) blocks.push(new Uint8Array(pad));
    }
    blocks.push(new Uint8Array(1024)); // End-of-archive zero blocks
    const totalLen = blocks.reduce((acc, b) => acc + b.length, 0);
    const out = new Uint8Array(totalLen);
    let pos = 0;
    for (const b of blocks) {
      out.set(b, pos);
      pos += b.length;
    }
    return out;
  }

  window.downloadExtractedRomBundle = function () {
    const rom = window.lastAnalyzedRom;
    if (!rom || !rom._normalizedBytes) {
      appendAgentMessage("<strong>No ROM loaded:</strong> Load an N64 ROM first.");
      return;
    }
    const bytes = rom._normalizedBytes;
    const entries = [];
    const manifest = {
      title: rom.title,
      gameCode: rom.gameCode,
      sha1: rom.sha1,
      crc1: rom.crc1,
      crc2: rom.crc2,
      cicChip: rom.cicChip,
      extractedFiles: []
    };

    if (rom.assetTable && rom.assetTable.sections.length > 0) {
      for (const sec of rom.assetTable.sections) {
        if (sec.size <= 0 || (sec.romOffset + sec.size) > bytes.length) continue;
        const slice = bytes.subarray(sec.romOffset, sec.romOffset + sec.size);
        const yaz0 = decompressYaz0(bytes, sec.romOffset);
        const fname = `assets/section_${String(sec.index).padStart(3, "0")}_0x${sec.romOffset.toString(16)}.bin`;
        const payload = yaz0 || slice;
        entries.push({ name: fname, data: payload });
        manifest.extractedFiles.push({
          file: fname,
          romOffset: sec.romOffset,
          rawSize: sec.size,
          extractedSize: payload.length,
          decompressedYaz0: Boolean(yaz0)
        });
      }
    } else if (rom.structures && rom.structures.compressedBlocks.length > 0) {
      for (let i = 0; i < rom.structures.compressedBlocks.length; i++) {
        const blk = rom.structures.compressedBlocks[i];
        const nextOff = (i + 1 < rom.structures.compressedBlocks.length)
          ? rom.structures.compressedBlocks[i + 1].offset
          : Math.min(bytes.length, blk.offset + 256 * 1024);
        const yaz0 = blk.tag === "Yaz0" ? decompressYaz0(bytes, blk.offset) : null;
        const rawSlice = bytes.subarray(blk.offset, Math.max(blk.offset + 16, nextOff));
        const payload = yaz0 || rawSlice;
        const fname = `blocks/${blk.tag.toLowerCase()}_${String(i).padStart(4, "0")}_0x${blk.offset.toString(16)}.bin`;
        entries.push({ name: fname, data: payload });
        manifest.extractedFiles.push({
          file: fname,
          tag: blk.tag,
          romOffset: blk.offset,
          extractedSize: payload.length,
          decompressedYaz0: Boolean(yaz0)
        });
      }
    } else {
      // Fallback: export normalized big-endian .z64 image + header manifest
      entries.push({ name: `${rom.gameCode || "rom"}_normalized.z64`, data: bytes });
      manifest.extractedFiles.push({ file: `${rom.gameCode || "rom"}_normalized.z64`, extractedSize: bytes.length });
    }

    entries.unshift({ name: "manifest.json", data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });
    const tarBytes = buildTarArchive(entries);
    const blob = new Blob([tarBytes], { type: "application/x-tar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(rom.gameCode || "n64_rom").toLowerCase()}_extracted_assets.tar`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    appendAgentMessage(`<strong>Browser Extraction Complete:</strong> Downloaded <code>${a.download}</code> (${entries.length - 1} extracted binary asset(s) + <code>manifest.json</code>).`);
  };

  window.handleRomSelect = async function (event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    appendAgentMessage(`Inspecting N64 ROM <code>${file.name}</code> (${(file.size / (1024 * 1024)).toFixed(2)} MiB)...`);

    try {
      const buf = await file.arrayBuffer();
      const { bytes, format } = normalizeToBigEndian(buf);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const dec = new TextDecoder("ascii");

      const clockRate = view.getUint32(0x04, false);
      const entryPoint = view.getUint32(0x08, false);
      const sdkVerRaw = view.getUint32(0x0C, false);
      const sdkRev = String.fromCharCode(sdkVerRaw & 0xFF);
      const sdkMajor = (sdkVerRaw >>> 8) & 0xFF;
      const crc1 = view.getUint32(0x10, false).toString(16).toUpperCase().padStart(8, "0");
      const crc2 = view.getUint32(0x14, false).toString(16).toUpperCase().padStart(8, "0");
      const title = dec.decode(bytes.subarray(0x20, 0x34)).replace(/\0/g, "").trim();
      const mediaFormat = String.fromCharCode(bytes[0x3B]);
      const gameId = dec.decode(bytes.subarray(0x3C, 0x3E));
      const regionChar = String.fromCharCode(bytes[0x3E]);
      const gameCode = `${mediaFormat}${gameId}${regionChar}`;
      const romVersion = bytes[0x3F];

      const bootCrc = crc32Range(bytes, 0x40, 0x1000);
      const cicChip = CIC_SIGNATURES[bootCrc] || `Unknown CIC (IPL3 CRC32=0x${bootCrc})`;
      const sha1 = await sha1Hex(bytes);

      const { matchedProfile, manifestFile, manifestFileEntries, splatSegments } = findWorkspaceRomManifest(sha1, gameCode);
      const structures = scanGenericN64Structures(bytes);
      const assetTable = matchedProfile
        ? inspectAssetLookupTable(bytes, matchedProfile.assets, matchedProfile.assets_end)
        : null;

      window.lastAnalyzedRom = {
        fileName: file.name,
        size: bytes.length,
        format,
        title,
        gameCode,
        region: REGION_MAP[regionChar] || `Region '${regionChar}'`,
        romVersion,
        entryPoint: `0x${entryPoint.toString(16).toUpperCase().padStart(8, "0")}`,
        sdkVersion: `Libultra ${(sdkMajor / 10).toFixed(1)}${sdkRev}`,
        crc1,
        crc2,
        cicChip,
        sha1,
        _normalizedBytes: bytes,
        matchedProfile,
        assetTable,
        structures
      };

      // Cross-reference ROM findings against mounted C/C++ source code
      let crossRefNotes = [];
      let stagedDiff = null;
      const texts = typeof cachedFileTexts !== "undefined" ? cachedFileTexts : {};

      // Check for anti-tamper / CRC checks that fail on native aarch64 ports
      const crcFinding = (typeof engine !== "undefined" && engine.auditFindings)
        ? engine.auditFindings.find(f => /anti-tamper|piracy|crc/i.test(f.reason || f.code || ""))
        : null;
      if (crcFinding) {
        crossRefNotes.push(`ROM Header <code>CRC1=0x${crc1}</code> / <code>CRC2=0x${crc2}</code> is verified at runtime by <code>${crcFinding.filePath}:${crcFinding.line}</code> — native aarch64 builds must bypass this check.`);
      }

      // Check asset_loading.c / PI DMA offsets against ROM asset table
      const assetLoaderPath = Object.keys(texts).find(p => /asset_loading\.c|rom_.*load.*\.c|pi_dma.*\.c/i.test(p));
      if (assetLoaderPath && assetTable) {
        crossRefNotes.push(`Asset table at <code>0x${assetTable.tableOffset.toString(16).toUpperCase()}</code> (${assetTable.sectionCount} asset sections) maps directly to <code>${assetLoaderPath}</code>.`);
      }

      // Summary of compressed formats discovered across the ROM
      const tagCounts = {};
      for (const b of structures.compressedBlocks) tagCounts[b.tag] = (tagCounts[b.tag] || 0) + 1;
      const compSummary = Object.entries(tagCounts).map(([k, v]) => `${k}: ${v}`).join(", ") || "None detected (raw/custom LZ)";

      let html = `<strong>Universal N64 ROM & Asset Analysis — <code>${file.name}</code>:</strong><br>` +
        `• <strong>Identity:</strong> <code>${title || "UNTITLED"}</code> (<code>${gameCode}</code> v1.${romVersion} — ${REGION_MAP[regionChar] || regionChar})<br>` +
        `• <strong>Container & Boot:</strong> ${format} | Entry <code>0x${entryPoint.toString(16).toUpperCase()}</code> | <code>${cicChip}</code> | <code>Libultra ${(sdkMajor / 10).toFixed(1)}${sdkRev}</code><br>` +
        `• <strong>Checksums:</strong> <code>CRC1=0x${crc1}</code>, <code>CRC2=0x${crc2}</code> | <code>SHA-1=${sha1.slice(0, 16)}...</code><br>` +
        `• <strong>Generic Binary Structures:</strong> Compressed blocks (<code>${compSummary}</code>) | F3DEX <code>G_ENDDL</code> streams: <code>${structures.f3dexEndDlCount}</code> | Audio banks: <code>${structures.audioBankCount}</code><br>`;

      if (matchedProfile) {
        html += `• <strong>Matched Repo Spec (${manifestFile}):</strong> <code>${matchedProfile.name}</code>` +
          (matchedProfile.assets ? ` — Assets <code>0x${matchedProfile.assets.toString(16).toUpperCase()}</code>..<code>0x${(matchedProfile.assets_end || bytes.length).toString(16).toUpperCase()}</code>` : "") +
          (manifestFileEntries.length ? ` (${manifestFileEntries.length} named asset entries)` : "") + `<br>`;
      }
      if (assetTable) {
        const preview = assetTable.sections.slice(0, 5).map(s => `#${s.index}@0x${s.romOffset.toString(16)}(${(s.size / 1024).toFixed(1)}KB)`).join(", ");
        html += `• <strong>Parsed Asset Section Table:</strong> ${assetTable.sectionCount} sections (${preview}${assetTable.sections.length > 5 ? ", ..." : ""})<br>`;
      }
      if (splatSegments.length > 0) {
        html += `• <strong>Splat YAML Segments:</strong> ${splatSegments.length} segments parsed from <code>${splatSegments[0].source}</code><br>`;
      }
      if (crossRefNotes.length > 0) {
        html += `• <strong>Source-to-ROM Cross-References:</strong><br>` + crossRefNotes.map(n => `&nbsp;&nbsp;- ${n}`).join("<br>") + `<br>`;
      }

      html += `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">` +
        `<button type="button" onclick="downloadExtractedRomBundle()" style="background:#1f6feb;border:none;color:white;padding:5px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">Download Extracted Assets (.tar)</button>` +
        ((window.coderBridge && window.coderBridge.connected)
          ? `<button type="button" onclick="triggerBridgeRomExtract('${matchedProfile && (matchedProfile.version || matchedProfile.dkr_version) ? (matchedProfile.version || matchedProfile.dkr_version) : ""}')" style="background:#238636;border:none;color:white;padding:5px 10px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;">Extract Assets via Termux Bridge</button>`
          : "") +
        `</div>`;

      appendAgentMessage(html);
      if (stagedDiff && typeof renderSynthesizedDiff === "function") {
        renderSynthesizedDiff(stagedDiff);
      }
    } catch (err) {
      appendAgentMessage(`<strong>ROM Analysis Error:</strong> ${err.message}`);
    } finally {
      event.target.value = "";
    }
  };

  window.triggerBridgeRomExtract = async function (versionHint) {
    if (!window.coderBridge || !window.coderBridge.connected) return;
    const repo = localStorage.getItem("coder_target_repo") || window.coderBridge.defaultRepo;
    if (!repo) return;
    appendAgentMessage(`Running repo asset extractor in <code>${repo}</code>...`);
    try {
      const resp = await fetch("/api/extract_rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo, version: versionHint })
      });
      const data = await resp.json();
      if (!data.ok) {
        appendAgentMessage(`<strong>Extractor Error:</strong> ${data.error}`);
        return;
      }
      appendAgentMessage(`<strong>Asset Extraction Complete:</strong><br><pre style="white-space:pre-wrap;font-size:11px;max-height:180px;overflow:auto;">${(data.output || "Done.").replace(/</g, "&lt;")}</pre>`);
    } catch (e) {
      appendAgentMessage(`<strong>Extractor Request Failed:</strong> ${e.message}`);
    }
  };
})();
