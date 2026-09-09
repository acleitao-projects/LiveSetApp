// Minimal i18n. Two languages, string-keyed dictionary, per-app persistence via
// the appSettings IndexedDB store. The current language is a module-level state
// updated via setLanguage() and read via t(key).

import {repository} from './storage.js';

const DICTS = {
  en: {
    ready: 'Ready',
    open_set_list_hint: 'Open the set list to add songs',
    performance: 'Performance',
    next: 'Next',
    break: 'Break',
    break_continue: 'press Next or Play to continue',
    min: 'min',
    // Set list drawer
    set_list: 'Set List',
    new: 'NEW',
    open_set_list: 'OPEN SET LIST…',
    save: 'SAVE',
    add_song: 'ADD SONG',
    add_break: 'ADD BREAK',
    unsaved: 'unsaved',
    unsaved_suffix: '(unsaved)',
    songs: 'songs',
    items: 'items',
    empty_setlist_title: 'Empty set list',
    empty_setlist_hint: 'Tap ADD SONG below to pick an audio file.',
    close_set_list: 'Close set list',
    open_set_list_aria: 'Open set list',
    missing_song: 'Missing song',
    unknown: 'Unknown',
    edit_lyrics: 'Edit lyrics',
    remove_from_set: 'Remove from set list',
    remove_break: 'Remove break',
    drag_to_reorder: 'Drag to reorder',
    break_duration_aria: 'Break duration in minutes',
    // Edit sheet
    edit_song: 'Edit song',
    title: 'Title',
    artist: 'Artist',
    cifra: 'Cifra / lyrics',
    import_txt_cho: 'Import .txt / .cho',
    cancel: 'Cancel',
    // Cifra placeholder / empty
    no_cifra_title: 'No cifra yet',
    no_cifra_hint: "Open this song's edit panel in the set list to add lyrics and chords.",
    choose_song_hint: 'Choose a song from the set list to begin.',
    // New set list modal
    new_set_list: 'New set list',
    give_name_hint: 'Give this set list a name. You can rename it later.',
    name: 'Name',
    default_new_set_name: 'New set list',
    create: 'Create',
    // Confirms
    discard_confirm: 'You have unsaved changes. Discard?',
    beforeunload: 'You have unsaved changes to the set list.',
    // Status / errors
    song_missing_library: 'Song is missing from the library.',
    playback_failed: 'Playback failed.',
    added_song: 'Added {title}.',
    could_not_add: 'Could not add song.',
    saved_set: 'Saved {name}.',
    song_saved: 'Song saved.',
    save_failed: 'Save failed.',
    change_failed: 'Change failed.',
    something_wrong: 'Something went wrong.',
    storage_unavailable: 'Local storage unavailable. Saving is disabled.',
    indexeddb_required: 'IndexedDB is required.',
    // Update
    update_ready: 'Update ready · reload',
    // Transport
    play: 'Play',
    pause: 'Pause',
    previous_song: 'Previous song',
    next_song: 'Next song',
    rewind_10: 'Rewind 10 seconds',
    forward_10: 'Forward 10 seconds',
    fullscreen: 'Fullscreen cifra',
    exit_fullscreen: 'Exit fullscreen',
    // Transpose / speed
    transpose_down: 'Transpose down',
    transpose_up: 'Transpose up',
    transpose_group: 'Transpose',
    semi: 'semi',
    auto: 'Auto',
    // Install
    install: 'INSTALL APP',
    install_ios_hint: 'On iPad/iPhone: tap Share, then Add to Home Screen.',
    // Language
    language: 'Language',
    lang_en: 'English',
    lang_pt: 'Português',
    // Cifra Club import
    import_cifraclub: 'Import from Cifra Club',
    cifraclub_title: 'Search Cifra Club',
    cifraclub_hint: 'Type the artist and song. We search Cifra Club and show matching cifras.',
    cifraclub_artist_label: 'Artist',
    cifraclub_song_label: 'Song title (optional)',
    cifraclub_search: 'Search',
    cifraclub_searching: 'Searching…',
    cifraclub_fetching: 'Fetching cifra…',
    cifraclub_ok: 'Cifra imported.',
    cifraclub_no_results: 'No matching songs on the artist page.',
    cifraclub_artist_not_found: 'Artist page not found on Cifra Club.',
    cifraclub_missing_artist: 'Enter an artist name.',
    cifraclub_missing_url: 'No URL provided.',
    cifraclub_invalid_url: 'Not a Cifra Club URL.',
    cifraclub_proxy_failed: 'Could not reach Cifra Club. Try again in a moment.',
    cifraclub_no_content: 'Could not find cifra content on that page.',
    cifraclub_empty: 'The Cifra Club page returned empty.',
    cifraclub_replace_confirm: 'Replace the current cifra with this import?'
  },
  pt: {
    ready: 'Pronto',
    open_set_list_hint: 'Abra a lista para adicionar músicas',
    performance: 'Show',
    next: 'Próxima',
    break: 'Intervalo',
    break_continue: 'toque Próxima ou Play para continuar',
    min: 'min',
    set_list: 'Repertório',
    new: 'NOVO',
    open_set_list: 'ABRIR REPERTÓRIO…',
    save: 'SALVAR',
    add_song: 'ADICIONAR MÚSICA',
    add_break: 'ADICIONAR INTERVALO',
    unsaved: 'não salvo',
    unsaved_suffix: '(não salvo)',
    songs: 'músicas',
    items: 'itens',
    empty_setlist_title: 'Repertório vazio',
    empty_setlist_hint: 'Toque em ADICIONAR MÚSICA abaixo para escolher um arquivo.',
    close_set_list: 'Fechar repertório',
    open_set_list_aria: 'Abrir repertório',
    missing_song: 'Música ausente',
    unknown: 'Desconhecido',
    edit_lyrics: 'Editar letra',
    remove_from_set: 'Remover do repertório',
    remove_break: 'Remover intervalo',
    drag_to_reorder: 'Arraste para reordenar',
    break_duration_aria: 'Duração do intervalo em minutos',
    edit_song: 'Editar música',
    title: 'Título',
    artist: 'Artista',
    cifra: 'Cifra / letra',
    import_txt_cho: 'Importar .txt / .cho',
    cancel: 'Cancelar',
    no_cifra_title: 'Sem cifra ainda',
    no_cifra_hint: 'Abra o painel de edição desta música no repertório para adicionar letra e cifra.',
    choose_song_hint: 'Escolha uma música no repertório para começar.',
    new_set_list: 'Novo repertório',
    give_name_hint: 'Dê um nome a este repertório. Você pode renomeá-lo depois.',
    name: 'Nome',
    default_new_set_name: 'Novo repertório',
    create: 'Criar',
    discard_confirm: 'Há alterações não salvas. Descartar?',
    beforeunload: 'Há alterações não salvas no repertório.',
    song_missing_library: 'Música não encontrada na biblioteca.',
    playback_failed: 'A reprodução falhou.',
    added_song: '{title} adicionada.',
    could_not_add: 'Não foi possível adicionar a música.',
    saved_set: '{name} salvo.',
    song_saved: 'Música salva.',
    save_failed: 'Falha ao salvar.',
    change_failed: 'Falha ao alterar.',
    something_wrong: 'Algo deu errado.',
    storage_unavailable: 'Armazenamento local indisponível. Salvar está desabilitado.',
    indexeddb_required: 'IndexedDB é necessário.',
    update_ready: 'Atualização pronta · recarregar',
    play: 'Tocar',
    pause: 'Pausar',
    previous_song: 'Música anterior',
    next_song: 'Próxima música',
    rewind_10: 'Voltar 10 segundos',
    forward_10: 'Avançar 10 segundos',
    fullscreen: 'Tela cheia',
    exit_fullscreen: 'Sair de tela cheia',
    transpose_down: 'Diminuir tom',
    transpose_up: 'Aumentar tom',
    transpose_group: 'Transposição',
    semi: 'semi',
    auto: 'Auto',
    install: 'INSTALAR APP',
    install_ios_hint: 'No iPad/iPhone: toque em Compartilhar e depois Adicionar à Tela de Início.',
    language: 'Idioma',
    lang_en: 'English',
    lang_pt: 'Português',
    import_cifraclub: 'Importar do Cifra Club',
    cifraclub_title: 'Buscar no Cifra Club',
    cifraclub_hint: 'Digite o artista e a música. Buscamos no Cifra Club e listamos as cifras.',
    cifraclub_artist_label: 'Artista',
    cifraclub_song_label: 'Nome da música (opcional)',
    cifraclub_search: 'Buscar',
    cifraclub_searching: 'Buscando…',
    cifraclub_fetching: 'Buscando cifra…',
    cifraclub_ok: 'Cifra importada.',
    cifraclub_no_results: 'Nenhuma música encontrada na página do artista.',
    cifraclub_artist_not_found: 'Página do artista não encontrada no Cifra Club.',
    cifraclub_missing_artist: 'Informe o nome do artista.',
    cifraclub_missing_url: 'Nenhuma URL fornecida.',
    cifraclub_invalid_url: 'Não é uma URL do Cifra Club.',
    cifraclub_proxy_failed: 'Não consegui acessar o Cifra Club. Tente novamente em instantes.',
    cifraclub_no_content: 'Não achei a cifra nessa página.',
    cifraclub_empty: 'A página do Cifra Club retornou vazia.',
    cifraclub_replace_confirm: 'Substituir a cifra atual por esta importação?'
  }
};

const SUPPORTED = Object.keys(DICTS);
let current = 'en';
const listeners = new Set();

function detectFromNavigator() {
  const raw = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').toLowerCase();
  if (raw.startsWith('pt')) return 'pt';
  return 'en';
}

export async function loadLanguage() {
  try {
    const stored = await repository.appSettings.get('language');
    if (stored?.value && SUPPORTED.includes(stored.value)) {
      current = stored.value;
      return current;
    }
  } catch (_) { /* ignore */ }
  current = detectFromNavigator();
  return current;
}

export async function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) return current;
  current = lang;
  try { await repository.appSettings.put({id: 'language', value: lang}); } catch (_) { /* ignore */ }
  listeners.forEach(fn => { try { fn(current); } catch (_) {} });
  return current;
}

export function getLanguage() { return current; }
export function supportedLanguages() { return [...SUPPORTED]; }
export function onLanguageChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function t(key, vars) {
  const dict = DICTS[current] || DICTS.en;
  let str = dict[key];
  if (str == null) str = DICTS.en[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
  return str;
}
