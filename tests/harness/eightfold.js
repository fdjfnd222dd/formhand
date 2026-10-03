/*
 * Test harness: makes the static markup of an Eightfold PCS ("pcsx") single-select
 * combobox (as captured on one employer's career site) behave like the live widget again
 * (saved pages cannot run their JS).
 *
 * Closed markup (class names carry hash suffixes on the real page):
 *   div#<WRAPPER>.select-module_select-wrapper__<hash>
 *     div.select-module_select-live-region[role=status][aria-live=polite]
 *     div.select-module_select-dropdown-main-wrapper
 *       div.dropdown-module_reference-wrapper
 *         ... input.select-module_select-input[role=combobox][aria-controls=list-<k>] + chevron button
 * Open: input aria-expanded=true, wrapper gets aria-owns="list-<k>", live region says
 * "N matches found.", and the popup is inserted INLINE in the main wrapper after the
 * reference wrapper:
 *   div#dropdown-<m>.select-module_select-dropdown-overlay.dropdown-module_dropdown-wrapper
 *     > div.menu-module_menu-container > ul#list-<k>[role=listbox]
 *       > li[role=presentation] > button#list-<k>-option-<i>[role=option][title]
 * The popup exists only while open (aria-controls points at nothing when closed).
 *
 * Behaviour (deliberately strict / pessimistic so tests prove the extension is right):
 *   - opens on MOUSEDOWN (button 0) on the input or the chevron; the click that follows
 *     a mousedown is ignored; a bare click (no mousedown) also opens if closed;
 *     ArrowDown on the input opens too
 *   - an `input` event on the input filters by case-insensitive substring of its value
 *     (opens first if closed); no hit = no role=option, one li "No matches found"
 *   - options render `delay` ms after opening / typing (popup is empty meanwhile)
 *   - picking = click on an option button: native-setter value = its title, aria-selected,
 *     close, then `input` and `change` on the input (our own input event is not re-filtered)
 *   - Escape on the input or a mousedown outside the wrapper closes WITHOUT picking;
 *     keepTyped (default true) leaves the typed text in the input, false restores the
 *     last picked value (or '')
 *
 * window.__harness: open (currently open popups), maxOpen, opened (count), and
 * picks[wrapperId] (number of picks). Shared with the other harnesses, never clobbered.
 */
(function () {
  'use strict';

  const H = (window.__harness = window.__harness || { open: 0, maxOpen: 0, opened: 0 });
  if (H.open == null) H.open = 0;
  if (H.maxOpen == null) H.maxOpen = 0;
  if (H.opened == null) H.opened = 0;
  H.picks = H.picks || {};

  function track(delta) {
    H.open += delta;
    if (delta > 0) H.opened++;
    H.maxOpen = Math.max(H.maxOpen, H.open);
  }

  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  let uid = 0;

  function addStyle() {
    if (document.getElementById('eightfold-harness-style')) return;
    const st = document.createElement('style');
    st.id = 'eightfold-harness-style';
    st.textContent =
      '.select-module_select-dropdown-main-wrapper{position:relative}' +
      '.select-module_select-dropdown-overlay{display:block;min-width:200px;min-height:8px;border:1px solid #888;background:#fff}' +
      '.select-module_select-dropdown-overlay ul{margin:0;padding:0;list-style:none}' +
      '.select-module_select-dropdown-overlay li{display:block;min-height:16px}' +
      '.select-module_select-dropdown-overlay button{display:block;width:100%;text-align:left}';
    document.head.appendChild(st);
  }

  /** config: { [wrapperId]: { options: [text], delay?: ms, keepTyped?: bool } } */
  window.installEightfold = function (config) {
    addStyle();
    for (const [id, cfg] of Object.entries(config)) {
      const wrapper = document.getElementById(id);
      if (!wrapper) continue;
      const input = wrapper.querySelector('input[role="combobox"]');
      const live = wrapper.querySelector('[role="status"]');
      const main = wrapper.querySelector('[class*="select-module_select-dropdown-main-wrapper"]');
      const ref = main && main.querySelector('[class*="dropdown-module_reference-wrapper"]');
      if (!input || !main) continue;
      const chevron = wrapper.querySelector('button[aria-hidden="true"]');
      // The live page always has aria-controls; the test sanitizer strips it from
      // every combobox, so give it back (the real widget sets it on render).
      if (!input.getAttribute('aria-controls')) input.setAttribute('aria-controls', 'list-af-' + id);
      const listId = input.getAttribute('aria-controls');
      const keepTyped = cfg.keepTyped !== false;
      let popup = null;
      let pending = null;
      let picked = '';
      let picking = false;
      let mdSeen = false;
      H.picks[id] = H.picks[id] || 0;

      function say(text) {
        if (live) live.textContent = text;
      }

      function render() {
        if (!popup) return;
        const ul = popup.querySelector('ul');
        ul.textContent = '';
        const q = input.value.toLowerCase();
        const hits = cfg.options.filter((o) => o.toLowerCase().includes(q));
        hits.forEach((text, i) => {
          const li = document.createElement('li');
          li.className = 'menuItem-module_menu-item';
          li.setAttribute('role', 'presentation');
          const b = document.createElement('button');
          b.id = `${listId}-option-${i}`;
          b.type = 'button';
          b.className = 'menuItem-module_menu-item-button';
          b.setAttribute('role', 'option');
          b.setAttribute('aria-selected', text === picked ? 'true' : 'false');
          b.setAttribute('title', text);
          b.innerHTML =
            '<span class="menu-item-wrapper"><span class="item-text"><span class="menuItem-module_label"></span></span></span>';
          b.querySelector('.menuItem-module_label').textContent = text;
          b.addEventListener('click', () => choose(text));
          li.appendChild(b);
          ul.appendChild(li);
        });
        if (!hits.length) {
          const li = document.createElement('li');
          li.className = 'menuItem-module_menu-item';
          li.setAttribute('role', 'presentation');
          li.textContent = 'No matches found';
          ul.appendChild(li);
        }
        say(`${hits.length} matches found.`);
      }

      function schedule() {
        clearTimeout(pending);
        const ul = popup.querySelector('ul');
        if (cfg.delay) {
          ul.textContent = '';
          pending = setTimeout(render, cfg.delay);
        } else {
          render();
        }
      }

      function open() {
        if (popup) return;
        popup = document.createElement('div');
        popup.id = `dropdown-${900 + ++uid}`;
        popup.className = 'select-module_select-dropdown-overlay dropdown-module_dropdown-wrapper';
        popup.setAttribute('tabindex', '-1');
        popup.innerHTML =
          '<div class="menu-module_menu-container"><ul class="list-module_list-container" role="listbox"></ul></div>';
        popup.querySelector('ul').id = listId;
        if (ref && ref.parentNode === main) ref.after(popup);
        else main.appendChild(popup);
        input.setAttribute('aria-expanded', 'true');
        wrapper.setAttribute('aria-owns', listId);
        track(1);
        schedule();
      }

      function close() {
        clearTimeout(pending);
        if (!popup) return;
        popup.remove();
        popup = null;
        input.setAttribute('aria-expanded', 'false');
        wrapper.removeAttribute('aria-owns');
        say('');
        track(-1);
      }

      function closeWithoutPick() {
        if (!popup) return;
        close();
        if (!keepTyped) setValue.call(input, picked);
      }

      function choose(text) {
        picking = true;
        try {
          setValue.call(input, text);
          picked = text;
          if (popup) {
            for (const b of popup.querySelectorAll('[role="option"]')) {
              b.setAttribute('aria-selected', b.getAttribute('title') === text ? 'true' : 'false');
            }
          }
          close();
          H.picks[id]++;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        } finally {
          picking = false;
        }
      }

      // Opens on mousedown; the click that follows is swallowed.
      input.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        mdSeen = true;
        open();
      });
      if (chevron) {
        chevron.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          mdSeen = true;
          if (popup) closeWithoutPick();
          else open();
        });
      }
      for (const el of [input, chevron]) {
        if (!el) continue;
        el.addEventListener('click', () => {
          if (mdSeen) {
            mdSeen = false;
            return;
          }
          open();
        });
      }
      input.addEventListener('input', () => {
        if (picking) return;
        if (!popup) open();
        else schedule();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeWithoutPick();
        else if (e.key === 'ArrowDown') open();
      });
      document.addEventListener('mousedown', (e) => {
        if (popup && !wrapper.contains(e.target)) closeWithoutPick();
      });
    }
  };
})();
