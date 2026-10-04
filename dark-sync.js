try{if(JSON.parse(localStorage.getItem('zt_dark')))document.documentElement.setAttribute('data-dark','')}catch{}
addEventListener('storage',e=>{if(e.key==='zt_dark'){try{document.documentElement.toggleAttribute('data-dark',!!JSON.parse(e.newValue))}catch{}}});
