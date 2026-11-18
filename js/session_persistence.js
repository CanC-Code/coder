/**
 * IndexedDB Auto-Persistence & Crash/Refresh Recovery Layer for Coder.
 * Stores the NeuroSymbolicEngine graph, file summaries, cached source texts,
 * approved patches, audit findings, active diff, and chat history.
 */
class CoderPersistence {
    constructor(dbName = "CoderNeuroSymbolicDB", version = 2) {
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
            cachedFileTexts: uiState.cachedFileTexts || {},
            patchedContents: uiState.patchedContents || {},
            chatHtml: uiState.chatHtml || "",
            stagedDiff: uiState.stagedDiff || null,
            activeFindingIndex: uiState.activeFindingIndex || 0
        };
        await this.put("latest_snapshot", payload);
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

        return {
            timestamp: snap.timestamp,
            cachedFileTexts: snap.cachedFileTexts || {},
            patchedContents: snap.patchedContents || {},
            chatHtml: snap.chatHtml || "",
            stagedDiff: snap.stagedDiff || null,
            activeFindingIndex: snap.activeFindingIndex || 0
        };
    }
}

window.coderPersistence = new CoderPersistence();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
}

if (window.coderPersistence) {
    window.coderPersistence.clearSnapshot = async function() {
        clearTimeout(this._saveTimer);
        try {
            const db = await this.init();
            return await new Promise((resolve) => {
                const tx = db.transaction("session", "readwrite");
                tx.objectStore("session").clear();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            });
        } catch (_) {
            return false;
        }
    };
}
