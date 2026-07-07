---
path: "/kg/"
title: "گراف دانش دکتر سعید قزلباش | Knowledge Graph Hub"
canonical: "https://www.ghezelbaash.ir/kg/"
description: "هاب انسانی و ماشین‌خوان گراف دانش دکتر سعید قزلباش، شامل گراف JSON-LD، فیدهای داده، llms.txt، سرویس‌ها، sameAs و مسیرهای اصلی هویت پزشک و کلینیک."
ogImagePath: "/images/og-default.jpg"
---

## دارایی‌های اصلی گراف دانش

این صفحه هاب انسانی و ماشین‌خوان گراف دانش سایت است. تمام خروجی‌های اصلی باید از Content Collections پروژه ساخته شوند، نه از فایل‌های خام جدا از معماری Astro.

- [گراف کانونیکال JSON-LD](/graph.json)
- [نام legacy گراف JSON-LD](/graph-ghezelbaash-final.jsonld)
- [فهرست مرکزی داده‌ها](/data/index.json)
- [نسخه legacy دیتاست](/dataset.json)
- [داده خدمات](/services.json)
- [sameAs و پروفایل‌ها](/sameas.json)
- [Brand KB](/brand-kb.ghezelbaash.ai-public.json)
- [Entity hardening index](/entity-hardening-index.json)

## لایه‌های پشتیبان

- [location.json](/location.json)
- [regulatory.json](/regulatory.json)
- [research.json](/research.json)
- [authority-signals.json](/authority-signals.json)
- [profile-links.json](/profile-links.json)
- [service-taxonomy.json](/service-taxonomy.json)
- [llms.txt](/llms.txt)
- [llms-full.txt](/llms-full.txt)
- [sitemap.xml](/sitemap.xml)

## مسیرهای انسانی مرتبط

- [صفحه اصلی پزشک](/)
- [صفحه دکتر و کلینیک](/dr-saeed-ghezelbash-aesthetic-clinic/)
- [بوتاکس در کرمانشاه](/botox-kermanshah/)
- [فیلر در کرمانشاه](/filler-kermanshah/)
- [لیفت نخ در کرمانشاه](/thread-lift-kermanshah/)
- [جوانسازی پوست و مو در کرمانشاه](/aesthetic-concerns-kermanshah/)

## سیاست منبع داده

گراف اصلی از `src/content/graph-sources/entity-registry-source.json` و `src/content/page-structured-data/*.json` تولید می‌شود. فیدهای ماشین‌خوان از `src/content/aeo-data/*.json` و فایل‌های LLM از `src/content/llms/*.json` تولید می‌شوند.
