/**
 * Worker Pool Manager
 * Manages a pool of Node.js worker threads for parallel processing
 */
const { Worker } = require('worker_threads');
const path = require('path');
const os = require('os');

class WorkerPool {
    constructor(workerPath, poolSize = null) {
        // Default to half the CPU cores (leave room for main thread + I/O)
        this.poolSize = poolSize || Math.max(2, Math.floor(os.cpus().length / 2));
        this.workerPath = path.resolve(workerPath);
        this.workers = [];
        this.taskQueue = [];
        this.activeWorkers = new Set();
        this.taskId = 0;
        this.callbacks = new Map();
        this.isShutdown = false;
        
        console.log(`[WorkerPool] Initializing pool with ${this.poolSize} workers: ${path.basename(this.workerPath)}`);
        this._initWorkers();
    }

    _initWorkers() {
        for (let i = 0; i < this.poolSize; i++) {
            this._createWorker(i);
        }
    }

    _createWorker(index) {
        const worker = new Worker(this.workerPath, {
            workerData: { workerId: index }
        });

        worker.on('message', (result) => {
            const { taskId, data, error } = result;
            const callback = this.callbacks.get(taskId);
            
            if (callback) {
                this.callbacks.delete(taskId);
                if (error) {
                    callback.reject(new Error(error));
                } else {
                    callback.resolve(data);
                }
            }
            
            // Worker is now available
            this.activeWorkers.delete(index);
            this._processQueue();
        });

        worker.on('error', (err) => {
            console.error(`[WorkerPool] Worker ${index} error:`, err);
            this.activeWorkers.delete(index);
            
            // Recreate worker if not shutting down
            if (!this.isShutdown) {
                this.workers[index] = null;
                setTimeout(() => this._createWorker(index), 100);
            }
        });

        worker.on('exit', (code) => {
            if (code !== 0 && !this.isShutdown) {
                console.warn(`[WorkerPool] Worker ${index} exited with code ${code}`);
            }
        });

        this.workers[index] = worker;
    }

    _processQueue() {
        if (this.taskQueue.length === 0) return;
        
        // Find available worker
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.activeWorkers.has(i) && this.workers[i]) {
                const task = this.taskQueue.shift();
                if (task) {
                    this.activeWorkers.add(i);
                    this.workers[i].postMessage(task);
                    break;
                }
            }
        }
    }

    /**
     * Submit a task to the worker pool
     * @param {string} type - Task type identifier
     * @param {object} payload - Task data
     * @returns {Promise} Resolves with worker result
     */
    submit(type, payload) {
        if (this.isShutdown) {
            return Promise.reject(new Error('Worker pool is shutdown'));
        }

        return new Promise((resolve, reject) => {
            const taskId = ++this.taskId;
            this.callbacks.set(taskId, { resolve, reject });
            
            const task = { taskId, type, payload };
            
            // Check for available worker
            let submitted = false;
            for (let i = 0; i < this.poolSize; i++) {
                if (!this.activeWorkers.has(i) && this.workers[i]) {
                    this.activeWorkers.add(i);
                    this.workers[i].postMessage(task);
                    submitted = true;
                    break;
                }
            }
            
            // Queue if no worker available
            if (!submitted) {
                this.taskQueue.push(task);
            }
        });
    }

    /**
     * Submit multiple tasks and wait for all to complete
     * @param {Array<{type: string, payload: object}>} tasks
     * @returns {Promise<Array>} Results in same order as tasks
     */
    submitBatch(tasks) {
        return Promise.all(tasks.map(t => this.submit(t.type, t.payload)));
    }

    /**
     * Submit a task without waiting for result (fire and forget)
     * @param {string} type - Task type
     * @param {object} payload - Task data
     */
    submitAsync(type, payload) {
        if (this.isShutdown) return;
        
        const taskId = ++this.taskId;
        // No callback registered - result will be ignored
        
        const task = { taskId, type, payload };
        
        for (let i = 0; i < this.poolSize; i++) {
            if (!this.activeWorkers.has(i) && this.workers[i]) {
                this.activeWorkers.add(i);
                this.workers[i].postMessage(task);
                return;
            }
        }
        
        // Queue if no worker available
        this.taskQueue.push(task);
    }

    /**
     * Get pool statistics
     */
    getStats() {
        return {
            poolSize: this.poolSize,
            activeWorkers: this.activeWorkers.size,
            queuedTasks: this.taskQueue.length,
            pendingCallbacks: this.callbacks.size
        };
    }

    /**
     * Gracefully shutdown the worker pool
     */
    async shutdown() {
        this.isShutdown = true;
        this.taskQueue = [];
        
        // Reject pending callbacks
        for (const [taskId, callback] of this.callbacks) {
            callback.reject(new Error('Worker pool shutdown'));
        }
        this.callbacks.clear();
        
        // Terminate all workers
        const terminatePromises = this.workers.map((worker, i) => {
            if (worker) {
                return worker.terminate();
            }
            return Promise.resolve();
        });
        
        await Promise.all(terminatePromises);
        this.workers = [];
        console.log('[WorkerPool] Shutdown complete');
    }
}

module.exports = { WorkerPool };
