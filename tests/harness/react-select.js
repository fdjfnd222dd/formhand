/*
 * Test harness: makes the static react-select markup of a saved Greenhouse
 * page behave like react-select v5 again (saved pages cannot run their JS).
 *
 * Mirrors what fixtures/greenhouse/*_dropdown_* shows while a menu is open:
 *   .select__container
 *     .select__control > .select__value-container > (placeholder | single-value) + input#<id>[role=combobox]
 *     .select__menu > .select__menu-list[role=listbox]#react-select-<id>-listbox
 *        > .select__option[role=option]#react-select-<id>-option-<n>
 *        (the Loading / No options notices live INSIDE the list, as in react-select v5)
 * Behaviour copied from react-select, deliberately strict so tests prove the
 * extension sends the right events:
 *   - opens on MOUSEDOWN (left button) on the control; a bare click does nothing
 *   - typing into the input (input event) opens and filters ("contains")
 *   - async: shows .select__menu-notice--loading, then results after `delay` ms
 *   - an option is chosen on CLICK
 *   - Escape on the input, or blur, closes
 * Options can carry a flag + dial code (Greenhouse phone "Country"), shown
 * after selection as flag + code only, like the capture.
 *
 * window.__harness records: open (currently open menus), maxOpen, opened (count).
 */
(function () {
  'use strict';

  const H = (window.__harness = window.__harness || { open: 0, maxOpen: 0, opened: 0 });

  function track(delta) {
    H.open += delta;
    if (delta > 0) H.opened++;
    H.maxOpen = Math.max(H.maxOpen, H.open);
  }

  /**
   * config: { [inputId]: { options: [label | { label, code }], delay?: ms,
   *                         flaky?: n (first n option clicks do not stick) } }
   */
  window.installReactSelect = function (config) {
    for (const input of document.querySelectorAll('input.select__input[role="combobox"]')) {
      const cfg = config[input.id];
      if (!cfg) continue;
      const container = input.closest('.select__container');
      const control = container.querySelector('.select__control');
      const shell = control.parentElement;
      const vc = container.querySelector('.select__value-container');
      let menu = null;
      let flaky = cfg.flaky || 0;
      let pending = null;

      const items = cfg.options.map((o) => (typeof o === 'string' ? { label: o } : o));

      function setExpanded(v) {
        input.setAttribute('aria-expanded', v ? 'true' : 'false');
        if (v) input.setAttribute('aria-controls', `react-select-${input.id}-listbox`);
        else input.removeAttribute('aria-controls');
      }

      function makeList() {
        const list = document.createElement('div');
        list.className = 'select__menu-list';
        list.setAttribute('role', 'listbox');
        list.id = `react-select-${input.id}-listbox`;
        return list;
      }

      function render(query) {
        if (!menu) return;
        menu.textContent = '';
        const list = makeList();
        const q = (query || '').toLowerCase();
        const hits = items.filter((it) => it.label.toLowerCase().includes(q));
        hits.forEach((it, n) => {
          const opt = document.createElement('div');
          opt.className = 'select__option' + (n === 0 ? ' select__option--is-focused' : '');
          opt.setAttribute('role', 'option');
          opt.setAttribute('aria-selected', 'false');
          opt.id = `react-select-${input.id}-option-${n}`;
          if (it.code) {
            const flag = document.createElement('div');
            flag.className = 'iti__flag';
            const name = document.createElement('span');
            name.textContent = it.label;
            const code = document.createElement('span');
            code.textContent = it.code;
            opt.append(flag, name, code);
          } else {
            opt.textContent = it.label;
          }
          opt.addEventListener('click', () => choose(it));
          list.appendChild(opt);
        });
        if (!hits.length) {
          // react-select v5 renders NoOptionsMessage inside the MenuList.
          const none = document.createElement('div');
          none.className = 'select__menu-notice select__menu-notice--no-options';
          none.textContent = 'No options';
          list.appendChild(none);
        }
        menu.appendChild(list);
      }

      function open(query) {
        if (!menu) {
          menu = document.createElement('div');
          menu.className = 'select__menu';
          // react-select keeps focus in the input while the menu is used.
          menu.addEventListener('mousedown', (e) => e.preventDefault());
          shell.appendChild(menu);
          setExpanded(true);
          track(1);
        }
        clearTimeout(pending);
        if (cfg.delay) {
          menu.textContent = '';
          const loading = document.createElement('div');
          loading.className = 'select__menu-notice select__menu-notice--loading';
          loading.textContent = 'Loading...';
          // LoadingMessage is also rendered inside the MenuList.
          const list = makeList();
          list.appendChild(loading);
          menu.appendChild(list);
          pending = setTimeout(() => render(query), cfg.delay);
        } else {
          render(query);
        }
      }

      function close() {
        clearTimeout(pending);
        if (!menu) return;
        menu.remove();
        menu = null;
        setExpanded(false);
        track(-1);
      }

      function choose(it) {
        if (flaky > 0) {
          flaky--;
          close(); // the click "lost" the selection
          return;
        }
        vc.querySelectorAll('.select__placeholder, .select__single-value').forEach((n) => n.remove());
        const sv = document.createElement('div');
        sv.className = 'select__single-value';
        if (it.code) {
          const flag = document.createElement('div');
          flag.className = 'iti__flag';
          const code = document.createElement('span');
          code.textContent = it.code;
          sv.append(flag, code);
        } else {
          sv.textContent = it.label;
        }
        vc.insertBefore(sv, vc.firstChild);
        vc.classList.add('select__value-container--has-value');
        input.value = '';
        close();
      }

      control.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        if (menu) close();
        else open(input.value);
      });
      input.addEventListener('input', () => open(input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
      });
      input.addEventListener('blur', close);
    }
  };
})();
