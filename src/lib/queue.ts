/**
 * Simple in-memory queue system for handling concurrent users
 * Tracks active jobs, limits concurrent processing, handles errors gracefully
 */

interface QueuedJob {
  id: string;
  position: number;
  createdAt: Date;
}

interface QueueStats {
  activeJobs: number;
  queuedJobs: number;
  maxConcurrent: number;
  totalProcessed: number;
}

class JobQueue {
  private activeJobs: Set<string> = new Set();
  private waitingQueue: QueuedJob[] = [];
  private maxConcurrent: number = 5; // Max parallel processing
  private totalProcessed: number = 0;
  private jobTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private maxJobAge: number = 30 * 60 * 1000; // 30 minutes max

  canStartJob(): boolean {
    return this.activeJobs.size < this.maxConcurrent;
  }

  getQueuePosition(jobId: string): number {
    const idx = this.waitingQueue.findIndex(j => j.id === jobId);
    return idx >= 0 ? idx + 1 : 0;
  }

  addToQueue(jobId: string): { canStart: boolean; position: number } {
    // Clean up old jobs first
    this.cleanup();

    if (this.canStartJob()) {
      this.activeJobs.add(jobId);
      this.setJobTimeout(jobId);
      return { canStart: true, position: 0 };
    }

    // Add to waiting queue
    const position = this.waitingQueue.length + 1;
    this.waitingQueue.push({
      id: jobId,
      position,
      createdAt: new Date(),
    });

    return { canStart: false, position };
  }

  startJob(jobId: string): boolean {
    if (!this.canStartJob()) return false;
    
    // Remove from waiting queue if present
    this.waitingQueue = this.waitingQueue.filter(j => j.id !== jobId);
    
    this.activeJobs.add(jobId);
    this.setJobTimeout(jobId);
    return true;
  }

  completeJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    this.clearJobTimeout(jobId);
    this.totalProcessed++;
    
    // Start next queued job if any
    this.processNextInQueue();
  }

  failJob(jobId: string): void {
    this.activeJobs.delete(jobId);
    this.clearJobTimeout(jobId);
    this.waitingQueue = this.waitingQueue.filter(j => j.id !== jobId);
  }

  private setJobTimeout(jobId: string): void {
    const timeout = setTimeout(() => {
      console.log(`[Queue] Job ${jobId} timed out after ${this.maxJobAge / 1000}s`);
      this.failJob(jobId);
    }, this.maxJobAge);
    this.jobTimeouts.set(jobId, timeout);
  }

  private clearJobTimeout(jobId: string): void {
    const timeout = this.jobTimeouts.get(jobId);
    if (timeout) {
      clearTimeout(timeout);
      this.jobTimeouts.delete(jobId);
    }
  }

  private processNextInQueue(): void {
    if (this.waitingQueue.length > 0 && this.canStartJob()) {
      const next = this.waitingQueue.shift();
      if (next) {
        this.activeJobs.add(next.id);
        this.setJobTimeout(next.id);
        console.log(`[Queue] Started queued job ${next.id}`);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    // Remove old waiting jobs
    this.waitingQueue = this.waitingQueue.filter(j => {
      const age = now - j.createdAt.getTime();
      return age < this.maxJobAge;
    });
  }

  getStats(): QueueStats {
    return {
      activeJobs: this.activeJobs.size,
      queuedJobs: this.waitingQueue.length,
      maxConcurrent: this.maxConcurrent,
      totalProcessed: this.totalProcessed,
    };
  }

  isJobActive(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }
}

// Singleton instance
export const jobQueue = new JobQueue();
