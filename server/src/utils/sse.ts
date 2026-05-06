import type { Response } from 'express';

/**
 * Production-safe SSE setup. Local dev works fine with bare
 * Content-Type/flushHeaders, but Ramplify (and most reverse proxies — nginx,
 * Cloudflare, Vercel edge) buffer response bodies until either a flush
 * threshold is hit or the response ends. The result: every queued `status`
 * event arrives at once when the upstream call completes, instead of
 * streaming as designed.
 *
 * Two extras above the default fix that:
 *   1. An immediate comment line (`: stream-open`) right after `flushHeaders`
 *      so the proxy has actual bytes and stops batching.
 *   2. A 15-second comment heartbeat (`: ping`) so idle proxies don't close
 *      the socket while we wait on Claude's web_search round-trips.
 *
 * Comment lines start with `:` and are ignored by browser EventSource
 * consumers, so they're safe to interleave with real `event:`/`data:` frames.
 *
 * `Cache-Control: no-cache, no-transform` adds `no-transform` to defeat any
 * downstream gzip middleware that might try to buffer-then-compress.
 */
export interface SSEStream {
  /** Short request id for correlating log lines across the request lifecycle. */
  id: string;
  send: (event: string, data: unknown) => void;
  close: () => void;
}

/**
 * Mint a short hex id (4 chars) for tagging log lines belonging to one
 * request. Collisions are fine for log-grepping purposes — we're optimizing
 * for human readability in Ramplify's log viewer, not cryptographic
 * uniqueness.
 */
export function makeReqId(): string {
  return Math.random().toString(16).slice(2, 6);
}

export function openSSE(res: Response): SSEStream {
  const id = makeReqId();
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write(': stream-open\n\n');

  const heartbeat = setInterval(() => {
    if (res.writableEnded) {
      clearInterval(heartbeat);
      return;
    }
    res.write(': ping\n\n');
  }, 15_000);

  // Defensive cleanup if the client drops mid-stream — without this the
  // interval would tick into a closed socket every 15s for the lifetime of
  // the process.
  res.on('close', () => clearInterval(heartbeat));

  return {
    id,
    send(event, data) {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      res.end();
    },
  };
}
