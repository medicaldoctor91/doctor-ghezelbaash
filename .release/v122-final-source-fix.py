import subprocess

raw=subprocess.check_output(['git','show','origin/main:.release/v122-final-source-fix-v2.py'],text=True)
old="pat=re.compile(rf'\\b(?:inv|invariants)\\s*\\.\\s*{re.escape(key)}\\b');refs=[]"
new="pat=re.compile(rf'(?<![A-Za-z0-9_.])(?:inv|invariants)\\s*\\.\\s*{re.escape(key)}\\b');refs=[]"
if raw.count(old)!=1:
    raise SystemExit(f'v2 invariant-reference patch anchor drift: {raw.count(old)}')
raw=raw.replace(old,new)
compile(raw,'v122-final-source-fix-v2.py','exec')
exec(compile(raw,'v122-final-source-fix-v2.py','exec'),{'__name__':'__main__'})
