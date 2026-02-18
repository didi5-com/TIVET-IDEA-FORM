// Supabase Edge Function: pdf-export
// Deno runtime
// Use built-in Deno.serve to avoid std version mismatches
// @ts-expect-error types are provided at runtime by esm.sh in Deno
import JSZip from 'https://esm.sh/jszip@3.10.1';
// @ts-expect-error types are provided at runtime by esm.sh in Deno
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';

type MappingField = {
  name: string;
  x: number;
  y: number;
  page?: number;
  fontSize?: number;
  type?: 'text' | 'image';
  w?: number;
  h?: number;
};

type Mapping = { fields: MappingField[]; uiW?: number; uiH?: number };

type Submission = Record<string, unknown> & {
  full_name?: string;
  signature_url?: string | null;
};

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status})`);
  return await res.arrayBuffer();
}

async function fillPdf(templateUrl: string, submission: Submission, mapping: Mapping) {
  const templateBytes = await fetchArrayBuffer(templateUrl);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const pages = pdfDoc.getPages();

  for (const f of mapping.fields || []) {
    const pageIdx = f.page ?? 0;
    const page = pages[pageIdx] || pages[0];
    const pageW = page.getWidth();
    const pageH = page.getHeight();
    // Optional scaling from UI pixel coords to PDF points
    const uiW = mapping.uiW || pageW;
    const uiH = mapping.uiH || pageH;
    const scaleX = pageW / uiW;
    const scaleY = pageH / uiH;
    const xPt = (f.x ?? 0) * scaleX;
    const val = submission[f.name as keyof Submission] as unknown;
    if (f.type === 'image' && f.name === 'signature_url' && typeof val === 'string' && val) {
      try {
        const sigBytes = await fetchArrayBuffer(val);
        let img;
        try { img = await pdfDoc.embedPng(sigBytes); } catch (_) { img = await pdfDoc.embedJpg(sigBytes); }
        const wPt = (f.w || 120) * scaleX;
        const hPt = (f.h || 48) * scaleY;
        // Convert top-left UI Y to PDF bottom-left Y
        const yPt = pageH - ((f.y ?? 0) * scaleY) - hPt;
        page.drawImage(img, { x: xPt, y: yPt, width: wPt, height: hPt });
      } catch (e) {
        console.warn('Failed to embed signature', e);
      }
    } else if (typeof val === 'string' || typeof val === 'number') {
      const size = f.fontSize || 12;
      // Draw text using top-left mapping: adjust Y for baseline roughly by font size
      const yPt = pageH - ((f.y ?? 0) * scaleY) - size;
      page.drawText(String(val ?? ''), {
        x: xPt,
        y: yPt,
        size,
        font,
        color: rgb(0, 0, 0)
      });
    }
  }

  return await pdfDoc.save();
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Declare Deno for local TypeScript tooling
declare const Deno: any;

Deno.serve(async (req: Request) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders });
    }
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return new Response(JSON.stringify({ error: 'Expected JSON body' }), { status: 400, headers: corsHeaders });
    }
    const body = await req.json();
    const mode: 'single' | 'bulk' = body.mode || 'single';
    const submissions: Submission[] = body.submissions || [];
    const mapping: Mapping = body.mapping || { fields: [] };
    const templateUrl: string = body.templateUrl;
    if (!templateUrl) {
      return new Response(JSON.stringify({ error: 'templateUrl is required' }), { status: 400, headers: corsHeaders });
    }
    // Prevent localhost/template URLs which are not reachable from the Edge environment
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(templateUrl)) {
      return new Response(JSON.stringify({ error: 'templateUrl must be a public URL accessible from Edge' }), { status: 400, headers: corsHeaders });
    }

    if (mode === 'single') {
      const sub = submissions[0];
      if (!sub) return new Response(JSON.stringify({ error: 'No submission provided' }), { status: 400, headers: corsHeaders });
      const bytes = await fillPdf(templateUrl, sub, mapping);
      return new Response(bytes, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${(sub.full_name || 'submission').toString().replace(/[^a-z0-9_\-]+/gi, '_')}.pdf"`,
          ...corsHeaders,
        },
      });
    } else {
      const zip = new JSZip();
      for (const sub of submissions) {
        const bytes = await fillPdf(templateUrl, sub, mapping);
        const name = `${(sub.full_name || 'submission').toString().replace(/[^a-z0-9_\-]+/gi, '_')}.pdf`;
        zip.file(name, bytes);
      }
      const zipBlob = await zip.generateAsync({ type: 'uint8array' });
      return new Response(zipBlob, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="submissions.zip"',
          ...corsHeaders,
        },
      });
    }
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg || 'Internal error' }), { status: 500, headers: corsHeaders });
  }
});