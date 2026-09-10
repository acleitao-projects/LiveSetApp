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
  music:S('<path d="M9 18V6l11-2v12"/><circle cx="7" cy="18" r="2" fill="currentColor" stroke="none"/><circle cx="18" cy="16" r="2" fill="currentColor" stroke="none"/>'),
  note:S('<path d="M9 4h9l3 3v13H3V4h4l1-1h2z"/><path d="M8 12h8"/><path d="M8 16h5"/>'),
  moreVertical:S('<circle cx="12" cy="5" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="2" fill="currentColor" stroke="none"/>'),
  gear:S('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z"/>'),
  copy:S('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  share:S('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4"/><path d="M15.4 6.5l-6.8 4"/>'),
  upload:S('<path d="M12 4v12"/><path d="M6 10l6-6 6 6"/><path d="M4 20h16"/>'),
  download:S('<path d="M12 4v12"/><path d="M6 14l6 6 6-6"/><path d="M4 20h16"/>'),
  undo:S('<path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/>'),
  redo:S('<path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/>'),
  volume:S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 8a5 5 0 0 1 0 8"/><path d="M19 5a9 9 0 0 1 0 14"/>'),
  volumeX:S('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>'),
  clipboard:S('<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6"/><path d="M9 15h6"/>'),
  search:S('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>')
};

export function icon(name){return ICONS[name]||'';}
export const iconNames=Object.keys(ICONS);
