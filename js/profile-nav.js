import {esc} from './ui.js';
import {hrefFor} from './core.js';

export const PROFILE_PRIMARY=[['overview','Overview'],['top','Music'],['timeline','History'],['insights','Insights'],['discover','Discover']];
export const PROFILE_MORE=[['evolution','Taste changes','Compare recent and earlier listening'],['patterns','Deep dive','Genres, patterns and sound coverage'],['clock','Listening clock','Your listening through the week'],['data','Data & settings','Sources, exclusions and preparation']];
export function profileNavHTML(pid,current){
  const link=(id,label)=>`<a href="${hrefFor(pid,id==='overview'?'':id)}"${id===current?' aria-current="page"':''}>${esc(label)}</a>`;
  const secondary=PROFILE_MORE.find(([id])=>id===current);
  return `<nav class="tabs profile-nav" aria-label="Profile sections"><div class="wrap profile-nav__inner"><div class="profile-nav__primary">${PROFILE_PRIMARY.map(([id,label])=>link(id,label)).join('')}</div><details class="profile-nav__more"${secondary?' data-active="true"':''}><summary>${esc(secondary?.[1]||'Explore more')}<span aria-hidden="true">⌄</span></summary><div class="profile-nav__menu">${PROFILE_MORE.map(([id,label,detail])=>`<a href="${hrefFor(pid,id)}"${id===current?' aria-current="page"':''}><b>${esc(label)}</b><span>${esc(detail)}</span></a>`).join('')}<a href="#/settings"><b>Appearance & writing</b><span>Themes, AI and local preferences</span></a></div></details></div></nav>`;
}
export function bindProfileNav(onLeave){
  const menu=document.querySelector('.profile-nav__more');if(!menu)return;
  const close=event=>{if(menu.open&&!menu.contains(event.target))menu.open=false;};
  const escape=event=>{if(event.key==='Escape'&&menu.open){menu.open=false;menu.querySelector('summary').focus();}};
  menu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{menu.open=false;}));
  document.addEventListener('click',close);document.addEventListener('keydown',escape);
  onLeave(()=>{document.removeEventListener('click',close);document.removeEventListener('keydown',escape);});
}
