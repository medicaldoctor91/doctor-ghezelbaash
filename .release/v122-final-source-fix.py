from pathlib import Path
import subprocess

raw=subprocess.check_output(['git','show','origin/main:.release/v122-final-source-fix-v2.py'],text=True)
compile(raw,'v122-final-source-fix-v2.py','exec')
exec(compile(raw,'v122-final-source-fix-v2.py','exec'),{'__name__':'__main__'})
