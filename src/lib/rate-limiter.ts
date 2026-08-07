/**
 * Rate limiter for API endpoints
 * Prevents abuse and ensures fair usage
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (per IP)
const ipLimits = new Map<string, RateLimitEntry>();
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipLimits.entries()) {
    if (entry.resetAt < now) {
      ipLimits.delete(ip);
    }
  }
}, CLEANUP_INTERVAL);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export function checkRateLimit(
  identifier: string,
  maxRequests: number = 5,
  windowMs: number = 60 * 60 * 1000 // 1 hour
): RateLimitResult {
  const now = Date.now();
  const entry = ipLimits.get(identifier);

  if (!entry || entry.resetAt < now) {
    // New window
    ipLimits.set(identifier, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
      limit: maxRequests,
    };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      limit: maxRequests,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
    limit: maxRequests,
  };
}

export function getClientIdentifier(req: Request): string {
  // Use forwarded IP or direct IP
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}
