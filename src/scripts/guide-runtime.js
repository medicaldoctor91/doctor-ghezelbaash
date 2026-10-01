(async () => {
  if (window.completeGuideReady) await window.completeGuideReady;
  const d=document,s=d.documentElement;
  s.classList.add("js");
  const clinicFaDigits='۰۱۲۳۴۵۶۷۸۹',clinicAscii=(value)=>String(value||'').replace(/[۰-۹]/g,(digit)=>String(clinicFaDigits.indexOf(digit))),clinicWeekday=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tehran',weekday:'short'}),clinicClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}),syncClinicHours=()=>{const now=new Date(),day=clinicWeekday.format(now),[hour,minute]=clinicClock.format(now).split(':').map(Number),currentMinutes=hour*60+minute;for(const node of d.querySelectorAll('[data-clinic-open-status]')){const openFa=node.dataset.open||'',closeFa=node.dataset.close||'',openMinutes=Number(clinicAscii(openFa))*60,closeMinutes=Number(clinicAscii(closeFa))*60;if(!Number.isFinite(openMinutes)||!Number.isFinite(closeMinutes))continue;const isFriday=day==='Fri',isOpen=!isFriday&&currentMinutes>=openMinutes&&currentMinutes<closeMinutes,label=node.querySelector('[data-clinic-open-status-label]'),detail=node.querySelector('[data-clinic-open-status-detail]');node.dataset.state=isOpen?'open':'closed';if(label)label.textContent=isOpen?'اکنون باز است':'اکنون بسته است';if(!detail)continue;if(isOpen)detail.textContent=`تا ساعت ${closeFa}`;else if(isFriday||(day==='Thu'&&currentMinutes>=closeMinutes))detail.textContent=`بازگشایی شنبه ${openFa}`;else if(currentMinutes<openMinutes)detail.textContent=`امروز از ${openFa}`;else detail.textContent=`فردا از ${openFa}`}};
  syncClinicHours();setInterval(syncClinicHours,60000);
  const norm=createGuideSearch().normalize,
    search=d.getElementById("guide-search"),input=d.getElementById("guide-search-input"),results=d.getElementById("guide-search-results"),status=d.getElementById("guide-search-status"),launcher=d.querySelector("[data-guide-search-open]"),top=d.querySelector("[data-quick-actions-top]"),
    contentRouteAliases=JSON.parse(search?.dataset.contentRouteAliases||"{}"),
    plainClick=(e)=>e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey,
    targetFromPath=(pathname)=>{let decoded;try{decoded=decodeURI(pathname)}catch{return null}const key=Object.hasOwn(contentRouteAliases,decoded)?decoded:decoded.replace(/\/$/,""),route=contentRouteAliases[key]||decoded;if(route==="/")return d.getElementById("main-content");if(!/^\/[A-Za-z0-9][A-Za-z0-9._-]*\/?$/.test(route))return null;return d.getElementById(route.replace(/^\/|\/$/g,""))};
  const searchReady=Boolean(search&&input&&results&&status&&(launcher||s.dataset?.routeView==="focused"));
  if(searchReady){if(launcher)launcher.replaceWith(search);else d.querySelector("article.medical-guide")?.before(search);search.dataset.mounted="true"}

  const intentTargets=Object.fromEntries(Object.entries(JSON.parse(search?.dataset.intentTargets||"{}")).map(([intent,url])=>[intent,new URL(url).pathname.slice(1)])),
    intentAnswers=Object.fromEntries(Object.entries(JSON.parse(search?.dataset.intentHeadings||"{}")).map(([intent,heading])=>[heading,intentTargets[intent]])),
    copy=JSON.parse(search?.dataset.copy||"{}"),
    detectIntent=(text,entity)=>{const has=(x)=>text.includes(x),select=entity||/(بهترین|دکتر|پزشک|متخصص|کلینیک)/u.test(text);if((has("میگرن")||has("سردرد"))&&has("بوتاکس"))return"migraine-botox";if(has("نظر دوم")||has("نظر پزشکی دوم"))return"second-opinion";if(/اورفیل|بیش از حد فیلر|صورت پر شده|پرونده پیچیده/u.test(text))return"complex-correction";if(/اصلاح|ترمیم|نتیجه نامطلوب/u.test(text))return"revision";if(!select)return null;if(/فیلر|ژل/u.test(text))return"filler";if(/بوتاکس|بوتولینوم/u.test(text))return"botox";if(/زیبایی|جوانسازی|جوان سازی/u.test(text))return"aesthetic-physician";return null},
    searchEngine=createGuideSearch({aliases:(search?.dataset.entityAliases||"").split("|"),stopWords:copy.stopWords,synonyms:copy.synonyms,detectIntent}),
    queryInfo=searchEngine.queryInfo;

  let index;
  const build=()=>{if(index)return index;const stack=[];return(index=searchEngine.build([...d.querySelectorAll("main h1[id],main h2[id],main h3[id],main h4[id],main h5[id],main h6[id]")].map((h)=>{const text=h.textContent.trim(),level=Number(h.tagName.slice(1)),parents=[];for(let l=1;l<level;l++)if(stack[l])parents.push(stack[l]);stack[level]=text;stack.length=level+1;return{id:h.id,text,level,parents,answer:intentAnswers[h.id]||"",retrievalAlias:h.dataset.retrievalAlias||""}})))},
    score=searchEngine.score,
    closeResults=()=>{results.hidden=true},
    render=()=>{const q=queryInfo(input.value);results.replaceChildren();if(q.original.length<2){closeResults();status.textContent=copy.minimumQuery;return}const target=q.intent&&intentTargets[q.intent],hits=build().map((x)=>({...x,rank:score(x,q)})).filter((x)=>x.rank<99||(target&&x.answer===target)).sort((a,b)=>(b.answer===target)-(a.answer===target)||a.rank-b.rank||a.level-b.level||a.text.length-b.text.length).slice(0,16);if(!hits.length){const li=d.createElement("li");li.className="guide-search__empty";li.textContent=copy.empty;results.append(li)}else for(const hit of hits){const li=d.createElement("li"),a=d.createElement("a"),title=d.createElement("span"),context=d.createElement("span");a.href="/"+(target&&hit.answer===target?target:hit.id);title.className="guide-search__result-title";title.textContent=hit.text;a.append(title);const path=hit.parents.slice(-2).join(" ← ");if(path){context.className="guide-search__result-context";context.textContent=path;a.append(context)}li.append(a);results.append(li)}results.hidden=false;status.textContent=hits.length?copy.resultCount.replace("{count}",String(hits.length)):copy.noResultsStatus};

  if(searchReady){
    if(/Mac|iPhone|iPad/.test(navigator.userAgent))search.querySelector("kbd").textContent="⌘ K";
    input.addEventListener("input",render);
    input.addEventListener("focus",()=>{if(norm(input.value).length>=2)render()});
    input.addEventListener("keydown",(event)=>{
      if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      if(event.key==="Escape"){
        event.preventDefault();input.value="";closeResults();status.textContent=copy.cleared;
      }else if(["ArrowDown","ArrowUp","Enter"].includes(event.key)){
        if(results.hidden)render();
        const links=results.querySelectorAll("a");
        if(!links.length)return;
        event.preventDefault();
        if(event.key==="Enter")links[0].click();
        else links[event.key==="ArrowUp"?links.length-1:0].focus();
      }
    });
    results.addEventListener("keydown",(event)=>{
      if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
      const links=[...results.querySelectorAll("a")],current=links.indexOf(d.activeElement);
      if(current<0)return;
      let next;
      if(event.key==="Escape"){event.preventDefault();input.focus();closeResults();return}
      if(event.key==="ArrowDown")next=links[Math.min(current+1,links.length-1)];
      if(event.key==="ArrowUp")next=current?links[current-1]:input;
      if(event.key==="Home")next=links[0];
      if(event.key==="End")next=links.at(-1);
      if(next){event.preventDefault();next.focus()}
    });
    search.addEventListener("focusout",()=>requestAnimationFrame(()=>{if(!search.contains(d.activeElement))closeResults()}));
    d.addEventListener("pointerdown",(event)=>{if(!search.contains(event.target))closeResults()});
  }
  d.addEventListener("keydown",(event)=>{
    if(searchReady&&!event.defaultPrevented&&!event.isComposing&&!event.altKey&&!event.shiftKey&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
      event.preventDefault();input.focus();input.select();
    }
  });
  let topFrame = 0,
    topHideTimer,
    topVisible;
  const setTopVisible = (visible) => {
      if (!top || visible === topVisible) return;
      topVisible = visible;
      clearTimeout(topHideTimer);
      if (visible) {
        top.hidden = false;
        top.removeAttribute("aria-hidden");
        top.removeAttribute("tabindex");
        requestAnimationFrame(() => {
          if (topVisible) top.dataset.visible = "true";
        });
        return;
      }
      top.dataset.visible = "false";
      top.setAttribute("aria-hidden", "true");
      top.tabIndex = -1;
      topHideTimer = setTimeout(() => {
        if (!topVisible) top.hidden = true;
      }, 180);
    },
    syncTop = () => {
      if (topFrame) return;
      topFrame = requestAnimationFrame(() => {
        topFrame = 0;
        setTopVisible(scrollY > Math.max(960, innerHeight * 1.2) || d.activeElement === top);
      });
    };
  addEventListener("scroll", syncTop, { passive: true });
  addEventListener("resize", syncTop, { passive: true });
  addEventListener("pageshow", syncTop);
  top?.addEventListener("blur", syncTop);

  let tocLinks, targetChunk, currentTocLink;
  const syncTarget = (target=targetFromPath(location.pathname)) => {
    const chunk = target?.closest(".render-chunk");
    if (targetChunk !== chunk) {
      targetChunk?.classList.remove("is-target-chunk");
      chunk?.classList.add("is-target-chunk");
      targetChunk = chunk;
    }
    const section = target?.closest(".content-section"),
      current =
        target &&
        (tocLinks ??= [
          ...d.querySelectorAll(
            '#aesthetic-medicine-table-of-contents a[href]',
          ),
        ]).find(
          (link) => link.pathname.replace(/\/$/, "") === "/" + (section?.id || target?.id),
        );
    if (currentTocLink !== current) {
      currentTocLink?.removeAttribute("aria-current");
      current?.setAttribute("aria-current", "location");
      currentTocLink = current;
    }
  };
  const focusTarget = (target) => {
    if (!target) return;
    const temporary = !target.hasAttribute("tabindex");
    if (temporary) target.tabIndex = -1;
    target.focus({preventScroll:true});
    if (temporary) target.addEventListener("blur",()=>target.removeAttribute("tabindex"),{once:true});
  };
  const moveTo = (target, focus = false) => {
    // Reveal a deferred chunk before measuring or scrolling its descendant.
    syncTarget(target);
    if (target?.closest("details")) {
      for (let parent = target.parentElement; parent; parent = parent.parentElement)
        if (parent.tagName === "DETAILS") parent.open = true;
    }
    if (target) {
      target.scrollIntoView({block:"start"});
      if (focus) focusTarget(target);
    } else scrollTo({top:0,left:0});
  };
  const revealPoster = (video) => {
    if (!video.poster && video.dataset.poster) video.poster = video.dataset.poster;
  };
  const posterObserver = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) {
      revealPoster(entry.target);
      posterObserver.unobserve(entry.target);
    }
  }, { rootMargin: "600px 0px" }) : null;
  const refreshPosters = () => {
    const videos = [...d.querySelectorAll("video[data-poster]")];
    if (posterObserver) for (const video of videos) posterObserver.observe(video);
    else (window.requestIdleCallback || ((fn) => setTimeout(fn, 1)))(() => videos.forEach(revealPoster));
  };
  refreshPosters();
  d.addEventListener("guide:expanded", () => {
    index = undefined;
    tocLinks = undefined;
    if (searchReady) d.querySelector("[data-guide-search-open]")?.remove();
    syncClinicHours();
    refreshPosters();
    if (searchReady && norm(input.value).length >= 2) render();
    if (d.activeElement !== input) moveTo(targetFromPath(location.pathname));
    else syncTarget();
  });
  const targetFromHash = (hash) => {
    try { return hash ? d.getElementById(decodeURIComponent(hash.slice(1))) : null; }
    catch { return null; }
  };

  const videoFromUrl = (url) => {
    const slug=url.searchParams.get("video"),rawTime=url.searchParams.get("t");
    if(!slug||[...url.searchParams.keys()].some((key)=>key!=="video"&&key!=="t"))return null;
    const video=d.getElementById("video-saeed-ghezelbash-"+slug),seconds=rawTime===null?null:Number(rawTime);
    if(!(video instanceof HTMLVideoElement)||(url.pathname!=="/"&&targetFromPath(url.pathname)!==video))return null;
    if(rawTime!==null&&(!rawTime.trim()||!Number.isFinite(seconds)||seconds<0))return null;
    return {video,seconds};
  };
  let highlightedVideo,waitingVideo,waitingSeek;
  const selectVideo = (selection, {scroll=false,focus=false}={}) => {
    waitingVideo?.removeEventListener("loadedmetadata",waitingSeek);
    waitingVideo=waitingSeek=undefined;
    highlightedVideo?.closest("figure")?.classList.remove("video-deeplink-target");
    highlightedVideo=selection?.video;
    if(!selection)return;
    const {video,seconds}=selection;
    revealPoster(video);
    video.closest("figure")?.classList.add("video-deeplink-target");
    // Navigation must work even if media cannot load; metadata only gates seeking.
    if(scroll){moveTo(video);video.scrollIntoView({block:"center"})}
    if(focus)focusTarget(video);
    if(seconds===null)return;
    const seek=()=>{
      video.currentTime=Math.min(seconds,Number.isFinite(video.duration)?video.duration:seconds);
      waitingVideo=waitingSeek=undefined;
    };
    if(video.readyState>=1)seek();
    else{
      waitingVideo=video;waitingSeek=seek;
      video.addEventListener("loadedmetadata",seek,{once:true});
      video.preload="metadata";
    }
  };
  d.addEventListener("click", (event) => {
    if (!plainClick(event) || event.defaultPrevented) return;
    const link = event.target.closest?.("a[href]");
    if (!link || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href);
    if (![location.origin,search?.dataset.canonicalOrigin].includes(url.origin)) return;
    const selection=url.hash?null:videoFromUrl(url),target=url.hash?targetFromHash(url.hash):targetFromPath(url.pathname);
    if(!target||(url.search&&!selection))return;
    event.preventDefault();
    const destination=url.pathname+url.search+url.hash;
    if(destination!==location.pathname+location.search+location.hash)history.pushState(null,"",destination);
    window.syncGuidePageState?.(url.pathname);
    if(searchReady)closeResults();
    syncTarget();
    selectVideo(selection,{scroll:true,focus:true});
    if(!selection)moveTo(target,true);
  });
  addEventListener("popstate", () => {
    window.syncGuidePageState?.(location.pathname);
    const selection=videoFromUrl(new URL(location.href));
    const target=selection?.video||targetFromHash(location.hash)||targetFromPath(location.pathname);
    syncTarget(target);
    selectVideo(selection);
    focusTarget(target);
    // Preserve the browser's native saved scroll position on Back and Forward.
  });
  const initialSelection=videoFromUrl(new URL(location.href)),
    initialTarget=!location.hash&&(initialSelection?.video||(location.pathname!=="/"&&targetFromPath(location.pathname)));
  // A full-document Back load may not use BFCache. In that case the browser
  // still owns its saved scroll position; do not apply fresh deep-link scrolling.
  const restoringHistory = performance.getEntriesByType("navigation")[0]?.type === "back_forward";
  let initialInteraction=false;
  if(initialTarget && !restoringHistory){
    // All authored content is parsed here: reveal deep links before the first paint.
    selectVideo(initialSelection,{scroll:true,focus:Boolean(initialSelection)});
    if(!initialSelection)moveTo(initialTarget);
    for(const type of ["pointerdown","wheel","keydown"])
      addEventListener(type,()=>{initialInteraction=true},{once:true,passive:true});
  }else {
    syncTarget(initialSelection?.video || targetFromPath(location.pathname));
    selectVideo(initialSelection);
  }
  addEventListener("pageshow", (event) => {
    // BFCache and browser history own restored scroll; loading must not steal it.
    if(event.persisted||restoringHistory||!initialTarget||initialInteraction)return;
    const rect=initialTarget.getBoundingClientRect();
    if(rect.bottom<=0||rect.top>=innerHeight)moveTo(initialTarget);
  });
})();
