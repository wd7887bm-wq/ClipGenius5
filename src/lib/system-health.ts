/**
 * System health monitoring
 * Tracks CPU, memory, disk usage to prevent overload
 */

import os from "os";

interface GlobalCounters {
  __activeWorkers: number;
  __queuedJobs: number;
}

const g = globalThis as unknown as GlobalCounters;
g.__activeWorkers = 0;
g.__queuedJobs = 0;

export interface SystemStats {
  cpuLoad: number;
  memoryUsedPercent: number;
  activeProcesses: number;
  queuedJobs: number;
  isHealthy: boolean;
}

export function getSystemStats(): SystemStats {
  const cpuLoad = os.loadavg()[0] || 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsedPercent = ((totalMem - freeMem) / totalMem) * 100;

  return {
    cpuLoad,
    memoryUsedPercent,
    activeProcesses: g.__activeWorkers,
    queuedJobs: g.__queuedJobs,
    isHealthy: cpuLoad < 8 && memoryUsedPercent < 85 && g.__activeWorkers < 10,
  };
}

export function canAcceptNewJob(): boolean {
  return getSystemStats().isHealthy;
}

export function incrementWorkers() {
  g.__activeWorkers++;
}

export function decrementWorkers() {
  g.__activeWorkers = Math.max(0, g.__activeWorkers - 1);
}

export function incrementQueue() {
  g.__queuedJobs++;
}

export function decrementQueue() {
  g.__queuedJobs = Math.max(0, g.__queuedJobs - 1);
}
