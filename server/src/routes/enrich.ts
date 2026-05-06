import { Router, Request, Response } from 'express';
import {
  enrichCompanyFromDomain,
  enrichCompanyFromDomainStreaming,
} from '../services/enrichment.js';
import { formatErrorResponse } from '../services/claude.js';
import { isTestDomain, getMockCompanyProfile } from '../services/mockData.js';
import { openSSE } from '../utils/sse.js';

export const enrichRouter = Router();

interface EnrichRequest {
  domain: string;
}

enrichRouter.post('/', async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
      });
    }

    if (isTestDomain(domain)) {
      console.log('🧪 Test domain detected — returning mock company data');
      return res.json({ success: true, data: getMockCompanyProfile() });
    }
    
    const companyProfile = await enrichCompanyFromDomain(domain);
    
    res.json({
      success: true,
      data: companyProfile,
    });
  } catch (error) {
    console.error('Enrichment error:', error);
    const { status, body } = formatErrorResponse(error);
    res.status(status).json(body);
  }
});

// Streaming variant — emits SSE status events while Claude runs web searches
// and synthesizes the company profile, ending with a `complete` event that
// carries the final CompanyProfile.
//
// Heavily instrumented: every checkpoint logs `[enrich <reqId>] <event>
// elapsed_ms=<n> ...` so failed prod requests can be reconstructed from
// Ramplify logs alone. The `res.on('close')` handler fires `req_closed_by_peer`
// when the upstream socket is severed before we voluntarily end the response —
// that's the smoking gun for a Ramplify/CloudFront gateway-drop versus a
// code-path failure (which would log `failed` first).
enrichRouter.post(
  '/stream',
  async (req: Request<{}, {}, EnrichRequest>, res: Response) => {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({ success: false, error: 'Domain is required' });
    }

    const startedAt = Date.now();
    const elapsed = () => Date.now() - startedAt;

    const stream = openSSE(res);
    const tag = `[enrich ${stream.id}]`;

    console.log(
      `${tag} start domain=${domain} client_ip=${req.ip ?? 'unknown'} ua=${JSON.stringify(req.get('user-agent') ?? '')}`,
    );
    console.log(`${tag} sse_opened elapsed_ms=${elapsed()}`);

    // NOTE: must use `res.on('close')`, NOT `req.on('close')`. Node's
    // IncomingMessage 'close' fires as soon as the request *body* stream is
    // fully consumed (i.e. express.json() finishes parsing the POST body),
    // which happens within milliseconds of the request landing — not when
    // the peer disconnects. ServerResponse 'close' only fires when the
    // *response* socket closes, which is what we actually care about. The
    // `was_writableEnded` check then discriminates "we ended it" (true)
    // from "peer dropped" (false).
    res.on('close', () => {
      if (!res.writableEnded) {
        console.warn(
          `${tag} req_closed_by_peer elapsed_ms=${elapsed()} res_writable=${res.writable} was_writableEnded=${res.writableEnded}`,
        );
      }
    });

    try {
      stream.send('status', { status: `Looking up ${domain}...` });

      if (isTestDomain(domain)) {
        stream.send('status', { status: 'Test domain — using mock data' });
        stream.send('complete', { success: true, data: getMockCompanyProfile() });
        console.log(`${tag} complete_sent elapsed_ms=${elapsed()} mock=true`);
        stream.close();
        console.log(`${tag} stream_closed elapsed_ms=${elapsed()}`);
        return;
      }

      const profile = await enrichCompanyFromDomainStreaming(
        domain,
        (status) => stream.send('status', { status }),
        stream.id,
      );

      stream.send('status', { status: 'Finalizing profile...' });
      stream.send('complete', { success: true, data: profile });
      console.log(`${tag} complete_sent elapsed_ms=${elapsed()}`);
      stream.close();
      console.log(`${tag} stream_closed elapsed_ms=${elapsed()}`);
    } catch (error) {
      const { body } = formatErrorResponse(error);
      console.error(
        `${tag} failed elapsed_ms=${elapsed()} code=${body.code} error=${JSON.stringify(body.error)}`,
      );
      stream.send('error', { error: body.error, code: body.code });
      stream.close();
    }
  },
);
