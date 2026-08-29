import json, re, subprocess, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

TARGET='https://www.ghezelbaash.ir/'
OUT=Path('/tmp/online-audit')
OUT.mkdir(exist_ok=True)

def body_text(driver):
    try:
        return driver.find_element(By.TAG_NAME,'body').text
    except Exception:
        return ''

def click_text(driver, pattern):
    rx=re.compile(pattern,re.I)
    for el in driver.find_elements(By.XPATH,"//button|//*[@role='button']"):
        try:
            text=(el.text or el.get_attribute('aria-label') or '').strip()
            if el.is_displayed() and el.is_enabled() and rx.search(text):
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});",el)
                driver.execute_script("arguments[0].click();",el)
                return text
        except Exception:
            pass
    return None

opts=Options()
opts.add_argument('--headless=new')
opts.add_argument('--no-sandbox')
opts.add_argument('--disable-dev-shm-usage')
opts.add_argument('--window-size=1440,1200')
opts.add_argument('--lang=en-US')
opts.add_argument('--disable-gpu')
driver=webdriver.Chrome(options=opts)
driver.set_page_load_timeout(60)
try:
    driver.get('https://search.google.com/test/rich-results')
    WebDriverWait(driver,30).until(lambda d: len(d.find_elements(By.CSS_SELECTOR,'input'))>0)
    candidates=[]
    for i,el in enumerate(driver.find_elements(By.CSS_SELECTOR,'input')):
        try:
            meta={k:el.get_attribute(k) for k in ('type','placeholder','aria-label','value')}
            meta['index']=i
            meta['displayed']=el.is_displayed()
            candidates.append(meta)
        except Exception:
            pass
    print('RRT_INPUTS='+json.dumps(candidates,ensure_ascii=False))
    chosen=None
    for el in driver.find_elements(By.CSS_SELECTOR,'input'):
        try:
            if not el.is_displayed() or not el.is_enabled():
                continue
            hint=' '.join(filter(None,[el.get_attribute('placeholder'),el.get_attribute('aria-label')])).lower()
            if 'url' in hint or 'url' in (el.get_attribute('type') or '').lower():
                chosen=el
                break
        except Exception:
            pass
    if chosen is None:
        chosen=next(el for el in driver.find_elements(By.CSS_SELECTOR,'input') if el.is_displayed() and el.is_enabled())
    chosen.clear()
    chosen.send_keys(TARGET)
    time.sleep(1)
    clicked=click_text(driver,r'(^|\b)(test url|url test|test)(\b|$)')
    print('RRT_CLICKED='+repr(clicked))
    if not clicked:
        raise RuntimeError('Could not locate Rich Results Test URL button')
    WebDriverWait(driver,180).until(lambda d: '/test/rich-results/result' in d.current_url and 'id=' in d.current_url)
    WebDriverWait(driver,180).until(lambda d: any(s in body_text(d).lower() for s in ['valid item','no items detected','invalid item','page is eligible','not eligible']))
    text=body_text(driver)
    url=driver.current_url
    OUT.joinpath('rich-results-url.txt').write_text(url+'\n',encoding='utf-8')
    OUT.joinpath('rich-results.txt').write_text(text,encoding='utf-8')
    driver.save_screenshot(str(OUT/'rich-results.png'))
    summary={
        'resultUrl':url,
        'crawledSuccessfully': bool(re.search(r'Crawled successfully',text,re.I)),
        'crawlAllowedYes': bool(re.search(r'Crawl allowed\?\s*Yes',text,re.I)),
        'pageFetchSuccessful': bool(re.search(r'Page fetch\s*Successful',text,re.I)),
        'indexingAllowedYes': bool(re.search(r'Indexing allowed\?\s*Yes',text,re.I)),
        'validItemLines': re.findall(r'([^\n]*?\b\d+ valid item(?:s)? detected[^\n]*)',text,re.I),
        'nonCriticalLines': [line for line in text.splitlines() if 'Non-critical' in line],
        'criticalLines': [line for line in text.splitlines() if re.search(r'critical issue|invalid item|error',line,re.I)],
        'detectedStructuredDataBlock': ''
    }
    m=re.search(r'Detected structured data\s*(.*?)(?:Additional resources|HTTP Response|$)',text,re.I|re.S)
    if m:
        summary['detectedStructuredDataBlock']=m.group(1).strip()[:12000]
    print('RRT_SUMMARY='+json.dumps(summary,ensure_ascii=False))
    print('RRT_TEXT_BEGIN')
    print(text[:20000])
    print('RRT_TEXT_END')
finally:
    driver.quit()

def curl_json(url,args):
    cmd=['curl','--silent','--show-error','--location','--max-time','120','--get',url]
    for k,v in args:
        cmd += ['--data-urlencode',f'{k}={v}']
    p=subprocess.run(cmd,text=True,capture_output=True)
    return p.returncode,p.stdout,p.stderr

rc,out,err=curl_json('https://validator.w3.org/nu/', [('doc',TARGET),('out','json')])
if rc==0:
    try:
        data=json.loads(out)
        msgs=data.get('messages') or []
        counts={}
        for x in msgs:
            counts[x.get('type','unknown')]=counts.get(x.get('type','unknown'),0)+1
        print('W3C_NU_SUMMARY='+json.dumps({'messageCount':len(msgs),'counts':counts,'messages':msgs[:40]},ensure_ascii=False))
        OUT.joinpath('w3c-nu.json').write_text(out,encoding='utf-8')
    except Exception as e:
        print('W3C_NU_PARSE_ERROR='+repr(e))
else:
    print('W3C_NU_FETCH_ERROR='+err.strip())

for strategy in ('mobile','desktop'):
    args=[('url',TARGET),('strategy',strategy),('category','PERFORMANCE'),('category','SEO'),('category','ACCESSIBILITY'),('category','BEST_PRACTICES')]
    rc,out,err=curl_json('https://www.googleapis.com/pagespeedonline/v5/runPagespeed',args)
    if rc!=0:
        print(f'PSI_{strategy.upper()}_FETCH_ERROR='+err.strip())
        continue
    try:
        data=json.loads(out)
        if 'error' in data:
            print(f'PSI_{strategy.upper()}_API_ERROR='+json.dumps(data['error'],ensure_ascii=False))
            continue
        lr=data.get('lighthouseResult') or {}
        cats=lr.get('categories') or {}
        audits=lr.get('audits') or {}
        field=data.get('loadingExperience') or {}
        report={
            'strategy':strategy,
            'finalUrl':lr.get('finalUrl'),
            'lighthouseVersion':lr.get('lighthouseVersion'),
            'scores':{k:round((v.get('score') or 0)*100) for k,v in cats.items()},
            'fieldOverallCategory':field.get('overall_category'),
            'fieldMetrics':field.get('metrics'),
            'coreAudits':{
                k:{'score':audits.get(k,{}).get('score'),'displayValue':audits.get(k,{}).get('displayValue'),'numericValue':audits.get(k,{}).get('numericValue')}
                for k in ('largest-contentful-paint','interaction-to-next-paint','cumulative-layout-shift','first-contentful-paint','speed-index','total-blocking-time','server-response-time')
            },
            'failedAudits':[
                {'id':k,'title':v.get('title'),'score':v.get('score'),'displayValue':v.get('displayValue')}
                for k,v in audits.items()
                if isinstance(v,dict) and v.get('score') is not None and v.get('score') < 0.9
            ][:60]
        }
        print(f'PSI_{strategy.upper()}_SUMMARY='+json.dumps(report,ensure_ascii=False))
        OUT.joinpath(f'pagespeed-{strategy}.json').write_text(out,encoding='utf-8')
    except Exception as e:
        print(f'PSI_{strategy.upper()}_PARSE_ERROR='+repr(e))
