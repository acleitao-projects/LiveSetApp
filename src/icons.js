// Inline SVG icon set. Every icon is a 24px viewBox with currentColor strokes so it
// inherits from surrounding CSS. Use `icon(name)` to get the raw SVG string.

const S=(body,{fill='none',className=''}={})=>
  `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="ic ${className}" aria-hidden="true">${body}</svg>`;

const ICONS={
  menu:S('<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/>'),
  close:S('<path d="M6 6l12 12"/><path d="M18 6L6 18"/>'),
  play:S('<path d="M7 5l12 7-12 7z"/>',{fill:'currentColor'}),
  pause:S('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',{fill:'currentColor'}),
  prev:S('<path d="M6 5v14"/><path d="M20 5L9 12l11 7z"/>',{fill:'currentColor'}),
  next:S('<path d="M18 5v14"/><path d="M4 5l11 7-11 7z"/>',{fill:'currentColor'}),
  rew:S('<path d="M11 5a7 7 0 1 1-6.9 8"/><path d="M4 4v5h5"/>'),
  fwd:S('<path d="M13 5a7 7 0 1 0 6.9 8"/><path d="M20 4v5h-5"/>'),
  fullscreen:S('<path d="M4 9V5h4"/><path d="M20 9V5h-4"/><path d="M4 15v4h4"/><path d="M20 15v4h-4"/>'),
  fullscreenExit:S('<path d="M9 4v4H5"/><path d="M15 4v4h4"/><path d="M9 20v-4H5"/><path d="M15 20v-4h4"/>'),
  edit:S('<path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  remove:S('<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>'),
  drag:S('<circle cx="9" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.5" fill="currentColor" stroke="none"/>'),
  coffee:S('<path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 11h2a2 2 0 0 1 0 4h-2"/><path d="M7 3v3"/><path d="M11 3v3"/>'),
  plus:S('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  minus:S('<path d="M5 12h14"/>'),
  chevronDown:S('<path d="M6 9l6 6 6-6"/>'),
  chevronRight:S('<path d="M9 6l6 6-6 6"/>'),
  save:S('<path d="M5 5h11l3 3v11H5z"/><path d="M8 5v5h7V5"/><path d="M8 19v-6h8v6"/>'),
  file:S('<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>'),
  music:S('<path d="M9 18V6l11-2v12"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="2" fill="currentColor" stroke="none"/>')
};

export function icon(name){return ICONS[name]||'';}
export const iconNames=Object.keys(ICONS);
