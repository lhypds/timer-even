// The phone side: a light chrome bar over the timer website, and the glasses
// settings modal. Styled after ../simple-ai/sc-even's header chips and modal.

import { BLINKS, POSITIONS, SIZES, type Blink, type GlassesSettings, type Position, type Size } from './settings.ts';

const GEAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
  <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
</svg>`;

const REFRESH_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" aria-hidden="true">
  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
</svg>`;

const POSITION_LABELS: Record<Position, string> = {
  'left-top': 'Top left', 'right-top': 'Top right', 'left-bottom': 'Bottom left', 'right-bottom': 'Bottom right', center: 'Center'
};
const SIZE_LABELS: Record<Size, string> = { big: 'Big', medium: 'Medium', small: 'Small', tiny: 'Tiny' };
const BLINK_LABELS: Record<Blink, string> = { none: 'None', text: 'Blink text', background: 'Blink background' };
const SWITCH = '<span class="switch__track"><span class="switch__thumb"></span></span>';

export interface UI {
  frame: HTMLIFrameElement;
  /** Settings that arrived after the page was built (the host's stored copy). */
  setSettings(settings: GlassesSettings): void;
}

export interface UIOptions {
  settings: GlassesSettings;
  onReconnect(): void;
  onSave(settings: GlassesSettings): void | Promise<void>;
}

interface Dropdown<T extends string> {
  el: HTMLElement;
  get(): T;
  set(value: T): void;
}

// The webview draws a native <select>'s menu in system style, so the menu is
// the app's own: a chip showing the value, and a list under it while open.
const closers: Array<(outside?: Node) => void> = [];
document.addEventListener('click', event => {
  for (const close of closers) close(event.target as Node);
});

function createDropdown<T extends string>(items: Array<{ value: T; label: string }>): Dropdown<T> {
  const el = document.createElement('div');
  el.className = 'select';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'field__input select__button';
  const label = document.createElement('span');
  label.className = 'select__label';
  button.appendChild(label);
  const menu = document.createElement('ul');
  menu.className = 'select__menu';
  el.append(button, menu);

  let current = items[0].value;
  const options = new Map<T, HTMLLIElement>();
  const set = (value: T) => {
    const item = items.find(i => i.value === value) ?? items[0];
    current = item.value;
    label.textContent = item.label;
    for (const [v, li] of options) li.classList.toggle('select__option--active', v === current);
  };
  const close = (outside?: Node) => {
    if (!outside || !el.contains(outside)) el.classList.remove('select--open');
  };
  for (const item of items) {
    const li = document.createElement('li');
    li.className = 'select__option';
    li.textContent = item.label;
    li.addEventListener('click', () => { set(item.value); close(); });
    menu.appendChild(li);
    options.set(item.value, li);
  }
  button.addEventListener('click', event => {
    event.stopPropagation();
    const open = el.classList.contains('select--open');
    for (const other of closers) other();
    if (!open) el.classList.add('select--open');
  });
  closers.push(close);
  set(current);
  return { el, get: () => current, set };
}

export function createUI(root: HTMLElement, options: UIOptions): UI {
  let current = options.settings;
  root.innerHTML = `
    <div class="app">
      <header class="app__header">
        <div class="app__actions">
          <button class="bar-btn" type="button" data-reconnect>${REFRESH_SVG}Reconnect</button>
          <button class="bar-btn" type="button" data-open-settings>${GEAR_SVG}Glasses</button>
        </div>
      </header>
      <iframe class="frame" data-frame title="Timer" referrerpolicy="no-referrer"></iframe>
    </div>
    <div class="modal" data-settings-modal>
      <div class="modal__box">
        <h2 class="modal__title">Glasses</h2>
        <label class="switch">
          <span>Show milliseconds</span>
          <input type="checkbox" data-milliseconds />${SWITCH}
        </label>
        <div class="field">
          <span class="field__label">Position</span>
          <div data-position></div>
        </div>
        <div class="field">
          <span class="field__label">Size</span>
          <div data-size></div>
        </div>
        <div class="field">
          <span class="field__label">When time ends</span>
          <div data-blink></div>
        </div>
        <div class="modal__actions">
          <span class="modal__saved" data-saved>Saved</span>
          <button class="btn" type="button" data-close-settings>Cancel</button>
          <button class="btn btn--primary" type="button" data-save>Save</button>
        </div>
        <div class="modal__version">Timer ${__APP_VERSION__}</div>
      </div>
    </div>
  `;

  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const frame = q<HTMLIFrameElement>('[data-frame]');
  const modal = q<HTMLElement>('[data-settings-modal]');
  const milliseconds = q<HTMLInputElement>('[data-milliseconds]');
  const saved = q<HTMLElement>('[data-saved]');
  const position = createDropdown(POSITIONS.map(value => ({ value, label: POSITION_LABELS[value] })));
  const size = createDropdown(SIZES.map(value => ({ value, label: SIZE_LABELS[value] })));
  const blink = createDropdown(BLINKS.map(value => ({ value, label: BLINK_LABELS[value] })));
  q('[data-position]').appendChild(position.el);
  q('[data-size]').appendChild(size.el);
  q('[data-blink]').appendChild(blink.el);

  const open = () => {
    milliseconds.checked = current.milliseconds;
    position.set(current.position);
    size.set(current.size);
    blink.set(current.blink);
    saved.classList.remove('modal__saved--show');
    modal.classList.add('modal--open');
  };
  const close = () => modal.classList.remove('modal--open');

  q('[data-reconnect]').addEventListener('click', () => options.onReconnect());
  q('[data-open-settings]').addEventListener('click', open);
  q('[data-close-settings]').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  q('[data-save]').addEventListener('click', async () => {
    current = { milliseconds: milliseconds.checked, position: position.get(), size: size.get(), blink: blink.get() };
    await options.onSave(current);
    saved.classList.add('modal__saved--show');
    window.setTimeout(close, 600);
  });

  return {
    frame,
    setSettings(settings) { current = settings; }
  };
}
