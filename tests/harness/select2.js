/*
 * Test harness: makes the static select2 4.0 markup of a saved Avature page
 * behave like select2 again, with an ajax data source.
 *
 * Mirrors fixtures/avature/*_dropdown_* (a select2 popup frozen open):
 *   <select id=X> (placeholder option only: real options come by ajax)
 *   span.select2 > .selection > .select2-selection[role=combobox][aria-controls=select2-X-results]
 *       > .select2-selection__rendered > .select2-selection__placeholder
 *   appended to <body> while open:
 *   span.select2-container.select2-container--open
 *     > span.select2-dropdown > span.select2-search > input.select2-search__field
 *                             > span.select2-results > ul#select2-X-results[role=listbox]
 *                                 > li.select2-results__option[role=option]
 *                                   (li.loading-results "Searching…" while fetching)
 * Behaviour copied from select2 4.0.x, strict on purpose:
 *   - opens on MOUSEDOWN with which === 1 on the selection
 *   - typing in the search field (input event) re-queries after `delay` ms
 *   - an option is chosen on MOUSEUP (4.0), a click alone does nothing
 *   - choosing appends <option selected> to the native select, renders the text,
 *     fires change on the select, closes
 *   - Escape (keyCode 27) in the search field closes; mousedown elsewhere closes
 */
(function () {
  'use strict';

  const H = (window.__harness = window.__harness || { open: 0, maxOpen: 0, opened: 0 });

  function track(delta) {
    H.open += delta;
    if (delta > 0) H.opened++;
    H.maxOpen = Math.max(H.maxOpen, H.open);
  }

  /** config: { [selectId]: { options: [text], delay?: ms, flaky?: n, never?: bool } } */
  window.installSelect2 = function (config) {
    for (const [id, cfg] of Object.entries(config)) {
      const select = document.getElementById(id);
      if (!select) continue;
      const spec = select.closest('.fieldSpec') || select.parentElement;
      const selection = spec.querySelector('.select2-selection');
      const rendered = selection.querySelector('.select2-selection__rendered');
      const outer = selection.closest('.select2-container');
      let drop = null;
      let pending = null;
      let flaky = cfg.flaky || 0;
      let seq = 0;

      function results() {
        return drop.querySelector('ul.select2-results__options');
      }

      function query(term) {
        const ul = results();
        ul.textContent = '';
        const loading = document.createElement('li');
        loading.className = 'select2-results__option loading-results';
        loading.setAttribute('role', 'alert');
        loading.textContent = 'Searching…';
        ul.appendChild(loading);
        clearTimeout(pending);
        pending = setTimeout(() => {
          if (!drop) return;
          ul.textContent = '';
          const t = (term || '').toLowerCase();
          const hits = cfg.options.filter((o) => o.toLowerCase().includes(t));
          if (!hits.length) {
            const none = document.createElement('li');
            none.className = 'select2-results__option select2-results__message';
            none.setAttribute('role', 'alert');
            none.textContent = 'No results found';
            ul.appendChild(none);
          }
          hits.forEach((text, n) => {
            const li = document.createElement('li');
            li.className = 'select2-results__option WizardFieldInput' + (n === 0 ? ' select2-results__option--highlighted' : '');
            li.id = 'li' + (++seq);
            li.setAttribute('role', 'option');
            li.setAttribute('aria-selected', 'false');
            li.textContent = text;
            li.addEventListener('mouseup', () => choose(text));
            ul.appendChild(li);
          });
        }, cfg.delay == null ? 60 : cfg.delay);
      }

      function open() {
        if (drop || cfg.never) return;
        drop = document.createElement('span');
        drop.className = 'select2-container select2-container--default select2-container--open';
        drop.innerHTML =
          '<span class="select2-dropdown bigdrop select2-dropdown--below">' +
          '<span class="select2-search select2-search--dropdown">' +
          `<input class="select2-search__field" type="search" role="searchbox" aria-controls="select2-${id}-results"></span>` +
          `<span class="select2-results"><ul id="select2-${id}-results" class="select2-results__options" role="listbox" aria-expanded="true"></ul></span>` +
          '</span>';
        document.body.appendChild(drop);
        outer.classList.add('select2-container--open');
        selection.setAttribute('aria-expanded', 'true');
        const search = drop.querySelector('.select2-search__field');
        search.addEventListener('input', () => query(search.value));
        search.addEventListener('keydown', (e) => {
          if (e.keyCode === 27) close();
        });
        track(1);
        query('');
      }

      function close() {
        clearTimeout(pending);
        if (!drop) return;
        drop.remove();
        drop = null;
        outer.classList.remove('select2-container--open');
        selection.setAttribute('aria-expanded', 'false');
        track(-1);
      }

      function choose(text) {
        if (flaky > 0) {
          flaky--;
          close();
          return;
        }
        const opt = document.createElement('option');
        opt.value = 'v' + (++seq);
        opt.textContent = text;
        select.appendChild(opt);
        select.value = opt.value;
        rendered.textContent = text;
        rendered.setAttribute('title', text);
        select.dispatchEvent(new Event('change', { bubbles: true }));
        close();
      }

      selection.addEventListener('mousedown', (e) => {
        if (e.which !== 1) return;
        if (drop) close();
        else open();
      });
      document.addEventListener('mousedown', (e) => {
        if (drop && !drop.contains(e.target) && !selection.contains(e.target)) close();
      });
    }
  };
})();
