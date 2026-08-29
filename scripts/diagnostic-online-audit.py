import json, re, subprocess, time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait

TARGET='https://www.ghezelbaash.ir/'
OUT=Path('/tmp/online-audit'); OUT.mkdir(exist_ok=True)

def body_text(d):
    try:return d.find_element(By.TAG_NAME,'body').text
    except Exception:return ''

def save(d,label):
    text=body_text(d)
    OUT.joinpath(f'rrt-{label}.txt').write_text(text,encoding='utf-8')
    OUT.joinpath(f'rrt-{label}.html').write_text(d.page_source,encoding='utf-8')
    OUT.joinpath(f'rrt-{label}-url.txt').write_text(d.current_url+'\n',encoding='utf-8')
    try:d.save_screenshot(str(OUT/f'rrt-{label}.png'))
    except Exception:pass
    return text

def fetch_live_html():
    p=subprocess.run(['curl','--silent','--show-error','--location','--max-time','90','--user-agent','Mozilla/5.0 Chrome/151','--write-out','\n__HTTP__%{http_code}','--',TARGET],text=True,capture_output=True)
    if p.returncode:raise RuntimeError('live HTML fetch failed: '+p.stderr.strip())
    body,sep,status=p.stdout.rpartition('\n__HTTP__')
    if sep=='' or status.strip()!='200':raise RuntimeError(f'live HTML HTTP status={status!r}')
    OUT.joinpath('production-live.html').write_text(body,encoding='utf-8')
    print('LIVE_HTML='+json.dumps({'chars':len(body),'bytes':len(body.encode())}))
    return body

def summarize(text,url):
    lines=[x.strip() for x in text.splitlines() if x.strip()]
    return {
      'resultUrl':url,
      'eligible':bool(re.search(r'Page is eligible for rich results|eligible for rich results',text,re.I)),
      'validItems':[x for x in lines if re.search(r'\b\d+ valid item(?:s)? detected\b',x,re.I)],
      'invalidItems':[x for x in lines if re.search(r'\b\d+ invalid item(?:s)? detected\b|invalid item',x,re.I)],
      'critical':[x for x in lines if re.search(r'critical issue',x,re.I)],
      'nonCritical':[x for x in lines if re.search(r'non-critical',x,re.I)],
      'detectedTypes':[x for x in lines if re.search(r'Profile page|Video|Local business|Organization|Dataset|Image metadata|Article|Event|Course|Breadcrumb|Review snippet|FAQ',x,re.I)][:120],
      'errors':[x for x in lines if re.search(r'something went wrong|could not|cannot|failed|error|problem|log in',x,re.I)][:40]
    }

html=fetch_live_html()
opts=Options()
for arg in ('--headless=new','--no-sandbox','--disable-dev-shm-usage','--window-size=1600,1600','--lang=en-US','--disable-gpu'):opts.add_argument(arg)
opts.set_capability('goog:loggingPrefs',{'browser':'ALL'})
d=webdriver.Chrome(options=opts);d.set_page_load_timeout(60)
summary={}
try:
    d.get('https://search.google.com/test/rich-results')
    WebDriverWait(d,30).until(lambda x:'Rich Results Test' in body_text(x))
    tabs=d.find_elements(By.XPATH,"//*[@role='tab']")
    print('RRT_TABS='+json.dumps([{'text':t.text,'selected':t.get_attribute('aria-selected'),'tag':t.tag_name} for t in tabs],ensure_ascii=False))
    code=next((t for t in tabs if (t.text or '').strip().upper().endswith('CODE')),None)
    if code is None:raise RuntimeError('CODE role=tab not found')
    d.execute_script("arguments[0].scrollIntoView({block:'center'});arguments[0].click();",code)
    print('RRT_CODE_TAB_CLICKED='+repr(code.text))
    WebDriverWait(d,30).until(lambda x:any(e.is_displayed() for e in x.find_elements(By.CSS_SELECTOR,'.CodeMirror')))
    result=d.execute_script("""
      const html=arguments[0];
      const editors=[...document.querySelectorAll('.CodeMirror')].filter(e=>e.offsetParent!==null);
      for(const el of editors){
        if(el.CodeMirror){el.CodeMirror.setValue(html);el.CodeMirror.focus();return {ok:true,mode:'CodeMirror',length:el.CodeMirror.getValue().length};}
        const ta=el.querySelector('textarea');
        if(ta){const s=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;s.call(ta,html);ta.dispatchEvent(new Event('input',{bubbles:true}));ta.dispatchEvent(new Event('change',{bubbles:true}));return {ok:true,mode:'textarea',length:ta.value.length};}
      }
      return {ok:false};
    """,html)
    print('RRT_CODE_SET='+json.dumps(result))
    if not result or not result.get('ok') or result.get('length')!=len(html):raise RuntimeError('full HTML not set')
    d.execute_script("document.body.click()")
    def test_button(x):
        for e in x.find_elements(By.XPATH,"//button|//*[@role='button']"):
            try:
                if (e.text or '').strip().upper().endswith('TEST CODE') and e.is_displayed() and e.get_attribute('aria-disabled')!='true':return e
            except Exception:pass
        return False
    btn=WebDriverWait(d,30).until(test_button)
    d.execute_script("arguments[0].scrollIntoView({block:'center'});arguments[0].click();",btn)
    print('RRT_TEST_CODE_CLICKED='+repr(btn.text))
    terminal=[r'Page is eligible for rich results',r'No items detected',r'invalid item',r'Detected structured data',r'Something went wrong',r'log in and try again']
    start=time.time();hit=None
    while time.time()-start<180:
        text=body_text(d)
        hit=next((p for p in terminal if re.search(p,text,re.I)),None)
        if hit:break
        time.sleep(2)
    text=save(d,'code-final')
    summary=summarize(text,d.current_url);summary.update({'terminal':hit,'elapsed':round(time.time()-start,1),'inputBytes':len(html.encode())})
    print('RRT_CODE_SUMMARY='+json.dumps(summary,ensure_ascii=False))
    print('RRT_CODE_TEXT_BEGIN\n'+text[:40000]+'\nRRT_CODE_TEXT_END')
except Exception as e:
    text=save(d,'code-exception')
    summary={'harnessError':repr(e),'url':d.current_url,'body':text[:12000]}
    print('RRT_CODE_EXCEPTION='+json.dumps(summary,ensure_ascii=False))
finally:
    try:
        OUT.joinpath('rrt-console.json').write_text(json.dumps(d.get_log('browser'),ensure_ascii=False,indent=2),encoding='utf-8')
    except Exception:pass
    d.quit()
OUT.joinpath('summary.json').write_text(json.dumps({'target':TARGET,'rrtCode':summary},ensure_ascii=False,indent=2),encoding='utf-8')
