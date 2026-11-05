"""Exercise real Chromium BFCache with locally served compiled Reader assets.

Build dist first, then run `python tests/reader-bfcache-regression.py --dist dist`.
Requires Playwright plus media-capable Chromium or Google Chrome
(PLAYWRIGHT_CHROMIUM_EXECUTABLE can select it).
Unlike request interception, this HTTP fixture permits an actual persisted
pageshow. Delayed media responses include real HTTP 206 byte ranges.
"""
import argparse
import asyncio
import http.server
import json
import mimetypes
import os
from pathlib import Path
import re
import shutil
import threading
from urllib.parse import unquote, urlsplit

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist', type=Path, default=ROOT / 'dist')
parser.add_argument('--report', type=Path)
args = parser.parse_args()
DIST = args.dist.resolve()
WATCH = '/video-saeed-ghezelbash-subcision-technique?t=5'
if not (DIST / 'video-saeed-ghezelbash-subcision-technique.html').is_file():
    parser.error('Build dist before running this browser regression')


class Fixture:
    def __init__(self):
        self.media_delay = 0
        self.media_requests = []
        self.media_requested = threading.Event()


fixture = Fixture()


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        path = unquote(urlsplit(self.path).path)
        file = DIST / path.lstrip('/') if path != '/' else DIST / 'index.html'
        if not file.is_file() and not file.suffix:
            file = Path(str(file) + '.html')
        if not file.is_file() or not Path(os.path.abspath(file)).is_relative_to(DIST):
            self.send_error(404)
            return
        body = file.read_bytes()
        media = file.suffix in ('.mp4', '.webm')
        content_type = {'.js': 'text/javascript', '.json': 'application/json'}.get(
            file.suffix, mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        byte_range = self.headers.get('Range') if media else None
        if media:
            fixture.media_requests.append({'path': path, 'range': byte_range})
            fixture.media_requested.set()
            # Wait in the server thread; Chromium remains free to navigate.
            threading.Event().wait(fixture.media_delay)
        start, end = 0, len(body) - 1
        if byte_range:
            match = re.fullmatch(r'bytes=(\d+)-(\d*)', byte_range)
            if not match:
                self.send_error(416)
                return
            start = int(match[1])
            end = min(int(match[2]) if match[2] else end, end)
            if start > end:
                self.send_error(416)
                return
        chunk = body[start:end + 1]
        self.send_response(206 if byte_range else 200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(chunk)))
        if media:
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Cache-Control', 'public, max-age=3600')
        if byte_range:
            self.send_header('Content-Range', f'bytes {start}-{end}/{len(body)}')
        self.end_headers()
        try:
            self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *args):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = 'http://127.0.0.1:' + str(server.server_port)
INIT = '''window.bfcacheShows=[];window.bfcacheHides=[];
addEventListener('pageshow',event=>window.bfcacheShows.push(event.persisted));
addEventListener('pagehide',event=>window.bfcacheHides.push(event.persisted));'''
VIDEO_STATE = '''(video)=>({time:video.currentTime,ready:video.readyState,
paused:video.paused,preload:video.preload})'''
READY_AT_FIVE = '''(()=>{const v=document.querySelector('main video');
return v&&v.readyState>=2&&!v.seeking&&Math.abs(v.currentTime-5)<.2})()'''
MEDIA_TRACE='''window.fixtureNativeMediaEvents=[];
for(const type of ['loadstart','loadedmetadata','durationchange','loadeddata','canplay','seeking','seeked','suspend','error'])
document.addEventListener(type,event=>{const v=event.target;if(!(v instanceof HTMLVideoElement))return;
fixtureNativeMediaEvents.push({event:type,time:v.currentTime,ready:v.readyState,network:v.networkState,
seeking:v.seeking,source:v.currentSrc,error:v.error?{code:v.error.code,message:v.error.message}:null});
if(fixtureNativeMediaEvents.length>64)fixtureNativeMediaEvents.shift();},true);'''

async def wait_native_video(page,predicate,report,timeout=15000):
    try:
        await page.wait_for_function(predicate,timeout=timeout)
    except Exception as error:
        report['failure']={'name':'native video readiness through BFCache','errorType':type(error).__name__,
            'media':await page.locator('main video').evaluate('''(v)=>({time:v.currentTime,
                readyState:v.readyState,networkState:v.networkState,seeking:v.seeking,
                paused:v.paused,source:v.currentSrc,
                h264:v.canPlayType('video/mp4; codecs="avc1.64001f"'),
                av1:v.canPlayType('video/webm; codecs="av01.0.04M.08, opus"'),
                seekable:Array.from({length:v.seekable.length},(_,i)=>[v.seekable.start(i),v.seekable.end(i)]),
                sources:[...v.querySelectorAll('source')].map(s=>({source:s.src,type:s.type,support:v.canPlayType(s.type)})),
                error:v.error?{code:v.error.code,message:v.error.message}:null})'''),
            'nativeEvents':await page.evaluate('window.fixtureNativeMediaEvents||[]'),
            'mediaRequests':list(fixture.media_requests)}
        report['passed']=len(report['cases'])
        if args.report:
            args.report.parent.mkdir(parents=True,exist_ok=True)
            args.report.write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps({'browser':report['browser'],'failure':report['failure']},ensure_ascii=False),flush=True)
        raise


async def open_watch(browser, name, delay):
    fixture.media_delay = delay
    fixture.media_requests = []
    fixture.media_requested.clear()
    context = await browser.new_context(viewport={'width': 390, 'height': 844})
    await context.add_init_script(INIT)
    await context.add_init_script(MEDIA_TRACE)
    page = await context.new_page()
    state = {'errors': [], 'unexpectedRequests': []}
    page.on('pageerror', lambda error: state['errors'].append(str(error)))
    page.on('request', lambda request: state['unexpectedRequests'].append(request.url)
            if not request.url.startswith(BASE + '/') else None)
    await page.goto(BASE + WATCH, wait_until='domcontentloaded')
    await page.locator('#guide-search[data-mounted="true"]').wait_for()
    await page.evaluate('(name)=>window.bfcacheSession=name', name)
    assert await asyncio.to_thread(fixture.media_requested.wait, 5), 'Expected native media request'
    return context, page, state


async def round_trip(page, name):
    await page.goto(BASE + '/filler', wait_until='domcontentloaded')
    await page.go_back(wait_until='commit')
    await page.wait_for_function('window.bfcacheShows?.includes(true)')
    evidence = await page.evaluate('''()=>({session:window.bfcacheSession,
        shows:window.bfcacheShows,hides:window.bfcacheHides,
        navigationType:performance.getEntriesByType('navigation')[0].type})''')
    assert evidence['session'] == name, evidence
    assert True in evidence['shows'] and True in evidence['hides'], evidence
    return evidence


def clean(state):
    assert not state['errors'], state['errors']
    assert not state['unexpectedRequests'], state['unexpectedRequests']


async def main():
    report = {'fixture': 'Real local HTTP compiled dist; Chromium BFCache enabled; '
              'persisted pageshow required; delayed native HTTP 206 media; no production requests',
              'cases': []}
    async with async_playwright() as playwright:
        options = {'headless': True, 'ignore_default_args': ['--disable-back-forward-cache'],
                   'args': ['--no-sandbox', '--enable-features=BackForwardCache']}
        executable = os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or next((path for name in
            ['chromium','chromium-browser','google-chrome','google-chrome-stable'] if (path:=shutil.which(name))),None)
        if not executable:
            raise RuntimeError('Install media-capable Chromium or Google Chrome, or set PLAYWRIGHT_CHROMIUM_EXECUTABLE; native media tests require an installed browser')
        options['executable_path'] = executable
        browser = await playwright.chromium.launch(**options)
        probe=await browser.new_page()
        report['browser']={'executable':executable,'version':browser.version,
            'codecs':await probe.evaluate('''(()=>{const v=document.createElement('video');return {
                h264:v.canPlayType('video/mp4; codecs="avc1.64001f"'),
                av1:v.canPlayType('video/webm; codecs="av01.0.04M.08, opus"')}})()''')}
        await probe.close()
        print(json.dumps({'browserRuntime':report['browser']}),flush=True)
        try:
            name = 'pending timed seek resumes after real BFCache without autoplay'
            context, page, state = await open_watch(browser, name, 2.5)
            before = await page.locator('main video').evaluate(VIDEO_STATE)
            assert before['ready'] == 0 and before['time'] == 0, before
            persisted = await round_trip(page, name)
            await wait_native_video(page,READY_AT_FIVE,report,timeout=20000)
            after = await page.locator('main video').evaluate(VIDEO_STATE)
            assert after['paused'], after
            clean(state)
            report['cases'].append({'name': name, 'before': before, 'restored': after,
                                    'history': persisted, 'mediaRequests': list(fixture.media_requests)})
            await context.close()

            name = 'completed timed seek preserves later user position through BFCache'
            context, page, state = await open_watch(browser, name, 0)
            await wait_native_video(page,READY_AT_FIVE,report,timeout=15000)
            await page.locator('main video').evaluate('(video)=>video.currentTime=8')
            await wait_native_video(page,'''(()=>{const v=document.querySelector('main video');
                return v.readyState>=2&&!v.seeking&&Math.abs(v.currentTime-8)<.2})()''',report,timeout=30000)
            before = await page.locator('main video').evaluate(VIDEO_STATE)
            persisted = await round_trip(page, name)
            await page.wait_for_timeout(500)
            after = await page.locator('main video').evaluate(VIDEO_STATE)
            assert abs(before['time'] - after['time']) < .2 and after['paused'], after
            clean(state)
            report['cases'].append({'name': name, 'before': before, 'restored': after, 'history': persisted})
            await context.close()

            name = 'manual pending scrub cancellation survives BFCache without reinstating URL time'
            context, page, state = await open_watch(browser, name, 2.5)
            await page.locator('main video').press('ArrowRight')
            before = await page.locator('main video').evaluate(VIDEO_STATE)
            assert before['preload'] == 'none', before
            persisted = await round_trip(page, name)
            # Start native loading after restoration. A canceled timed gate must
            # not return when the delayed media finally becomes available.
            await page.locator('main video').evaluate('(video)=>{video.preload="auto";video.load()}')
            await wait_native_video(page,'document.querySelector("main video").readyState>=2',report,timeout=20000)
            await page.wait_for_timeout(300)
            after = await page.locator('main video').evaluate(VIDEO_STATE)
            assert abs(after['time'] - before['time']) < .2 and after['paused'], after
            clean(state)
            report['cases'].append({'name': name, 'before': before, 'restored': after, 'history': persisted})
            await context.close()
        finally:
            await browser.close()
    report['passed'] = len(report['cases'])
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))


try:
    asyncio.run(main())
finally:
    server.shutdown()
