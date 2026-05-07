import fs from 'fs';

/** Returns true when the HTML does NOT expose window.setFrame — i.e. needs adaptation. */
export function needsAdapter(html: string): boolean {
  return !/window\s*\.\s*setFrame\s*=/.test(html);
}

/**
 * Reads an HTML file and, if it lacks the HyperFrame frame API, injects a
 * compatibility shim that makes any animation-based page renderable frame-by-frame.
 * Returns true when the file was rewritten.
 */
export function adaptHtmlFile(filePath: string): boolean {
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!needsAdapter(raw)) return false;
  fs.writeFileSync(filePath, adaptHtml(raw), 'utf-8');
  return true;
}

/** Injects the HyperFrame compatibility shim into an HTML string. */
export function adaptHtml(html: string): string {
  if (!needsAdapter(html)) return html;
  const shim = buildShim();
  // Inject as first child of <head> so overrides apply before page scripts run
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/(<head(?:\s[^>]*)?>)/i, '$1\n' + shim);
  }
  return shim + '\n' + html;
}

// ---------------------------------------------------------------------------
// The shim overrides:
//   • Date.now / performance.now  → virtual clock driven by setFrame
//   • requestAnimationFrame       → virtual queue, one generation drained per frame
//   • setTimeout / setInterval    → virtual timers, max 50 fires per setFrame call
//   • window.setFrame(n)          → advances virtual time + triggers all of above
//   • window.hyperframe           → default config (fps 30, 5 s, 1920×1080)
//   • auto-start                  → hides play overlays & calls a start fn if found
//
// Intentionally NOT overriding CSS animation-delay — Puppeteer already injects
// "animation-play-state: paused" globally, so CSS keyframe animations are frozen
// at their initial state. Seeking via animationDelay would require querying every
// DOM element on every frame, which is prohibitively expensive at render time.
// ---------------------------------------------------------------------------
function buildShim(): string {
  return `<script id="__hf_shim__">
(function(){
  if(window.__hf_injected__)return;
  window.__hf_injected__=true;

  /* ── Virtual clock ──────────────────────────────────────────────────── */
  var _vt=0;
  Date.now=function(){return _vt;};
  performance.now=function(){return _vt;};

  /* ── Virtual requestAnimationFrame ─────────────────────────────────── */
  /* Only ONE generation of callbacks is drained per setFrame call.       */
  /* Re-queued callbacks (e.g. render loops) fire on the NEXT setFrame.   */
  var _rafQ=new Map(),_nextRaf=1;
  window.requestAnimationFrame=function(cb){var id=_nextRaf++;_rafQ.set(id,cb);return id;};
  window.cancelAnimationFrame=function(id){_rafQ.delete(id);};

  /* ── Virtual timers ─────────────────────────────────────────────────── */
  var _timers=[],_tid=1000000;
  var _realST=window.setTimeout.bind(window);
  function _addTimer(fn,delay,args,repeat){
    var id=_tid++;
    /* Intervals with delay < 1 ms are clamped to 1 ms to prevent runaway loops */
    var iv=Math.max(repeat?(+delay||1):0,(+delay||0));
    _timers.push({id:id,at:_vt+iv,fn:function(){fn.apply(null,args);},repeat:repeat,iv:iv});
    return id;
  }
  window.setTimeout=function(fn,d){return _addTimer(fn,d,Array.prototype.slice.call(arguments,2),false);};
  window.setInterval=function(fn,d){return _addTimer(fn,d,Array.prototype.slice.call(arguments,2),true);};
  window.clearTimeout=window.clearInterval=function(id){
    for(var i=_timers.length-1;i>=0;i--)if(_timers[i].id===id){_timers.splice(i,1);break;}
  };
  /* Max timer callbacks per setFrame to prevent runaway catchup */
  var _MAX_TIMER_FIRES=50;
  function _fireTimers(){
    var fired=0;
    /* snapshot due timers, then process; intervals reschedule themselves once */
    var due=_timers.filter(function(t){return t.at<=_vt;});
    for(var k=0;k<due.length&&fired<_MAX_TIMER_FIRES;k++){
      var t=due[k];
      var idx=_timers.indexOf(t);
      if(idx===-1)continue;
      if(t.repeat){
        /* advance by one interval, skip ahead if still in the past */
        t.at+=t.iv;
        if(t.at<=_vt)t.at=_vt+1;
      }else{
        _timers.splice(idx,1);
      }
      try{t.fn();}catch(e){}
      fired++;
    }
  }

  /* ── setFrame ───────────────────────────────────────────────────────── */
  window.setFrame=function(n){
    var fps=(window.hyperframe&&window.hyperframe.fps)||30;
    _vt=Math.round(n/fps*1000);
    _fireTimers();
    /* drain one generation of RAF callbacks */
    if(_rafQ.size>0){
      var cbs=Array.from(_rafQ.entries());
      _rafQ.clear();
      cbs.forEach(function(e){try{e[1](_vt);}catch(err){}});
    }
  };

  /* ── Default config ─────────────────────────────────────────────────── */
  if(!window.hyperframe){
    window.hyperframe={fps:30,durationInFrames:150,width:1920,height:1080};
  }

  /* ── Auto-start ─────────────────────────────────────────────────────── */
  _realST(function(){
    /* hide common "click to play" overlay patterns */
    document.querySelectorAll(
      '.play-overlay,.intro-overlay,.start-overlay,.splash-overlay,'+
      '#playOverlay,#introOverlay,#startOverlay,#splashOverlay'
    ).forEach(function(el){
      el.style.display='none';
      el.style.opacity='0';
      el.style.pointerEvents='none';
    });
    /* call a start function if the page exposes one */
    var starters=['startVideo','startApp','start','init','play','begin','run','main'];
    for(var i=0;i<starters.length;i++){
      if(typeof window[starters[i]]==='function'){
        try{window[starters[i]]();}catch(e){}
        break;
      }
    }
  },150);

})();
<\/script>`;
}
