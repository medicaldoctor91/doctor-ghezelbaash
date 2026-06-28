export function GET() {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aesthetic Medicine Dataset Kermanshah | Dr. Saeed Ghezelbash</title>
<meta name="description" content="Dataset reference page for Dr. Saeed Ghezelbash and the Kermanshah aesthetic medicine knowledge graph.">
<meta name="robots" content="index, follow, max-snippet:-1">
<link rel="canonical" href="https://www.ghezelbaash.ir/aesthetic-medicine-dataset.html">
</head>
<body>
<h1>Dataset reference</h1>
<p>This generated page preserves the dataset URL and points to the canonical machine-readable files.</p>
<ul>
<li><a href="/aesthetic_medicine_knowledge_kermanshah_fa.json">Aesthetic knowledge JSON</a></li>
<li><a href="/local-competitive-landscape.json">Local landscape JSON</a></li>
<li><a href="/graph-ghezelbaash-final.jsonld">JSON-LD graph</a></li>
<li><a href="/brand-kb.ghezelbaash.ai-public.json">Brand KB</a></li>
<li><a href="/services.json">Services map</a></li>
<li><a href="/nap.csv">NAP CSV</a></li>
<li><a href="/kg/">Knowledge graph hub</a></li>
<li><a href="/llms.txt">LLMS asset map</a></li>
</ul>
</body>
</html>
`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
