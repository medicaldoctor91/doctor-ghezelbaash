"""Read-only, fresh external parser diagnostic. Never changes production."""
import asyncio
import json
import re
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

TARGETS = {
    "production": "https://www.ghezelbaash.ir/",
    "new_preview": "https://9d813bbe.doctor-ghezelbaash.pages.dev/",
}
REPORT = {"tested_urls": TARGETS, "fresh_external_parser": {}}

def record(name, obj):
    print(name, json.dumps(obj, ensure_ascii=False, default=str), flush=True)

def inspect_raw(name, url):
    try:
        response = requests.get(url, timeout=50, headers={"Cache-Control": "no-cache"})
        response.raise_for_status()
        data = response.content
        soup = BeautifulSoup(data, "html.parser")
        scripts = soup.select('script[type="application/ld+json"]')
        parsed = []
        for script in scripts:
            try:
                obj = json.loads(script.string or script.text)
                parsed.append({
                    "script_id": script.get("id"),
                    "node_count": len(obj.get("@graph", [])),
                    "context": str(obj.get("@context", ""))[:250],
                    "main_entity": next(
                        (node.get("mainEntity") for node in obj.get("@graph", [])
                         if node.get("@id") == "https://www.ghezelbaash.ir/webpage"), None
                    ),
                })
            except Exception as e:
                parsed.append({"parse_error": str(e)[:300]})
        m = re.search(rb'<script[^>]+id="canonical-entity-graph"[^>]*>[\s\S]*?</script>', data)
        out = {"http": response.status_code, "html_bytes": len(data),
               "active_jsonld_scripts": len(scripts), "scripts": parsed,
               "full_graph_end_byte": m.end() if m else None,
               "first_h1_byte": data.find(b"<h1"),
               "evidence_byte": data.find(b'class="entity-home-evidence"'),
               "response_headers_bytes_estimate": sum(len(k)+len(v)+4 for k,v in response.headers.items())+64}
        record("RAW_HTML_" + name, out)
        REPORT["fresh_external_parser"][f"raw_{name}"] = out
    except Exception as e:
        record("RAW_HTML_" + name, {"error":repr(e)})
        REPORT["fresh_external_parser"][f"raw_{name}"] = {"error":repr(e)}

async def test_validator(browser, name, url):
    page = await browser.new_page()
    results = {"site":name, "url":url}
    try:
        await page.goto("https://validator.schema.org/", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(1500)
        fields = await page.locator("input").evaluate_all(
            "(els)=>els.map(x=>({id:x.id,type:x.type,placeholder:x.placeholder,visible:!!(x.offsetWidth||x.offsetHeight)}))"
        )
        results["inputs_before"] = fields[:15]
        # The official validator's "Fetch URL" tab is selected by default.
        tab = page.get_by_text("Fetch URL", exact=True)
        if await tab.count() and await tab.first.is_visible():
            await tab.first.click(timeout=5000)
        inp = page.locator("#new-test-url")
        if not await inp.count() or not await inp.first.is_visible():
            inp = page.locator('input[type="url"]:visible')
        if not await inp.count():
            inp = page.locator('input[type="text"]:visible')
        if not await inp.count():
            raise RuntimeError("Validator URL form not available")
        await inp.first.fill(url)
        run = page.get_by_role("button", name=re.compile(r"run test",re.I))
        if await run.count():
            await run.first.click(timeout=10000)
        else:
            raise RuntimeError("Validator Run test control not found")
        await page.wait_for_timeout(25000)
        results["final_url"] = page.url
        results["visible_result"] = (await page.locator("body").inner_text())[:12500]
        await page.screenshot(path=f"schema_{name}.png",full_page=True)
    except Exception as e:
        results["error"] = repr(e)
        try: results["visible_result"] = (await page.locator("body").inner_text())[:3500]
        except Exception: pass
    record("SCHEMAORG_"+name,results)
    REPORT["fresh_external_parser"][f"schemaorg_{name}"]=results
    await page.close()

async def test_google_rich_results(browser, name, url):
    page = await browser.new_page()
    results = {"site":name,"url":url}
    try:
        await page.goto("https://search.google.com/test/rich-results", wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(2500)
        results["initial_body"] = (await page.locator("body").inner_text())[:1500]
        field = page.locator('input[type="url"]:visible')
        if not await field.count(): field=page.get_by_role("textbox")
        if not await field.count(): field=page.locator('input[type="text"]:visible')
        if not await field.count(): raise RuntimeError("Google URL test field unavailable; may require login")
        await field.first.fill(url)
        btn = page.get_by_role("button",name=re.compile("test url",re.I))
        if not await btn.count():
            btn = page.get_by_text(re.compile(r"^TEST URL$",re.I))
        if not await btn.count(): raise RuntimeError("Google TEST URL button unavailable")
        await btn.first.click(timeout=10000)
        await page.wait_for_timeout(40000)
        results["final_url"] = page.url
        results["visible_result"]=(await page.locator("body").inner_text())[:14500]
        await page.screenshot(path=f"google_{name}.png",full_page=True)
    except Exception as e:
        results["error"]=repr(e)
        try: results["visible_result"]=(await page.locator("body").inner_text())[:3500]
        except Exception: pass
    record("GOOGLE_RICH_RESULTS_"+name,results)
    REPORT["fresh_external_parser"][f"google_{name}"]=results
    await page.close()

async def main():
    for name,url in TARGETS.items():
        inspect_raw(name,url)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True,args=["--no-sandbox"])
        # One fresh official parser session per target, with no sign-in and no mutations.
        for name,url in TARGETS.items():
            await test_validator(browser,name,url)
            await test_google_rich_results(browser,name,url)
        await browser.close()
    Path("fresh_external_parser_report.json").write_text(
        json.dumps(REPORT,ensure_ascii=False,indent=2)
    )

asyncio.run(main())
