import {
  type Corners,
  currentMode,
  alert as dismissible,
  enhance,
  nav,
  type SelectDetail,
  setButtonState,
  setCodeState,
  setCorners,
  setInvalid,
  setMode,
} from '@crumza/ui/behaviors';
import { expand, resize, roll, toaster } from '@crumza/ui/motion';

// Everything in the kit is wired by one call; the rest of this file is the docs' own demos.
enhance();

const $ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document): T | null =>
  scope.querySelector<T>(selector);
const $$ = <T extends Element = HTMLElement>(selector: string, scope: ParentNode = document): T[] => [
  ...scope.querySelectorAll<T>(selector),
];
const wait = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

const list = $('.cz-toaster');
const toasts = list ? toaster(list) : null;
const toast = (message: string, action?: string): void => {
  toasts?.add(message, action ? { action, onAction: () => toasts.add('Restored') } : {});
};

// Brand: one variable re-colours the page, live. Mochi is the stylesheet's own default.
const root = document.documentElement;
const presets = $$<HTMLButtonElement>('#brand-presets [data-brand]');
const primaryInput = $<HTMLInputElement>('#brand-primary');
const dangerInput = $<HTMLInputElement>('#brand-danger');
const brandCode = $('#brand-code');
const showBrand = (): void => {
  if (!brandCode) return;
  const lines = ['primary', 'danger']
    .map((name) => [name, root.style.getPropertyValue(`--cz-brand-${name}`)] as const)
    .filter(([, value]) => value)
    .map(([name, value]) => `  --cz-brand-${name}: ${value};`);
  brandCode.textContent = `:root {\n${lines.length > 0 ? lines.join('\n') : '  /* Mochi, the default */'}\n}`;
};
const setBrand = (name: 'primary' | 'danger', value: string): void => {
  if (value) root.style.setProperty(`--cz-brand-${name}`, value);
  else root.style.removeProperty(`--cz-brand-${name}`);
  showBrand();
};
for (const preset of presets) {
  preset.addEventListener('click', () => {
    for (const other of presets) other.setAttribute('aria-pressed', String(other === preset));
    const value = preset.dataset.brand ?? '';
    setBrand('primary', value);
    if (primaryInput) primaryInput.value = value || '#66736c';
  });
}
primaryInput?.addEventListener('input', () => {
  for (const preset of presets) preset.setAttribute('aria-pressed', 'false');
  setBrand('primary', primaryInput.value);
});
dangerInput?.addEventListener('input', () => setBrand('danger', dangerInput.value));

// Corners, from the bar.
for (const input of $$<HTMLInputElement>('input[name="corners"]')) {
  input.checked = input.value === document.documentElement.dataset.czCorners;
  input.addEventListener('change', () => setCorners(input.value as Corners));
}

// The side nav: one plate on the section in view.
const sideNav = $('.doc-nav');
if (sideNav) {
  nav(sideNav, 'a');
  const links = new Map($$<HTMLAnchorElement>('a', sideNav).map((link) => [link.hash.slice(1), link]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of links.values()) link.removeAttribute('aria-current');
        links.get(entry.target.id)?.setAttribute('aria-current', 'true');
      }
    },
    { rootMargin: '-30% 0px -60% 0px' },
  );
  for (const section of $$('.doc-section')) spy.observe(section);
}

// Button: busy, then done, with the width springing between labels. Presses while busy are ignored by the kit.
const save = $<HTMLButtonElement>('#save-demo');
const saveText = save ? $('.cz-button-label > span', save) : null;
save?.addEventListener('click', async () => {
  if (!saveText || save.dataset.state) return;
  setButtonState(save, 'busy');
  await wait(1300);
  void resize(save, () => {
    setButtonState(save, 'done');
    saveText.textContent = 'Saved';
  });
  await wait(1600);
  void resize(save, () => {
    setButtonState(save, null);
    saveText.textContent = 'Save changes';
  });
});

// Chips: "All" clears the rest; none pressed means all.
for (const group of $$('[data-chips]')) {
  const chips = $$<HTMLButtonElement>('.cz-chip', group);
  const [all, ...rest] = chips;
  group.addEventListener('cz:press', (event) => {
    if (!all) return;
    if (event.target === all) {
      for (const chip of rest) chip.setAttribute('aria-pressed', 'false');
      all.setAttribute('aria-pressed', 'true');
      return;
    }
    const any = rest.some((chip) => chip.getAttribute('aria-pressed') === 'true');
    all.setAttribute('aria-pressed', String(!any));
  });
}

// Text field: check the email on blur and on Enter; fixing it folds the error away.
const emailField = $('#email-field');
const email = emailField ? $<HTMLInputElement>('input', emailField) : null;
if (emailField && email) {
  const valid = (): boolean => email.value === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value);
  email.addEventListener('blur', () => setInvalid(emailField, !valid()));
  email.addEventListener('keydown', (event) => event.key === 'Enter' && setInvalid(emailField, !valid()));
  email.addEventListener('input', () => {
    if (email.getAttribute('aria-invalid') === 'true' && valid()) setInvalid(emailField, false);
  });
}

const selectAll = $<HTMLInputElement>('#select-all');
if (selectAll) selectAll.indeterminate = true;

// Code input: 246810 is the right code.
const code = $('#code-demo');
code?.addEventListener('cz:complete', (event) => {
  const { value } = (event as CustomEvent<{ value: string }>).detail;
  setCodeState(code, value === '246810' ? 'done' : 'error');
});

// Menus, the context menu and the command palette say what was chosen.
document.addEventListener('cz:select', (event) => {
  const { value, label } = (event as CustomEvent<SelectDetail>).detail;
  if (event.target instanceof HTMLElement && event.target.matches('.cz-combobox')) return;
  if (value === 'theme') {
    void setMode(currentMode() === 'dark' ? 'light' : 'dark');
    return;
  }
  toast(`${label} chosen`);
});
$('#copy-link')?.addEventListener('click', () => {
  $('#share-pop')?.hidePopover();
  toast('Link copied');
});

// Dialog: deleting offers an undo.
$<HTMLDialogElement>('#delete-dialog')?.addEventListener('close', (event) => {
  if ((event.target as HTMLDialogElement).returnValue === 'delete') toast('Project deleted', 'Undo');
});

// Toasts.
for (const button of $$('[data-toast]')) {
  button.addEventListener('click', () => toast(button.dataset.toast ?? '', button.dataset.toastAction));
}
$('#toast-three')?.addEventListener('click', async () => {
  for (const message of ['Upload finished', 'Asha joined the board', 'Invoice 2042 sent']) {
    toast(message);
    await wait(160);
  }
});

// Badge: counts bump and roll.
const inbox = $('#inbox-count');
let unread = 3;
const setUnread = (value: number): void => {
  if (!inbox) return;
  unread = value;
  void roll(inbox, unread);
  inbox.dataset.bump = '';
  window.setTimeout(() => delete inbox.dataset.bump, 90);
};
$('#inbox-add')?.addEventListener('click', () => setUnread(unread + 1));
$('#inbox-read')?.addEventListener('click', () => unread > 0 && setUnread(0));

// Alert: dismissed alerts can come back.
const alerts = $('#alerts');
const alertCopies = alerts ? $$('.cz-alert', alerts).map((alert) => alert.cloneNode(true) as HTMLElement) : [];
$('#alerts-back')?.addEventListener('click', () => {
  if (!alerts) return;
  const titleOf = (element: Element): string => $('.cz-alert-title', element)?.textContent ?? '';
  alertCopies.forEach((copy, index) => {
    const present = $$('.cz-alert', alerts);
    if (present.some((element) => titleOf(element) === titleOf(copy))) return;
    const fresh = copy.cloneNode(true) as HTMLElement;
    const next = present.find((element) => alertCopies.findIndex((c) => titleOf(c) === titleOf(element)) > index);
    alerts.insertBefore(fresh, next ?? null);
    dismissible(fresh);
    void expand(fresh);
  });
});

// Progress: the bar moves on a spring and turns to success when the upload is done.
const upload = $('#upload');
const uploadLabel = $('#upload-label');
let uploading = 0;
const setUpload = (value: number): void => {
  if (!upload || !uploadLabel) return;
  upload.style.setProperty('--cz-value', String(value / 100));
  upload.setAttribute('aria-valuenow', String(value));
  void roll(uploadLabel, value >= 100 ? 'Uploaded' : `${value}%`);
};
$('#upload-start')?.addEventListener('click', () => {
  if (!upload) return;
  window.clearInterval(uploading);
  delete upload.dataset.done;
  let value = 0;
  setUpload(0);
  uploading = window.setInterval(() => {
    value = Math.min(100, value + 6 + Math.round(Math.random() * 14));
    setUpload(value);
    if (value < 100) return;
    window.clearInterval(uploading);
    window.setTimeout(() => {
      upload.dataset.done = '';
    }, 300);
  }, 260);
});

// Skeleton: placeholders hand over to the real content.
const skeleton = $('#skeleton-demo');
const loadSkeleton = async (): Promise<void> => {
  const waiting = skeleton ? $('[data-part="wait"]', skeleton) : null;
  const ready = skeleton ? $('[data-part="ready"]', skeleton) : null;
  if (!waiting || !ready) return;
  waiting.hidden = false;
  ready.hidden = true;
  await wait(1400);
  waiting.hidden = true;
  ready.hidden = false;
  $$(':scope > *, .doc-skeleton-lines > *', ready).forEach((element, i) => {
    element.animate(
      { opacity: [0, 1], translate: ['0 4px', '0 0'] },
      { duration: 360, delay: i * 50, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' },
    );
  });
};
$('#skeleton-load')?.addEventListener('click', () => void loadSkeleton());
void loadSkeleton();

// Empty state: clearing the filters shows it again, so its entrance plays again.
$('#empty-demo')?.addEventListener('click', (event) => {
  const button = (event.target as Element).closest('#empty-again');
  const empty = button?.closest('.cz-empty');
  if (!empty) return;
  empty.replaceWith(empty.cloneNode(true));
});

// Chat: Pebble answers.
const log = $('#chat-log');
const replies = [
  'Twelve fits the Team plan. It grows with you, and you only pay for seats in use.',
  'Want me to book a fifteen minute call to set it up?',
  'Done. You will get an invite in a minute.',
];
let reply = 0;
const message = (from: 'me' | 'them', text: string): HTMLElement => {
  const bubble = document.createElement('div');
  bubble.className = 'cz-message';
  bubble.dataset.from = from;
  const who = document.createElement('span');
  who.className = 'cz-sr';
  who.textContent = from === 'me' ? 'You: ' : 'Pebble: ';
  bubble.append(who, text);
  return bubble;
};
$('#chat-composer')?.addEventListener('cz:send', async (event) => {
  if (!log) return;
  log.append(message('me', (event as CustomEvent<{ text: string }>).detail.text));
  await wait(450);
  const typing = document.createElement('div');
  typing.className = 'cz-typing';
  typing.setAttribute('aria-label', 'Pebble is typing');
  typing.append(document.createElement('i'), document.createElement('i'), document.createElement('i'));
  log.append(typing);
  await wait(1400);
  typing.replaceWith(message('them', replies[reply % replies.length] ?? ''));
  reply += 1;
});
