/*
 * popup/popup.js
 *
 * Toolbar popup: pick the profile used for filling, press Fill, toggle learn mode.
 * The popup does not inject anything itself: it asks background.js to
 * (message { type: 'fill' }), because the injection needs the background's
 * permissions and file list. Then it closes.
 *
 * Embedded forms: filling a Greenhouse / Lever / Ashby frame in place needs
 * the manifest's four host permissions. Firefox may leave them ungranted
 * (an upgraded install, or the owner revoked them in about:addons); then a
 * button asks for them (permissions.request needs this click). Without them
 * such frames are opened in their own tab instead.
 */
'use strict';

const $ = (id) => document.getElementById(id);
const list = $('profile-list');
let data = null;

function render() {
  list.textContent = '';
  for (const p of data.profiles) {
    const label = document.createElement('label');
    label.className = 'profile';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'profile';
    radio.value = p.id;
    radio.checked = p.id === data.activeProfileId;
    const span = document.createElement('span');
    span.textContent = p.name;
    label.append(radio, span);
    list.appendChild(label);
  }
  const active = data.profiles.find((p) => p.id === data.activeProfileId);
  $('active-line').textContent = 'Filling with: ' + active.name;
  $('learn-mode').checked = !!data.settings.learnMode;
}

async function reload() {
  data = await AF.storage.load();
  render();
}

list.addEventListener('change', async (e) => {
  if (e.target.name !== 'profile') return;
  await AF.storage.setActiveProfile(e.target.value);
  await reload();
});

$('learn-mode').addEventListener('change', async (e) => {
  await AF.storage.saveSettings({ learnMode: e.target.checked });
});

$('fill-btn').addEventListener('click', async () => {
  try { await browser.runtime.sendMessage({ type: 'fill' }); } catch (err) { /* background will log */ }
  window.close();
});

$('options-btn').addEventListener('click', async () => {
  await browser.runtime.openOptionsPage();
  window.close();
});

const EMBED_ORIGINS = AF.embed.FILL_HOSTS.map((h) => `https://${h}/*`);

async function checkEmbedPermission() {
  const p = browser.permissions;
  if (!p || !p.contains) return;
  $('embed-perm').hidden = await p.contains({ origins: EMBED_ORIGINS });
}

$('embed-allow').addEventListener('click', async () => {
  try {
    await browser.permissions.request({ origins: EMBED_ORIGINS });
  } catch (err) { /* refused or unavailable: the button stays */ }
  await checkEmbedPermission();
});

checkEmbedPermission().catch(() => {});

reload().catch((err) => { $('active-line').textContent = 'Load failed: ' + err.message; });
