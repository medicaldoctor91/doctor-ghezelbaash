import json, re, subprocess, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

TARGET='https://www.ghezelbaash.ir/'
OUT=Path('/tmp/online-audit'); OUT.mkdir(exist_ok=True)

def body_text(driver):
    try: return driver.find_element(By.TAG_NAME,'body').text
    except Exception: return ''

def save_rrt(driver,label):
    text=body_text(driver)
    OUT.joinpath(f'rrt-{label}.txt').write_text(text,encoding='utf-8')
    OUT.joinpath(f'rrt-{label}.html').write_text(driver.page_source,encoding='utf-8')
    OUT.joinpath(f'rrt-{label}-url.txt').write_text(driver.current_url+'\n',encoding='utf-8')
    try: driver.save_screenshot(str(OUT/f'rrt-{label}.png'))
    except Exception: pass
    return text

def click_text(driver,pattern):
    rx=re.compile(pattern,re.I)
    for el in driver.find_elements(By.XPATH,"//button|//*[@role='button']"):
        try:
            text=(el.text or el.get_attribute('aria-label') or '').strip()
            if el.is_displayed() and el.is_enabled() and rx.search(text):
                driver.execute_script("arguments[0].scrollIntoView({block:'center'});",el)
                driver.execute_script("arguments[0].click();",el)
                return text
        except Exception: pass
    return None

def rrt_summary(text,url):
    lines=[x.strip() for x in text.splitlines() if x.strip()]
    detected=''
    m=re.search(r'Detected structured data\s*(.*?)(?:Additional resources|HTTP Response|VIEW TESTED PAGE|$)',text,re.I|re.S)
    if m: detected=m.group(1).strip()[:16000]
    return {
      'resultUrl':url,
      'pageEligible':bool(re.search(r'Page is eligible for rich results|eligible for rich results',text,re.I)),
      'noItems':bool(re.search(r'No items detected',text,re.I)),
      'crawledSuccessfully':bool(re.search(r'Crawled successfully',text,re.I)),
      'crawlAllowedYes':bool(re.search(r'Crawl allowed\?\s*Yes',text,re.I)),
      'pageFetchSuccessful':bool(re.search(r'Page fetch\s*Successful',text,re.I)),
      'indexingAllowedYes':bool(re.search(r'Indexing allowed\?\s*Yes',text,re.I)),
      'validItemLines':[x for x in lines if re.search(r'\b\d+ valid item(?:s)? detected\b',x,re.I)],
      'invalidItemLines':[x for x in lines if re.search(r'\b\d+ invalid item|invalid item',x,re.I)],
      'nonCriticalLines':[x for x in lines if re.search(r'non-critical',x,re.I)],
      'criticalLines':[x for x in lines if re.search(r'critical issue',x,re.I)],
      'challengeLines':[x for x in lines if re.search(r'captcha|robot|verify|unusual traffic|try again later|quota',x,re.I)],
      'errorLikeLines':[x for x in lines if re.search(r'something went wrong|could not|cannot|failed|error|problem',x,re.I)][:40],
      'detectedStructuredDataBlock':detected,
    }

def run_rrt():
    opts=Options()
    for arg in ('--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1440,1400','--lang=en-US','--disable-gpu'):
        opts.add_argument(arg)
    opts.set_capability('goog:loggingPrefs',{'browser':'ALL','performance':'ALL'})
    driver=webdriver.Chrome(options=opts); driver.set_page_load_timeout(60)
    try:
        driver.get('https://search.google.com/test/rich-results')
        WebDriverWait(driver,30).until(lambda d:any(e.is_displayed() for e in d.find_elements(By.CSS_SELECTOR,'input')))
        inputs=[]
        for i,el in enumerate(driver.find_elements(By.CSS_SELECTOR,'input')):
            try: inputs.append({'index':i,'type':el.get_attribute('type'),'aria-label':el.get_attribute('aria-label'),'displayed':el.is_displayed()})
            except Exception: pass
        print('RRT_INPUTS='+json.dumps(inputs,ensure_ascii=False))
        chosen=None
        for el in driver.find_elements(By.CSS_SELECTOR,'input'):
            try:
                if el.is_displayed() and el.is_enabled() and ('url' in ((el.get_attribute('aria-label') or '')+' '+(el.get_attribute('type') or '')).lower()):
                    chosen=el; break
            except Exception: pass
        if chosen is None: raise RuntimeError('No visible URL input')
        chosen.clear(); chosen.send_keys(TARGET); time.sleep(1)
        clicked=click_text(driver,r'(^|\b)(test url|url test|test)(\b|$)')
        print('RRT_CLICKED='+repr(clicked))
        if not clicked: raise RuntimeError('Could not locate TEST URL button')
        terminal=[
          r'Page is eligible for rich results',r'No items detected',r'invalid item',r'Detected structured data',
          r'Something went wrong',r'could not be reached',r'URL is not available',r'unusual traffic',r'captcha',r'verify you are not a robot'
        ]
        last=''; final=''; terminal_hit=None
        start=time.time(); next_snapshot=0
        while time.time()-start < 240:
            elapsed=int(time.time()-start); text=body_text(driver)
            compact=re.sub(r'\s+',' ',text)[:1200]
            if compact!=last and (elapsed<20 or elapsed%15<3):
                print(f'RRT_STATE t={elapsed}s url={driver.current_url!r} body={compact!r}')
                last=compact
            if elapsed>=next_snapshot:
                save_rrt(driver,f't{elapsed:03d}'); next_snapshot+=30
            for pat in terminal:
                if re.search(pat,text,re.I): terminal_hit=pat; final=text; break
            if terminal_hit: break
            time.sleep(3)
        if not final: final=save_rrt(driver,'timeout')
        else: save_rrt(driver,'final')
        summary=rrt_summary(final,driver.current_url); summary['terminalPattern']=terminal_hit; summary['elapsedSeconds']=round(time.time()-start,1)
        print('RRT_SUMMARY='+json.dumps(summary,ensure_ascii=False))
        print('RRT_TEXT_BEGIN\n'+final[:30000]+'\nRRT_TEXT_END')
        try:
            browser_logs=driver.get_log('browser'); OUT.joinpath('rrt-browser-console.json').write_text(json.dumps(browser_logs,ensure_ascii=False,indent=2),encoding='utf-8')
            print('RRT_BROWSER_LOGS='+json.dumps(browser_logs[-20:],ensure_ascii=False))
        except Exception as e: print('RRT_BROWSER_LOG_ERROR='+repr(e))
        return summary
    except Exception as e:
        try:
            text=save_rrt(driver,'exception')
            print('RRT_EXCEPTION_STATE='+json.dumps({'error':repr(e),'url':driver.current_url,'body':text[:12000]},ensure_ascii=False))
        except Exception: print('RRT_EXCEPTION='+repr(e))
        return {'harnessError':repr(e)}
    finally: driver.quit()

def curl_json(url,args):
    cmd=['curl','--silent','--show-error','--location','--max-time','120','--get',url]
    for k,v in args: cmd += ['--data-urlencode',f'{k}={v}']
    p=subprocess.run(cmd,text=True,capture_output=True)
    return p.returncode,p.stdout,p.stderr

def run_w3c():
    rc,out,err=curl_json('https://validator.w3.org/nu/',[('doc',TARGET),('out','json')])
    if rc: print('W3C_NU_FETCH_ERROR='+err.strip()); return
    try:
        data=json.loads(out); msgs=data.get('messages') or []; counts={}
        for x in msgs: counts[x.get('type','unknown')]=counts.get(x.get('type','unknown'),0)+1
        report={'messageCount':len(msgs),'counts':counts,'messages':msgs[:80]}
        print('W3C_NU_SUMMARY='+json.dumps(report,ensure_ascii=False)); OUT.joinpath('w3c-nu.json').write_text(out,encoding='utf-8')
    except Exception as e: print('W3C_NU_PARSE_ERROR='+repr(e)+' RAW='+out[:1000])

def run_psi(strategy):
    args=[('url',TARGET),('strategy',strategy),('category','PERFORMANCE'),('category','SEO'),('category','ACCESSIBILITY'),('category','BEST_PRACTICES')]
    rc,out,err=curl_json('https://www.googleapis.com/pagespeedonline/v5/runPagespeed',args)
    if rc: print(f'PSI_{strategy.upper()}_FETCH_ERROR='+err.strip()); return
    try:
        data=json.loads(out)
        if 'error' in data: print(f'PSI_{strategy.upper()}_API_ERROR='+json.dumps(data['error'],ensure_ascii=False)); return
        lr=data.get('lighthouseResult') or {}; cats=lr.get('categories') or {}; audits=lr.get('audits') or {}; field=data.get('loadingExperience') or {}
        report={'strategy':strategy,'finalUrl':lr.get('finalUrl'),'lighthouseVersion':lr.get('lighthouseVersion'),'scores':{k:round((v.get('score') or 0)*100) for k,v in cats.items()},'fieldOverallCategory':field.get('overall_category'),'fieldMetrics':field.get('metrics'),'coreAudits':{k:{'score':audits.get(k,{}).get('score'),'displayValue':audits.get(k,{}).get('displayValue'),'numericValue':audits.get(k,{}).get('numericValue')} for k in ('largest-contentful-paint','interaction-to-next-paint','cumulative-layout-shift','first-contentful-paint','speed-index','total-blocking-time','server-response-time')},'failedAudits':[{'id':k,'title':v.get('title'),'score':v.get('score'),'displayValue':v.get('displayValue')} for k,v in audits.items() if isinstance(v,dict) and v.get('score') is not None and v.get('score')<0.9][:80]}
        print(f'PSI_{strategy.upper()}_SUMMARY='+json.dumps(report,ensure_ascii=False)); OUT.joinpath(f'pagespeed-{strategy}.json').write_text(out,encoding='utf-8')
    except Exception as e: print(f'PSI_{strategy.upper()}_PARSE_ERROR='+repr(e)+' RAW='+out[:1000])

rrt=run_rrt()
run_w3c()
for strategy in ('mobile','desktop'): run_psi(strategy)
OUT.joinpath('summary.json').write_text(json.dumps({'target':TARGET,'rrt':rrt},ensure_ascii=False,indent=2),encoding='utf-8')
