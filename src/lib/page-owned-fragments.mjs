const FOOTER_START = "<!--SITE_FOOTER_GOVERNANCE_START\n";
const FOOTER_END = "\nSITE_FOOTER_GOVERNANCE_END-->";

function locateFooterGovernance(source) {
  const text = String(source);
  const start = text.indexOf(FOOTER_START);
  const secondStart = start < 0 ? -1 : text.indexOf(FOOTER_START, start + FOOTER_START.length);
  if (start < 0 || secondStart >= 0)
    throw new Error("Canonical page source requires exactly one footer-governance source block");
  const contentStart = start + FOOTER_START.length;
  const end = text.indexOf(FOOTER_END, contentStart);
  const secondEnd = end < 0 ? -1 : text.indexOf(FOOTER_END, end + FOOTER_END.length);
  if (end < 0 || secondEnd >= 0)
    throw new Error("Canonical page footer-governance source block is malformed");
  const html = text.slice(contentStart, end);
  if (
    !html.startsWith('  <details class="editorial-governance" id="privacy-and-terms">') ||
    !html.endsWith("  </details>") ||
    !html.includes("https://www.google.com/help/terms_maps/") ||
    !html.includes("https://policies.google.com/privacy")
  )
    throw new Error("Canonical page footer-governance source block contract drift");
  return { text, start, end: end + FOOTER_END.length, html };
}

export function extractPageOwnedFooterGovernance(source) {
  return locateFooterGovernance(source).html;
}

export function stripPageOwnedFooterGovernance(source) {
  const located = locateFooterGovernance(source);
  const suffixStart = located.text[located.end] === "\n" ? located.end + 1 : located.end;
  return located.text.slice(0, located.start) + located.text.slice(suffixStart);
}
