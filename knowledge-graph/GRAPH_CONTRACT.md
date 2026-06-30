# Graph Contract - دکتر سعید قزلباش

این سند قرارداد کیفیت و ساختار گراف دانش است.

## اصول غیرقابل نقض
- هیچ auto-fix روی sameAs، هویت پزشک/کلینیک، ادعاهای پزشکی و روابط provider انجام نشود.
- داور اصلی همیشه SHACL + SPARQL + RDF parser باشد.
- همه تغییرات از طریق فرم‌های GitHub Issue و PR با quality check انجام شود.

## لایه‌ها
- source/ : گراف پایه
- shacl/ : قوانین اعتبارسنجی
- sparql/ : audit و گزارش
- reports/ : خروجی‌های خودکار

## ابزارهای مجاز در CI
- rdflib
- pyshacl
- networkx
- SPARQL
