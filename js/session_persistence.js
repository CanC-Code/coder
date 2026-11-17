/**
 * IndexedDB Auto-Persistence & Crash/Refresh Recovery Layer for Coder.
 * Automatically saves and restores the NeuroSymbolicEngine graph, file summaries,
 * audit findings, active diff, chat history, and FileSystemDirectoryHandle.
 */
class CoderPersistence {
    constructor(dbName = "CoderNeuroSymbolicDB", version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.db = null;
        this._saveTimer = null;
    }

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("session")) {
                    db.createObjectStore("session");
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async put(key, value) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("session", "readwrite");
            tx.objectStore("session").put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async get(key) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction("session", "readonly");
            const req = tx.objectStore("session").get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    scheduleSnapshot(engine, uiState = {}) {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this.saveFullSession(engine, uiState).catch(err => console.warn("Snapshot warning:", err));
        }, 350);
    }

    async saveFullSession(engine, uiState = {}) {
        if (!engine) return;
        const summariesObj = {};
        if (engine.fileSummaries) {
            for (const [k, v] of engine.fileSummaries.entries()) {
                summariesObj[k] = v;
            }
        }
        const payload = {
            timestamp: Date.now(),
            engineState: engine.exportState(),
            fileSummaries: summariesObj,
            chatHtml: uiState.chatHtml || "",
            stagedDiff: uiState.stagedDiff || null,
            workspaceName: uiState.workspaceName || ""
        };
        await this.put("latest_snapshot", payload);
        if (uiState.dirHandle) {
            try {
                await this.put("dir_handle", uiState.dirHandle);
            } catch (_) {
                // Ignore if browser restricts handle cloning
            }
        }
    }

    async restoreFullSession(engine) {
        const snap = await this.get("latest_snapshot");
        if (!snap || !snap.engineState) return null;

        engine.importState(snap.engineState);
        if (snap.fileSummaries && engine.fileSummaries) {
            for (const [k, v] of Object.entries(snap.fileSummaries)) {
                engine.fileSummaries.set(k, v);
            }
            engine.finalizeCrossReferences();
        }
        let dirHandle = null;
        try {
            dirHandle = await this.get("dir_handle");
        } catch (_) {}

        return {
            timestamp: snap.timestamp,
            chatHtml: snap.chatHtml || "",
            stagedDiff: snap.stagedDiff || null,
            workspaceName: snap.workspaceName || "",
            dirHandle
        };
    }
}

window.coderPersistence = new CoderPersistence();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
}
