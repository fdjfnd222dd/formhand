/*
 * Test harness for the Workday adapter and for the generic dropdown routine.
 * Brings the widgets of Workday's REAL markup back to life: the pages in
 * tests/harness/workday-*.html copy the structure of the captures in
 * fixtures/workday/ (one tenant, <company>.wd5.myworkdayjobs.com, 2026-10-02), and
 * installWorkday() does the same for the captures themselves (a saved page
 * cannot run Workday's JS).
 *
 * What was SEEN on the real pages (and is copied exactly):
 *   dropdown   button[aria-haspopup=listbox][type=button][value=""] "Select One",
 *              aria-label "<Label> Select One Required", followed by a phantom
 *              input[type=text][value=""] and span.menu-icon.
 *              Open (click): button gets aria-expanded=true + aria-controls and a
 *              popup is PORTALED to <body>:
 *                div[data-behavior-click-outside-close][data-popper-placement]
 *                  > div[visibility=opened] > ul[role=listbox]#<id>
 *                    > li[role=option][data-value=""]  (first row: disabled "Select One",
 *                      id=select-one; the chosen row has aria-selected) > div text
 *              A pick (click on a row) sets the button text, value and aria-label and
 *              removes the popup; Escape or a mousedown outside closes it.
 *   prompt     input[data-uxi-widget-type=selectinput][placeholder=Search] (no type,
 *              no role) in div[multiselectInputContainer]. A pick adds the real pill
 *              ul[role=listbox][selectedItemList] > li[menuItem] > div[role=option]
 *              [selectedItem] > div[DELETE_charm] + p[promptOption].
 * What was NEVER captured (modelled plausibly, so the tests prove our
 * assumptions, not Workday's behavior): the prompt's results popup. Here it is
 * a portaled div[activeListContainer] > ul[role=listbox] of li[role=option]
 * [promptOption] rows, opened by a click and filtered by typing + Enter (50 ms
 * "busy"). Category rows carry aria-expanded and must never be picked.
 *
 * Switches on hand-written pages (data attributes):
 *   button[data-options="A|B"]       the dropdown's options
 *     data-flaky="n"                 the first n picks do not stick
 *     data-never="1"                 the popup never opens
 *     data-reveal="Value=tplId"      choosing Value inserts <template tplId> after the
 *                                    field's formField (or after data-reveal-after)
 *   input[data-prompt-options="A|B"] the prompt's leaf rows; data-prompt-categories="X|Y"
 *   input[type=checkbox][data-reveal-checked=tplId]   reveals on check
 *   [data-nav]                       clicks recorded in __harness.navClicks (old pages)
 * On a capture: window.installWorkday({ '<button or input id>': cfg, '*': cfg })
 *   (call it BEFORE the extension scripts are injected; the adapter itself detects a saved
 *   capture from the og:url / canonical it was saved from)
 *   cfg = { options: [...], categories?: [...], flaky?, never?, delay? }; '*' is the
 *   default for every dropdown without its own entry; a dropdown with no config at
 *   all stays inert (its click does nothing). A popup frozen open in the capture is
 *   removed first (its rows become that dropdown's options when none were given).
 *
 * window.__harness records: open (popups now open), maxOpen, opened (count),
 * navClicks, categoryClicks (only once one happened), promptClicks (clicks per prompt input id:
 * the opener press), pillClicks, inert (ids),
 * phantom (events that touched a dropdown's phantom input), forbidden (clicks on
 * things the extension must never click: footer, header, Add / Delete, SMS opt-in,
 * pills, calendar...). A forbidden click also sets window.__clicked, which
 * tests/fixtures.test.js asserts is undefined.
 */
(function () {
  'use strict';

  const H = (window.__harness = window.__harness || { open: 0, maxOpen: 0, opened: 0 });
  H.navClicks = H.navClicks || [];
  H.forbidden = H.forbidden || [];
  H.phantom = H.phantom || [];
  H.inert = H.inert || [];
  H.pillClicks = H.pillClicks || 0;

  let seq = 0;
  const uid = () => 'q' + (++seq).toString(36) + 'x' + Math.floor(Math.random() * 1e4).toString(36);

  function track(delta) {
    H.open += delta;
    if (delta > 0) H.opened++;
    H.maxOpen = Math.max(H.maxOpen, H.open);
  }

  function el(tag, attrs, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }

  const aid = (n) => (n.getAttribute ? n.getAttribute('data-automation-id') : null);

  /* ------------------------------------------------------------------ */
  /* Never-click watch                                                    */
  /* ------------------------------------------------------------------ */

  // Anything here must not receive a click from the extension. Dropdown openers
  // in the apply flow, popup rows, radios and ordinary checkboxes are fine.
  function forbiddenReason(t) {
    if (!t || !t.closest) return null;
    if (t.closest('[data-automation-id="pageFooter"]')) return 'footer';
    if (t.closest('header, [data-automation-id="utilityButtonBar"]')) return 'header';
    if (t.closest('[data-automation-id="selectedItem"]')) return 'pill';
    if (t.closest('[data-automation-id="dateIcon"]')) return 'calendar';
    if (t.closest('[data-automation-id="phone-sms-opt-in"]')) return 'sms-opt-in';
    if (t.closest('[data-automation-id="add-button"]')) return 'add';
    if (t.closest('[data-automation-id="delete-file"], [data-automation-id="select-files"]')) return 'file';
    if (t.closest('a[href]')) return 'link';
    const b = t.closest('button');
    if (b && !b.hasAttribute('aria-haspopup') && !b.closest('[data-behavior-click-outside-close]')) {
      return 'button ' + (aid(b) || b.textContent.trim().slice(0, 20));
    }
    const phantom = t.closest('input[type="text"]');
    if (phantom && phantom.previousElementSibling && phantom.previousElementSibling.matches('button[aria-haspopup="listbox"]')) return 'phantom';
    return null;
  }

  function watchClicks() {
    if (H.watching) return;
    H.watching = true;
    document.addEventListener('click', (e) => {
      const why = forbiddenReason(e.target);
      if (!why) return;
      H.forbidden.push(why);
      window.__clicked = H.forbidden;
      if (why === 'pill') H.pillClicks++;
    }, true);
  }

  /* ------------------------------------------------------------------ */
  /* Reveals (dependent fields)                                           */
  /* ------------------------------------------------------------------ */

  function reveal(templateId, after) {
    const t = document.getElementById(templateId);
    if (!t || document.querySelector(`[data-revealed-from="${templateId}"]`)) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('data-revealed-from', templateId);
    wrap.appendChild(t.content.cloneNode(true));
    after.after(wrap);
    wire(wrap);
  }

  const formFieldOf = (n) => n.closest('[data-automation-id^="formField-"]') || n;

  /* ------------------------------------------------------------------ */
  /* Button dropdown (real Workday markup)                                */
  /* ------------------------------------------------------------------ */

  function dropdown(btn, cfg) {
    const options = cfg.options || [];
    let flaky = cfg.flaky != null ? cfg.flaky : parseInt(btn.getAttribute('data-flaky') || '0', 10);
    const never = cfg.never != null ? cfg.never : !!btn.getAttribute('data-never');
    const original = btn.getAttribute('aria-label') || '';
    let popup = null;
    let outside = null;
    let chosen = '';

    // The phantom input after the button: record anything that touches it.
    const phantom = btn.nextElementSibling;
    if (phantom && phantom.matches('input[type="text"]')) {
      for (const type of ['input', 'change', 'keydown', 'focus', 'click']) {
        phantom.addEventListener(type, () => H.phantom.push(type + ' after ' + (btn.id || btn.name)), true);
      }
    }

    function close() {
      if (!popup) return;
      document.removeEventListener('mousedown', outside, true);
      popup.remove();
      popup = null;
      btn.setAttribute('aria-expanded', 'false');
      btn.removeAttribute('aria-controls');
      track(-1);
    }

    function pick(text, id) {
      chosen = text;
      btn.textContent = text;
      btn.setAttribute('value', id);
      if (original) btn.setAttribute('aria-label', original.replace('Select One', text));
      close();
      const rule = btn.getAttribute('data-reveal');
      if (rule) {
        const [val, tpl] = rule.split('=');
        if (val === text) {
          const after = btn.getAttribute('data-reveal-after');
          reveal(tpl, (after && document.querySelector(after)) || formFieldOf(btn));
        }
      }
    }

    function open() {
      if (never) return;
      const ulId = uid();
      popup = el('div', { 'data-behavior-click-outside-close': 'topmost', 'data-popper-placement': 'bottom' });
      const inner = el('div', { visibility: 'opened', width: '344' });
      const ul = el('ul', { role: 'listbox', tabindex: '-1', 'aria-required': 'true', id: ulId });
      const first = el('li', { 'data-value': '', role: 'option', 'aria-disabled': 'true', id: 'select-one' });
      first.appendChild(el('div', {}, 'Select One'));
      ul.appendChild(first);
      options.forEach((text, i) => {
        const id = `${btn.id || btn.name}-opt${i}`;
        const li = el('li', { 'data-value': '', role: 'option', id });
        if (text === chosen) {
          li.setAttribute('aria-selected', 'true');
          ul.setAttribute('aria-activedescendant', id);
        }
        li.appendChild(el('div', {}, text));
        li.addEventListener('click', () => {
          if (flaky > 0) {
            flaky--;
            close();
            return;
          }
          pick(text, id);
        });
        ul.appendChild(li);
      });
      ul.addEventListener('keydown', (e) => e.key === 'Escape' && close());
      inner.appendChild(ul);
      popup.appendChild(inner);
      document.body.appendChild(popup);
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-controls', ulId);
      outside = (e) => {
        if (popup && !popup.contains(e.target) && e.target !== btn) close();
      };
      document.addEventListener('mousedown', outside, true);
      track(1);
    }

    btn.addEventListener('click', () => (popup ? close() : open()));
    btn.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  }

  /* ------------------------------------------------------------------ */
  /* Multiselect prompt (popup modelled, pills real)                      */
  /* ------------------------------------------------------------------ */

  function prompt(input, cfg) {
    const leaves = cfg.options || [];
    const cats = cfg.categories || [];
    const box = input.closest('[data-automation-id="multiselectInputContainer"]') || input.parentElement;
    let popup = null;
    let pending = null;
    let outside = null;

    function close() {
      clearTimeout(pending);
      if (!popup) return;
      document.removeEventListener('mousedown', outside, true);
      popup.remove();
      popup = null;
      input.removeAttribute('aria-expanded');
      track(-1);
    }

    function addPill(text) {
      let list = box.querySelector('[data-automation-id="selectedItemList"]');
      if (!list) {
        const holder = el('div', { tabindex: '-1' });
        list = el('ul', {
          role: 'listbox', tabindex: '0', 'data-automation-id': 'selectedItemList', 'aria-label': 'items selected',
          'data-uxi-widget-type': 'selectinputlist',
        });
        holder.appendChild(list);
        box.appendChild(holder);
      }
      const li = el('li', {
        role: 'presentation', 'data-automation-id': 'menuItem', 'data-automation-selected': 'false',
        'data-uxi-widget-type': 'selectinputlistitem',
      });
      const pill = el('div', {
        id: 'pill-' + uid(), role: 'option', 'data-automation-id': 'selectedItem',
        'aria-label': `${text}, press delete to clear value.`, 'aria-posinset': '1', 'aria-setsize': '1', tabindex: '-1',
      });
      pill.appendChild(el('div', { 'data-automation-id': 'DELETE_charm', role: 'presentation', 'aria-hidden': 'true', tabindex: '-1' }));
      pill.appendChild(el('p', { 'data-automation-id': 'promptOption', 'data-automation-label': text }, text));
      li.appendChild(pill);
      list.appendChild(li);
      const note = box.querySelector('[data-automation-id="promptAriaInstruction"]');
      if (note) note.textContent = `1 item selected, ${text}`;
    }

    function show(term) {
      if (!popup) {
        popup = el('div', { 'data-automation-id': 'activeListContainer' });
        popup.appendChild(el('ul', { role: 'listbox', tabindex: '-1', id: uid() }));
        document.body.appendChild(popup);
        input.setAttribute('aria-expanded', 'true');
        outside = (e) => {
          if (popup && !popup.contains(e.target) && e.target !== input) close();
        };
        document.addEventListener('mousedown', outside, true);
        track(1);
      }
      const ul = popup.firstChild;
      ul.textContent = '';
      ul.setAttribute('aria-busy', 'true');
      clearTimeout(pending);
      pending = setTimeout(() => {
        ul.removeAttribute('aria-busy');
        const t = (term || '').toLowerCase();
        cats.filter((c) => c.toLowerCase().includes(t)).forEach((c) => {
          const row = el('li', { role: 'option', 'aria-expanded': 'false', 'data-automation-id': 'promptOption' }, c);
          row.addEventListener('click', () => { H.categoryClicks = (H.categoryClicks || 0) + 1; });
          ul.appendChild(row);
        });
        leaves.filter((l) => l.toLowerCase().includes(t)).forEach((l) => {
          const row = el('li', { role: 'option', 'data-automation-id': 'promptOption', 'data-automation-label': l }, l);
          row.addEventListener('click', () => {
            addPill(l);
            input.value = '';
            close();
          });
          ul.appendChild(row);
        });
      }, cfg.delay != null ? cfg.delay : 50);
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') show(input.value);
      if (e.key === 'Escape') close();
    });
    input.addEventListener('click', () => {
      H.promptClicks = H.promptClicks || {};
      H.promptClicks[input.id] = (H.promptClicks[input.id] || 0) + 1;
      show('');
    });
  }

  /* ------------------------------------------------------------------ */
  /* Dates: Workday stores the month unpadded and echoes it in a display  */
  /* ------------------------------------------------------------------ */

  function dateSection(input) {
    input.addEventListener('input', () => {
      if (/dateSectionMonth/.test(aid(input) || '') && /^\d+$/.test(input.value)) input.value = String(Number(input.value));
      const shown = document.getElementById(input.id.replace(/-input$/, '-display'));
      if (shown) shown.textContent = /^\d+$/.test(input.value) ? input.value.padStart(/Year/.test(input.id) ? 4 : 2, '0') : '';
      if (/^\d+$/.test(input.value)) input.setAttribute('aria-valuenow', input.value);
    });
  }

  /* ------------------------------------------------------------------ */
  /* Wiring                                                               */
  /* ------------------------------------------------------------------ */

  const splitList = (s) => (s ? s.split('|').filter(Boolean) : []);

  function wire(rootNode, config) {
    // Hand-written pages: switches on the elements.
    rootNode.querySelectorAll('button[aria-haspopup="listbox"][data-options]').forEach((b) => {
      if (b.__wired) return;
      b.__wired = true;
      dropdown(b, { options: splitList(b.getAttribute('data-options')) });
    });
    rootNode.querySelectorAll('input[data-prompt-options]').forEach((i) => {
      if (i.__wired) return;
      i.__wired = true;
      prompt(i, { options: splitList(i.getAttribute('data-prompt-options')), categories: splitList(i.getAttribute('data-prompt-categories')) });
    });
    // Captures: configuration by id.
    if (config) {
      const flow = '[data-automation-id^="applyFlow"][data-automation-id$="Page"]';
      rootNode.querySelectorAll(`${flow} button[aria-haspopup="listbox"]`).forEach((b) => {
        if (b.__wired) return;
        const cfg = config[b.id] || config['*'];
        if (!cfg) {
          H.inert.push(b.id);
          return;
        }
        b.__wired = true;
        dropdown(b, cfg);
      });
      rootNode.querySelectorAll(`${flow} input[data-uxi-widget-type="selectinput"]`).forEach((i) => {
        if (i.__wired) return;
        const cfg = config[i.id] || config['*prompt'];
        if (!cfg) {
          H.inert.push(i.id);
          return;
        }
        i.__wired = true;
        prompt(i, cfg);
      });
    }
    rootNode.querySelectorAll('[data-automation-id^="dateSection"][data-automation-id$="-input"]').forEach((i) => {
      if (!i.__wired) {
        i.__wired = true;
        dateSection(i);
      }
    });
    rootNode.querySelectorAll('input[type="checkbox"][data-reveal-checked]').forEach((cb) => {
      if (cb.__wired) return;
      cb.__wired = true;
      cb.addEventListener('change', () => {
        if (cb.checked) reveal(cb.getAttribute('data-reveal-checked'), formFieldOf(cb));
      });
    });
    rootNode.querySelectorAll('[data-nav]').forEach((b) => {
      if (b.__wired) return;
      b.__wired = true;
      b.addEventListener('click', () => H.navClicks.push(b.getAttribute('data-nav')));
    });
  }

  /**
   * A saved page's popup frozen open (the _dropdown_ captures): remove it, and
   * keep its rows as the options of the dropdown that owned it.
   */
  function takeFrozenPopups() {
    const harvested = {};
    document.querySelectorAll('[data-behavior-click-outside-close] [role="listbox"]').forEach((ul) => {
      const owner = document.querySelector(`button[aria-controls="${ul.id}"]`);
      if (owner) {
        harvested[owner.id] = Array.from(ul.querySelectorAll('[role="option"]'))
          .filter((o) => o.getAttribute('aria-disabled') !== 'true')
          .map((o) => o.textContent.replace(/\s+/g, ' ').trim());
        owner.removeAttribute('aria-controls');
        owner.setAttribute('aria-expanded', 'false');
      }
      ul.closest('[data-behavior-click-outside-close]').remove();
    });
    document.querySelectorAll('button[aria-controls]').forEach((b) => {
      if (!document.getElementById(b.getAttribute('aria-controls'))) b.removeAttribute('aria-controls');
    });
    return harvested;
  }

  window.installWorkday = function (config) {
    const harvested = takeFrozenPopups();
    const cfg = { ...config };
    for (const [id, options] of Object.entries(harvested)) cfg[id] = { ...(cfg[id] || cfg['*'] || {}), options: (cfg[id] && cfg[id].options) || options };
    H.harvested = Object.keys(harvested);
    wire(document, cfg);
  };

  watchClicks();
  wire(document);
})();
