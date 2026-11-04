"""Browser regression for compiled dist; no production network is allowed.

Build first with the documented ARCHIVE_SOURCE_COMMIT pin. Install the test
prerequisite with `python -m pip install playwright` and either install its
Chromium (`python -m playwright install chromium`) or use a system Chromium.
Run `python tests/reader-browser-regression.py --dist dist`; optional
`--report /tmp/reader-browser-results.json` writes the detailed evidence.
PLAYWRIGHT_CHROMIUM_EXECUTABLE selects an explicit browser executable.
"""
import argparse,asyncio,json,mimetypes,os,re,shutil
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from playwright.async_api import async_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dist',type=Path,default=ROOT/'dist')
parser.add_argument('--report',type=Path)
args=parser.parse_args()
DIST=args.dist.resolve()
OUT=args.report
if not (DIST/'botox.html').is_file():
    parser.error('Build dist before running this browser regression')
BASE='https://www.ghezelbaash.ir'
GUIDE=re.compile(r'/assets/guide\.[a-f0-9]{12}\.json$')
MANIFEST=re.compile(r'/assets/guide-search\.[a-f0-9]{12}\.json$')

class HomeSearchInput(HTMLParser):
    placeholder=None
    def handle_starttag(self,tag,attrs):
        values=dict(attrs)
        if tag=='input' and values.get('id')=='guide-search-input':
            self.placeholder=values.get('placeholder')

home_search=HomeSearchInput();home_search.feed((DIST/'index.html').read_text())
assert home_search.placeholder,'Built homepage must declare its Search placeholder'

async def fixture(browser, *, delay=0, fail_guide=False, fail_home_fetch=False, fail_manifest=False, javascript=True):
    context=await browser.new_context(viewport={'width':390,'height':844},java_script_enabled=javascript)
    state={'requests':[],'errors':[],'failGuide':fail_guide,'failHomeFetch':fail_home_fetch,'failManifest':fail_manifest,
           'unexpectedRequests':[],'delays':{},'failPaths':[],'corruptPaths':[]}
    page=await context.new_page()
    page.on('pageerror',lambda e:state['errors'].append(str(e)))
    async def route(request_route):
        request=request_route.request;parsed=urlsplit(request.url)
        state['requests'].append({'path':parsed.path,'type':request.resource_type,'range':request.headers.get('range')})
        if parsed.netloc!='www.ghezelbaash.ir':
            state['unexpectedRequests'].append(request.url)
            await request_route.abort();return
        if MANIFEST.search(parsed.path):
            if delay:await asyncio.sleep(delay)
            if state['failManifest']:
                await request_route.fulfill(status=503,body='Fixture manifest unavailable');return
        if GUIDE.search(parsed.path):
            if state['failGuide']:
                await request_route.fulfill(status=503,body='Fixture Guide unavailable');return
        if parsed.path=='/' and request.resource_type!='document' and state['failHomeFetch']:
            await request_route.fulfill(status=503,body='Fixture Home fallback unavailable');return
        rel=unquote(parsed.path).lstrip('/')
        file=DIST/rel if rel else DIST/'index.html'
        if not file.is_file() and not Path(rel).suffix:file=DIST/(rel+'.html')
        if not file.is_file():
            await request_route.fulfill(status=404,body='Fixture missing '+parsed.path);return
        if parsed.path in state['delays']:await asyncio.sleep(state['delays'][parsed.path])
        if parsed.path in state['failPaths'] and request.resource_type!='document':
            await request_route.fulfill(status=503,body='Fixture focused navigation unavailable');return
        mime={'.js':'text/javascript','.json':'application/json','.vtt':'text/vtt'}.get(file.suffix,mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
        body=file.read_bytes()
        if parsed.path in state['corruptPaths'] and request.resource_type!='document':
            body=re.sub(rb'(<meta name="guide-source-signature" content=")[a-f0-9]{64}',rb'\g<1>'+b'0'*64,body)
        byte_range=request.headers.get('range')
        if byte_range and file.suffix in ('.mp4','.webm'):
            match=re.fullmatch(r'bytes=(\d+)-(\d*)',byte_range)
            if match:
                start=int(match[1]);end=min(int(match[2]) if match[2] else len(body)-1,len(body)-1)
                if start<=end:
                    await request_route.fulfill(status=206,body=body[start:end+1],content_type=mime,
                        headers={'Accept-Ranges':'bytes','Content-Range':f'bytes {start}-{end}/{len(body)}'})
                    return
        await request_route.fulfill(status=200,body=body,content_type=mime)
    await page.route('**/*',route)
    return context,page,state

async def ready(page,path):
    await page.goto(BASE+path,wait_until='domcontentloaded')
    await page.locator('#guide-search[data-mounted="true"]').wait_for()

def guide_count(state):return sum(bool(GUIDE.search(x['path'])) for x in state['requests'])
def manifest_count(state):return sum(bool(MANIFEST.search(x['path'])) for x in state['requests'])

async def follow(page,path):
    await page.evaluate('(path)=>{const a=document.createElement("a");a.href=path;document.body.append(a);a.click();a.remove()}',path)

async def committed(page,path):
    await page.wait_for_function('(path)=>new URL(document.querySelector("link[rel=canonical]").href).pathname===path',arg=path)

async def main():
    result={'fixture':'Real compiled dist HTML/assets served by Playwright interception at canonical HTTPS origin; no production fetch/write; no claims of new delivery-header validation','cases':[]}
    async with async_playwright() as p:
        executable=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or shutil.which('chromium') or shutil.which('chromium-browser')
        options={'headless':True,'args':['--no-sandbox']}
        if executable:options['executable_path']=executable
        browser=await p.chromium.launch(**options)
        ctx,page,state=await fixture(browser)
        await ready(page,'/botox');before=await page.locator('*').count()
        await page.wait_for_timeout(3000)
        case={'name':'focused idle retains independent content','guideRequests':guide_count(state),'nodesBefore':before,'nodesAfter':await page.locator('*').count(),'expanded':await page.locator('[data-guide-reader]').count(),'searchVisible':await page.locator('#guide-search-input').is_visible(),'h1':await page.locator('main h1').text_content()}
        assert case['guideRequests']==0 and case['expanded']==0 and case['searchVisible']
        assert case['nodesAfter']<1500 and not state['errors'],state['errors']
        assert not state['unexpectedRequests'],state['unexpectedRequests']
        await page.evaluate('scrollTo(0,500)');await page.wait_for_timeout(900)
        scroll=await page.evaluate('history.state?.__completeGuideScroll')
        assert scroll and scroll['y']>0,scroll
        case['focusedHistoryPosition']=scroll;result['cases'].append(case)
        headings=await page.locator('main h2[id],main h3[id],main h4[id]').evaluate_all('(nodes)=>nodes.map(n=>n.id)')
        await ready(page,'/botox#'+headings[0]);await page.wait_for_timeout(900)
        target=await page.locator('[id="'+headings[0]+'"]').evaluate('(n)=>({top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom})')
        assert guide_count(state)==0 and target['bottom']>0 and target['top']<844,target
        result['cases'].append({'name':'fresh same-document fragment stays focused','fragment':headings[0],'rect':target,'guideRequests':guide_count(state)})
        await ctx.close()

        ctx,page,state=await fixture(browser,delay=2)
        await ready(page,'/botox')
        await page.locator('#guide-search-input').focus()
        await page.locator('#guide-search-input').fill('ب')
        await page.wait_for_timeout(100)
        assert manifest_count(state)==0 and guide_count(state)==0
        await page.locator('#guide-search-input').dispatch_event('compositionstart')
        await page.locator('#guide-search-input').fill('بوتاکس')
        await page.wait_for_timeout(100)
        assert manifest_count(state)==0
        await page.locator('#guide-search-input').dispatch_event('compositionend')
        await page.locator('#guide-search-input').fill('بوتاکس')
        await page.locator('#guide-search-input').fill('فیلر')
        loading=await page.locator('#guide-search-status').text_content()
        assert await page.locator('#guide-search-results').is_hidden()
        assert await page.locator('#guide-search').get_attribute('aria-busy')=='true'
        await page.wait_for_function('document.querySelectorAll("#guide-search-results a").length>1')
        case={'name':'IME and short query stay idle; latest early query survives delayed manifest','loadingStatus':loading,'query':await page.locator('#guide-search-input').input_value(),'results':await page.locator('#guide-search-results a').count(),'status':await page.locator('#guide-search-status').text_content(),'guideRequests':guide_count(state),'manifestRequests':manifest_count(state),'expanded':await page.locator('[data-guide-reader]').count(),'errors':state['errors']}
        assert case['query']=='فیلر' and case['results']>1 and case['guideRequests']==0 and case['manifestRequests']==1 and case['expanded']==0 and not case['errors']
        assert 'فیلر' in await page.locator('#guide-search-results').text_content()
        assert await page.locator('#guide-search').get_attribute('aria-busy') is None
        result['cases'].append(case);await ctx.close()

        ctx,page,state=await fixture(browser,fail_guide=True,fail_home_fetch=True,fail_manifest=True)
        await ready(page,'/botox');await page.locator('#guide-search-input').fill('فیلر')
        await page.wait_for_function('document.querySelector("#guide-search-status").textContent.includes("انجام نشد")')
        error_status=await page.locator('#guide-search-status').text_content()
        assert await page.locator('#guide-search-results').is_hidden()
        assert await page.locator('[data-guide-reader]').count()==0
        state['failManifest']=False
        await page.locator('#guide-search-input').fill('فیلر لب')
        await page.wait_for_function('document.querySelectorAll("#guide-search-results a").length>0')
        assert await page.locator('#guide-search-input').input_value()=='فیلر لب'
        result['cases'].append({'name':'failure is explicit and typing retries latest query','errorStatus':error_status,'query':await page.locator('#guide-search-input').input_value(),'results':await page.locator('#guide-search-results a').count(),'guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['unexpectedRequests'],state['unexpectedRequests']
        assert guide_count(state)==0 and manifest_count(state)==2
        # An explicitly requested full-reader failure cannot disable Search or
        # focused native links, because neither shares the Guide promise.
        await page.locator('[data-guide-expand]').click()
        assert await page.evaluate('window.completeGuideReady') is False
        await page.locator('a[href="/upper-face-botox"]:visible').first.click()
        await page.wait_for_url(BASE+'/upper-face-botox')
        await page.wait_for_function('document.querySelector("link[rel=canonical]").href.endsWith("/upper-face-botox")')
        assert await page.locator('#guide-search-input').input_value()=='فیلر لب'
        assert await page.locator('[data-guide-reader]').count()==0
        result['cases'].append({'name':'Guide failure leaves Search query and focused navigation working','guideRequests':guide_count(state),'manifestRequests':manifest_count(state)})
        assert not state['errors'];await ctx.close()

        ctx,page,state=await fixture(browser)
        await ready(page,'/botox');await page.evaluate('window.fixtureSession="preserved"')
        state['delays']['/upper-face-botox']=.8
        await follow(page,'/upper-face-botox');await page.wait_for_timeout(150)
        assert page.url==BASE+'/botox',page.url
        assert (await page.locator('link[rel="canonical"]').get_attribute('href')).endswith('/botox')
        await committed(page,'/upper-face-botox')
        assert await page.evaluate('window.fixtureSession')=='preserved'
        await follow(page,'/botox');await committed(page,'/botox')
        state['delays']['/filler']=.7
        await follow(page,'/filler');await page.wait_for_timeout(80)
        await follow(page,'/thread-lift');await committed(page,'/thread-lift')
        await page.wait_for_timeout(850)
        assert page.url==BASE+'/thread-lift'
        assert (await page.locator('link[rel="canonical"]').get_attribute('href')).endswith('/thread-lift')
        assert await page.evaluate('window.fixtureSession')=='preserved'
        assert guide_count(state)==0
        result['cases'].append({'name':'validate destination before push and stale response cannot overwrite later destination','url':page.url,'guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        for corrupt in [False,True]:
            ctx,page,state=await fixture(browser);await ready(page,'/botox')
            await page.evaluate('window.fixtureSession="old-document"')
            state['corruptPaths' if corrupt else 'failPaths'].append('/upper-face-botox')
            await follow(page,'/upper-face-botox')
            await page.wait_for_url(BASE+'/upper-face-botox');await committed(page,'/upper-face-botox')
            assert await page.evaluate('window.fixtureSession') is None
            assert guide_count(state)==0
            result['cases'].append({'name':'signature mismatch uses native destination' if corrupt else 'failed focused fetch uses native destination','url':page.url,'errors':state['errors']})
            assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/botox')
        await page.locator('#guide-search-input').fill('فیلر لب')
        await page.wait_for_function('document.querySelectorAll("#guide-search-results a").length>0')
        await page.locator('[data-guide-expand]').click()
        assert await page.evaluate('window.completeGuideReady') is True
        assert await page.locator('[data-guide-reader]').count()==1
        assert await page.locator('[data-guide-return]:visible').count()==1
        assert await page.evaluate('new Set([...document.querySelectorAll("[id]")].map(n=>n.id)).size===document.querySelectorAll("[id]").length')
        assert await page.evaluate('history.state.__completeGuideMode')=='expanded'
        await follow(page,'/upper-face-botox');await committed(page,'/upper-face-botox')
        assert await page.locator('[data-guide-reader]').count()==1
        await page.locator('[data-guide-return]').click()
        assert await page.locator('[data-guide-reader]').count()==0
        assert await page.evaluate('history.state.__completeGuideMode')=='focused'
        assert await page.locator('#guide-search-input').input_value()=='فیلر لب'
        await page.go_back();await committed(page,'/botox')
        await page.wait_for_selector('[data-guide-reader]')
        assert await page.locator('#guide-search').count()==1 and await page.locator('main h1').count()==1
        assert guide_count(state)==1 and manifest_count(state)==1
        result['cases'].append({'name':'explicit expand-return and Back restore selected mode with one search/player tree','guideRequests':guide_count(state),'manifestRequests':manifest_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/botox')
        # This historical hash is owned by a different independent article.
        await follow(page,'/botox#duck-lips-from-filler-overcorrection')
        await committed(page,'/facial-filler-by-anatomic-area-and-cause')
        assert await page.locator('#duck-lips-from-filler-overcorrection').count()==1
        assert guide_count(state)==0 and manifest_count(state)==1
        await ready(page,'/botox#duck-lips-from-filler-overcorrection')
        await committed(page,'/facial-filler-by-anatomic-area-and-cause')
        assert page.url.endswith('#duck-lips-from-filler-overcorrection')
        await ready(page,'/botox#fixture-unknown-anchor')
        await page.wait_for_timeout(250)
        assert page.url==BASE+'/botox#fixture-unknown-anchor'
        assert guide_count(state)==0
        result['cases'].append({'name':'clicked and initial cross-owner hashes resolve; unknown hash retains native focused URL','guideRequests':guide_count(state),'manifestRequests':manifest_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        # A newer mode selection cancels a pending topic intent. Cancellation
        # must not be misclassified as network failure and native-navigate later.
        for mode in ['expand','return']:
            ctx,page,state=await fixture(browser);await ready(page,'/botox')
            await page.evaluate('window.fixtureSession="mode-wins"')
            if mode=='return':
                await page.locator('[data-guide-expand]').click()
                assert await page.evaluate('window.completeGuideReady') is True
            state['delays']['/upper-face-botox']=.8
            await follow(page,'/upper-face-botox');await page.wait_for_timeout(100)
            await page.locator('[data-guide-'+mode+']').click()
            if mode=='expand':assert await page.evaluate('window.completeGuideReady') is True
            await page.wait_for_timeout(950)
            assert page.url==BASE+'/botox'
            assert await page.evaluate('window.fixtureSession')=='mode-wins'
            assert await page.locator('[data-guide-reader]').count()==(1 if mode=='expand' else 0)
            result['cases'].append({'name':'newer '+mode+' mode supersedes pending topic without native fallback','url':page.url,'errors':state['errors']})
            assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        # Share the full-source download, but never reuse an invalidated page's
        # expansion transaction for the next focused page.
        ctx,page,state=await fixture(browser);await ready(page,'/botox')
        guide_path='/assets/'+next((DIST/'assets').glob('guide.*.json')).name
        state['delays'][guide_path]=1.5
        await page.locator('[data-guide-expand]').click()
        await follow(page,'/upper-face-botox');await committed(page,'/upper-face-botox')
        await page.locator('[data-guide-expand]').click()
        assert await page.evaluate('window.completeGuideReady') is True
        assert await page.locator('[data-guide-reader]').count()==1
        assert await page.locator('main article').get_attribute('aria-busy') is None
        assert guide_count(state)==1
        result['cases'].append({'name':'expansion after route change shares source request but commits newest page','url':page.url,'guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        # The compact lazy Home payload must also retain Home's interface copy.
        ctx,page,state=await fixture(browser);await ready(page,'/aesthetic-guide-en')
        await page.locator('[data-guide-expand]').click()
        assert await page.evaluate('window.completeGuideReady') is True
        await follow(page,'/');await committed(page,'/')
        assert await page.locator('html').get_attribute('lang')=='fa-IR'
        assert await page.locator('meta[name="guide-search-resource"]').count()==1
        assert MANIFEST.search(await page.locator('meta[name="guide-search-resource"]').get_attribute('content'))
        assert await page.locator('#guide-search').get_attribute('lang')=='fa-IR'
        assert await page.locator('#guide-search-input').get_attribute('placeholder')==home_search.placeholder
        await page.keyboard.press('Control+k')
        assert await page.locator('#guide-search-input').evaluate('(n)=>n===document.activeElement')
        await page.locator('#guide-search-input').fill('filler')
        await page.wait_for_function('document.querySelectorAll("#guide-search-results a").length>0')
        assert await page.locator('#guide-search-results .guide-search__result-title[lang="en"][dir="auto"]').count()>0
        await page.locator('#guide-search-input').press('Escape')
        assert await page.locator('#guide-search-input').input_value()==''
        assert await page.locator('#guide-search-results').is_hidden()
        result['cases'].append({'name':'lazy Home restores native Search locale and multilingual result labels/shortcut','guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/')
        assert await page.evaluate('window.guideReaderState().fullSourceStatus')=='ready'
        assert await page.evaluate('window.guideReaderState().readerMode')=='focused'
        await follow(page,'/botox');await committed(page,'/botox')
        assert await page.locator('[data-guide-reader]').count()==0
        assert await page.evaluate('window.guideReaderState().readerMode')=='focused'
        assert guide_count(state)==0
        result['cases'].append({'name':'Home full source availability does not opt a topic into expanded mode','errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/botox')
        await page.locator('main h1').evaluate('(n)=>{n.tabIndex=-1;n.focus({preventScroll:true})}')
        await page.evaluate('scrollTo(0,700)');await page.wait_for_timeout(900)
        old_position=await page.evaluate('({y:scrollY,focus:document.activeElement.id})')
        await follow(page,'/upper-face-botox');await committed(page,'/upper-face-botox')
        await page.wait_for_timeout(350)
        await page.go_back();await committed(page,'/botox');await page.wait_for_timeout(700)
        restored=await page.evaluate('({y:scrollY,focus:document.activeElement.id})')
        assert abs(old_position['y']-restored['y'])<80,{'before':old_position,'after':restored}
        assert old_position['focus']==restored['focus']
        await page.go_forward();await committed(page,'/upper-face-botox')
        assert await page.locator('main h1').count()==1 and guide_count(state)==0
        result['cases'].append({'name':'Back restores saved focused scroll/focus and Forward restores destination','saved':old_position,'restored':restored,'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/botox')
        await page.locator('[data-guide-expand]').click()
        assert await page.evaluate('window.completeGuideReady') is True
        await page.evaluate('window.fixtureSession="expanded-first-document"')
        await page.goto(BASE+'/filler',wait_until='domcontentloaded')
        await page.locator('#guide-search[data-mounted="true"]').wait_for()
        await page.go_back(wait_until='domcontentloaded')
        await page.wait_for_function('document.documentElement.dataset.readerMode==="expanded"')
        assert await page.evaluate('performance.getEntriesByType("navigation")[0].type')=='back_forward'
        assert await page.evaluate('window.fixtureSession') is None
        assert await page.locator('[data-guide-reader]').count()==1
        assert await page.locator('main h1').count()==1
        result['cases'].append({'name':'full-document Back restores explicitly selected expanded mode without BFCache','guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser,javascript=False)
        await page.goto(BASE+'/subcision-for-tethered-acne-scars',wait_until='domcontentloaded')
        assert await page.locator('main h1').count()==1
        assert 'انتخاب کاندید از معاینه اسکار' in await page.locator('main article').text_content()
        assert (await page.locator('[data-guide-expand]').get_attribute('href')).startswith('/#')
        native_link=page.locator('main a[href="/acne-scars#acne-scars-vs-post-acne-pigmentation"]').first
        assert await native_link.count()==1
        await native_link.click();await page.wait_for_url(BASE+'/acne-scars#acne-scars-vs-post-acne-pigmentation')
        assert await page.locator('main h1').count()==1 and guide_count(state)==0
        result['cases'].append({'name':'JavaScript-off standalone clinical content and real anchor links work','url':page.url,'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser);await ready(page,'/video-saeed-ghezelbash-subcision-technique?t=5')
        await page.wait_for_function('(()=>{const v=document.querySelector("main video");return v&&v.readyState>=2&&Math.abs(v.currentTime-5)<.2})()',timeout=15000)
        video_state=await page.locator('main video').evaluate('(v)=>({time:v.currentTime,paused:v.paused,focused:v===document.activeElement})')
        assert video_state['paused'] and video_state['focused']
        await page.locator('main video').press('Space')
        await page.wait_for_function('!document.querySelector("main video").paused')
        await page.evaluate('window.oldFixturePlayer=document.querySelector("main video")')
        await follow(page,'/botox');await committed(page,'/botox')
        assert await page.evaluate('window.oldFixturePlayer.paused')
        assert guide_count(state)==0
        result['cases'].append({'name':'timed watch entry seeks native media without autoplay and navigation pauses old player','video':video_state,'errors':state['errors']})
        assert not state['errors'] and not state['unexpectedRequests'];await ctx.close()

        ctx,page,state=await fixture(browser,delay=.1)
        await ready(page,'/botox')
        link=page.locator('a[href="/upper-face-botox"]:visible').first
        assert await link.count(), 'expected an existing native upper-face link'
        await link.click()
        await page.wait_for_url(BASE+'/upper-face-botox')
        await page.wait_for_function('document.querySelector("link[rel=canonical]").href.endsWith("/upper-face-botox")')
        title=await page.title();h1=await page.locator('main h1').text_content()
        assert 'بوتاکس' in h1 and await page.locator('main h1').count()==1
        await page.go_back()
        await page.wait_for_url(BASE+'/botox')
        await page.wait_for_function('document.querySelector("link[rel=canonical]").href.endsWith("/botox")')
        assert 'بوتاکس' in await page.locator('main h1').text_content()
        assert guide_count(state)==0 and manifest_count(state)==0
        result['cases'].append({'name':'native internal click and Back keep soft-navigation metadata','destinationTitle':title,'destinationH1':h1,'backUrl':page.url,'guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['unexpectedRequests'],state['unexpectedRequests']
        assert not state['errors'];await ctx.close()

        ctx,page,state=await fixture(browser,fail_guide=True,fail_home_fetch=True)
        await ready(page,'/botox');await page.locator('a[href="/upper-face-botox"]:visible').first.click()
        await page.wait_for_url(BASE+'/upper-face-botox');await page.locator('#guide-search[data-mounted="true"]').wait_for()
        assert 'بوتاکس' in await page.locator('main h1').text_content()
        assert await page.locator('[data-guide-reader]').count()==0
        assert guide_count(state)==0
        result['cases'].append({'name':'focused navigation has no full-reader dependency','url':page.url,'canonical':await page.locator('link[rel="canonical"]').get_attribute('href'),'guideRequests':guide_count(state),'errors':state['errors']})
        assert not state['unexpectedRequests'],state['unexpectedRequests']
        assert not state['errors'];await ctx.close()

        for path,lang,direction in [('/aesthetic-guide-en','en','ltr'),('/aesthetic-guide-ar-iq','ar-IQ','rtl'),('/aesthetic-guide-ckb-iq','ckb-IQ','rtl')]:
            ctx,page,state=await fixture(browser,delay=.2,fail_guide=True,fail_home_fetch=True,fail_manifest=True);await ready(page,'/botox')
            await page.evaluate('(path)=>{const a=document.createElement("a");a.href=path;document.body.append(a);a.click();a.remove()}',path)
            await page.wait_for_url(BASE+path)
            await page.wait_for_function('(lang)=>document.documentElement.lang===lang',arg=lang)
            actual=await page.locator('html').evaluate('(n)=>({lang:n.lang,dir:n.dir})')
            assert actual=={'lang':lang,'dir':direction},actual
            assert guide_count(state)==0 and await page.locator('[data-guide-reader]').count()==0
            assert not state['unexpectedRequests'],state['unexpectedRequests']
            assert not state['errors'];result['cases'].append({'name':'focused language entry','path':path,**actual,'guideRequests':guide_count(state),'errors':state['errors']})
            assert (await page.locator('#guide-search').get_attribute('lang'))==lang
            query,loading_prefix,error_prefix={'en':('filler','Preparing','Search'),'ar-IQ':('فيلر','جارٍ','تعذّر'),'ckb-IQ':('فیلەر','گەڕان','بارکردنی')}[lang]
            await page.locator('#guide-search-input').fill(query)
            localized_loading=await page.locator('#guide-search-status').text_content()
            assert localized_loading.startswith(loading_prefix),localized_loading
            await page.wait_for_function('document.querySelector("#guide-search").getAttribute("aria-busy")===null')
            localized_error=await page.locator('#guide-search-status').text_content()
            assert localized_error.startswith(error_prefix),localized_error
            state['failManifest']=False
            await page.locator('#guide-search-input').fill(query+' ')
            await page.wait_for_function('document.querySelectorAll("#guide-search-results a").length>0')
            assert (await page.locator('#guide-search-input').input_value()).strip()==query
            assert await page.locator('html').evaluate('(n)=>({lang:n.lang,dir:n.dir})')==actual
            assert not state['errors'] and not state['unexpectedRequests']
            result['cases'].append({'name':'localized loading/error and query-preserving retry','path':path,'loading':localized_loading,'error':localized_error,'guideRequests':guide_count(state),'errors':state['errors']})
            await ctx.close()
        await browser.close()
    result['passed']=len(result['cases'])
    if OUT:
        OUT.parent.mkdir(parents=True,exist_ok=True)
        OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2))

asyncio.run(main())
