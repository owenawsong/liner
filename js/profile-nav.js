import {esc} from './ui.js';
import {hrefFor} from './core.js';

export const PROFILE_PRIMARY=[['overview','Overview'],['top','Music'],['timeline','Timeline'],['evolution','Taste changes'],['patterns','Charts & sound'],['insights','Insights'],['discover','Discover'],['clock','Clock']];
export function profileNavHTML(pid,current){
  const link=(id,label)=>`<a href="${hrefFor(pid,id==='overview'?'':id)}"${id===current?' aria-current="page"':''}>${esc(label)}</a>`;
  return `<nav class="tabs profile-nav" aria-label="Profile sections"><div class="wrap profile-nav__inner"><div class="profile-nav__primary">${PROFILE_PRIMARY.map(([id,label])=>link(id,label)).join('')}</div><div class="profile-nav__utilities">${link('data','Data & settings')}</div></div></nav>`;
}
