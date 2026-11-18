// Ritlager – toolbar button.
// Clicking the button injects ritlager/overlay.js into the current tab, in the page's own
// JavaScript world (just like the bookmarklet), so drawings, settings and saved colours work
// the same way. overlay.js toggles itself when it is already on the page.
const api = globalThis.browser || globalThis.chrome;

async function onActionClick(tab) {
  if (!tab || tab.id == null) return;
  try {
    await api.scripting.executeScript({
      target: { tabId: tab.id },
      world: 'MAIN',
      files: ['ritlager/overlay.js']
    });
    await api.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (e) {
    // Browser-internal pages (chrome://, edge://, about:, the web stores …) don't allow extensions.
    await api.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#d6282b' });
    await api.action.setBadgeText({ tabId: tab.id, text: '!' });
    await api.action.setTitle({ tabId: tab.id, title: 'Ritlager can’t run on this page' });
  }
}

api.action.onClicked.addListener(onActionClick);
