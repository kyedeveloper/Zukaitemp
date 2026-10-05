/* ZukaiTemp · core.js — dimuat di <head> semua halaman.
   Isinya: preferensi tampilan, log aplikasi, geser antar tab, dan akun Google/YouTube. */
(function(){
'use strict';
var D=document.documentElement,TOP=window.top===window,O=location.origin;
var rd=function(k,d){try{var v=localStorage.getItem(k);return v===null?d:JSON.parse(v)}catch(e){return d}};
var wr=function(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
var DEF={acc:'sakura',theme:'auto',anim:'full',glass:true,fs:'m',swipe:true};
var ACC={sakura:'#ff4d94',aurora:'#7c5cff',samudra:'#2f7bff',mint:'#10b981',senja:'#ff7a2f',mocha:'#a0714f'};
var page=(location.pathname.split('/').pop()||'index').replace('.html','')||'index';
var mq=matchMedia('(prefers-color-scheme: dark)');
function prefs(){var s=rd('zt_prefs',null),p={};for(var k in DEF)p[k]=s&&k in s?s[k]:DEF[k];if(!s&&rd('zt_dark',false)===true)p.theme='dark';return p}
function isDark(p){return p.theme==='dark'||(p.theme==='auto'&&mq.matches)}
function apply(){
  var p=prefs();
  D.setAttribute('data-acc',ACC[p.acc]?p.acc:'sakura');D.setAttribute('data-anim',p.anim);D.setAttribute('data-fs',p.fs);
  if(p.glass)D.removeAttribute('data-glass');else D.setAttribute('data-glass','off');
  var d=isDark(p);D.toggleAttribute('data-dark',d);
  if(rd('zt_dark',null)!==d)wr('zt_dark',d);
  if(TOP)requestAnimationFrame(function(){var m=document.querySelector('meta[name=theme-color]'),c=getComputedStyle(D).getPropertyValue('--p1').trim();if(m&&c)m.setAttribute('content',c)});
}
apply();
if(mq.addEventListener)mq.addEventListener('change',function(){if(prefs().theme==='auto')apply()});
addEventListener('storage',function(e){
  if(e.key==='zt_prefs')apply();
  else if(e.key==='zt_dark'){
    var d=false;try{d=!!JSON.parse(e.newValue)}catch(x){}
    D.toggleAttribute('data-dark',d);
    /* tombol gelap lama di halaman Email: jadikan pilihan eksplisit */
    if(d!==isDark(prefs())){var s=rd('zt_prefs',{});s.theme=d?'dark':'light';wr('zt_prefs',s)}
  }
});
/* ---- log ---- */
var buf=[],tm=0,fails={};
function flush(){tm=0;if(!buf.length)return;var a=rd('zt_log',[]).concat(buf);buf=[];if(a.length>300)a=a.slice(-300);wr('zt_log',a)}
function log(l,m,s){buf.push({t:Date.now(),l:l,m:String(m).slice(0,500),s:s||page});if(!tm)tm=setTimeout(flush,700)}
addEventListener('pagehide',flush);
addEventListener('error',function(e){log('error',(e.message||'Error')+(e.filename?' @'+String(e.filename).split('/').pop()+':'+e.lineno:''))});
addEventListener('unhandledrejection',function(e){var r=e.reason;log('error','Promise ditolak: '+((r&&r.message)||r))});
['error','warn'].forEach(function(k){var o=console[k];console[k]=function(){try{log(k,[].slice.call(arguments).map(function(x){return x&&x.message||(typeof x==='object'?JSON.stringify(x):String(x))}).join(' '),'console')}catch(e){}return o.apply(console,arguments)}});
if(window.fetch){var of=window.fetch;window.fetch=function(){
  var a=arguments,u=String((a[0]&&a[0].url)||a[0]).replace(O,'').slice(0,100);
  return of.apply(this,a).then(function(r){if(!r.ok&&u.indexOf('/api/')===0&&r.status!==404)note('HTTP '+r.status+' '+u);return r},function(e){if(!(e&&e.name==='AbortError'))note('Gagal jaringan: '+u);throw e});
};}
function note(m){var n=Date.now();if(fails[m]&&n-fails[m]<60000)return;fails[m]=n;log('warn',m,'net')}
/* ---- API publik ---- */
var cfgP=null;
var ZT=window.ZT={log:log,prefs:prefs,ACC:ACC,
  set:function(o){var s=rd('zt_prefs',{});for(var k in o)s[k]=o[k];wr('zt_prefs',s);apply()},
  esc:function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})},
  dev:function(){var d=rd('zt_dev',null);if(!d){d='d'+Math.random().toString(36).slice(2,12)+Date.now().toString(36);wr('zt_dev',d)}return d},
  toast:function(m){var t=document.getElementById('ztToast');if(!t){t=document.createElement('div');t.id='ztToast';t.className='toast';document.body.appendChild(t)}t.textContent=m;t.classList.add('on');clearTimeout(t._t);t._t=setTimeout(function(){t.classList.remove('on')},2800)},
  acct:function(){return rd('zt_acct',null)},
  role:function(){return rd('zt_role','user')},
  token:function(){var a=rd('zt_acct',null);return a&&a.token&&a.exp>Date.now()+20000?a.token:null},
  config:function(force){if(!cfgP||force){var t=ZT.token();cfgP=fetch('/api/config',{cache:'no-store',headers:t?{authorization:'Bearer '+t}:{}}).then(function(r){return r.json()}).catch(function(){return{googleClientId:'',db:false,me:null}})}return cfgP},
  onacct:function(){},
  login:function(){if(!TOP){parent.postMessage({zt:'login'},O);return}login()},
  logout:function(){if(!TOP){parent.postMessage({zt:'logout'},O);return}logout()}
};
/* ---- akun Google (dijalankan di jendela utama saja, supaya popup login stabil) ---- */
var SCOPE='openid email profile https://www.googleapis.com/auth/youtube.readonly',gsi=null;
function loadGsi(){return gsi||(gsi=new Promise(function(res,rej){var s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.onload=res;s.onerror=function(){gsi=null;rej(new Error('Gagal memuat Google'))};document.head.appendChild(s)}))}
function login(){
  ZT.config(true).then(function(c){
    if(!c.googleClientId){ZT.toast('Login Google belum diatur di server');log('warn','GOOGLE_CLIENT_ID belum diisi di Vercel','akun');return}
    return loadGsi().then(function(){
      var a=rd('zt_acct',null);
      var tc=google.accounts.oauth2.initTokenClient({client_id:c.googleClientId,scope:SCOPE,hint:a&&a.email||undefined,
        callback:function(r){
          if(r.error){log('warn','Login ditolak: '+r.error,'akun');ZT.toast('Login dibatalkan');return}
          fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{authorization:'Bearer '+r.access_token}}).then(function(x){return x.json()}).then(function(u){
            wr('zt_acct',{email:u.email,name:u.name||u.email,picture:u.picture||'',sub:u.sub,token:r.access_token,exp:Date.now()+(+r.expires_in||3600)*1000,yt:String(r.scope||'').indexOf('youtube.readonly')>-1});
            log('info','Masuk sebagai '+u.email,'akun');
            return ZT.config(true).then(function(cf){wr('zt_role',cf.me&&cf.me.owner?'owner':'user');ZT.onacct();ZT.toast('Terhubung ke Google ✓')});
          }).catch(function(e){log('error','Gagal membaca profil Google: '+e.message,'akun');ZT.toast('Gagal membaca profil Google')});
        },
        error_callback:function(e){log('warn','Popup login: '+((e&&e.type)||e),'akun');ZT.toast('Login dibatalkan atau popup diblokir')}});
      tc.requestAccessToken({prompt:a?'':'select_account'});
    });
  }).catch(function(e){log('error',e.message,'akun');ZT.toast(e.message)});
}
function logout(){
  var a=rd('zt_acct',null);
  try{if(a&&a.token&&window.google&&google.accounts&&google.accounts.oauth2)google.accounts.oauth2.revoke(a.token,function(){})}catch(e){}
  localStorage.removeItem('zt_acct');localStorage.removeItem('zt_role');cfgP=null;log('info','Keluar dari akun','akun');ZT.onacct();
}
if(TOP)addEventListener('message',function(e){if(e.origin!==O||!e.data)return;if(e.data.zt==='login')login();else if(e.data.zt==='logout')logout()});
/* ---- geser untuk pindah tab (halaman di dalam iframe mengirim pesan ke jendela utama) ---- */
if(!TOP){
  var sx=0,sy=0,st=0,sel=null;
  var blocked=function(el){
    while(el&&el.nodeType===1&&el!==document.body){
      var s=getComputedStyle(el),t=el.tagName;
      if((s.overflowX==='auto'||s.overflowX==='scroll')&&el.scrollWidth>el.clientWidth+4)return true;
      if(el.hasAttribute('data-noswipe')||t==='TEXTAREA'||t==='SELECT'||t==='DIALOG'||(t==='INPUT'&&/range|text|search|email|url|number|color/.test(el.type))||el.isContentEditable)return true;
      el=el.parentElement;
    }return false};
  addEventListener('touchstart',function(e){if(e.touches.length!==1){sel=null;return}var t=e.touches[0];sx=t.clientX;sy=t.clientY;st=Date.now();sel=e.target},{passive:true});
  addEventListener('touchend',function(e){
    if(!sel||!prefs().swipe||document.querySelector('dialog[open]'))return;
    var t=e.changedTouches[0],dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.abs(dx)<70||Math.abs(dy)>50||Math.abs(dx)<Math.abs(dy)*1.8||Date.now()-st>700)return;
    if(sx<26&&dx>0){parent.postMessage({swipe:'edge'},O);return}
    if(blocked(sel))return;
    parent.postMessage({swipe:dx<0?'next':'prev'},O);
  },{passive:true});
}
})();
