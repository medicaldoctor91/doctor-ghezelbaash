export function GET() { return new Response(JSON.stringify({ ok: true }) + '\n', { headers: { 'Content-Type': 'application/json; charset=utf-8' } }); }
