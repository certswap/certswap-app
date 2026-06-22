// CertSwap Backend API wrapper
// Defines window.API and shared UI helpers used by all pages.

const API_BASE = (function () {
  var cfg = window.CertSwapConfig || {};
  return (cfg.BACKEND_URL && cfg.BACKEND_URL !== window.location.origin) ? cfg.BACKEND_URL : '';
})();

// ── User ID (localStorage) ────────────────────────────────────────────────
function _initLocalUserId() {
  try {
    let id = localStorage.getItem('certswap_user_id');
    if (!id) {
      id = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = (Math.random() * 16) | 0;
            return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
          });
      localStorage.setItem('certswap_user_id', id);
    }
    return id;
  } catch { return null; }
}

const LOCAL_USER_ID = _initLocalUserId();

// ── Core fetch wrapper ────────────────────────────────────────────────────
async function api(path, options = {}) {
  const { headers: extraHeaders, ...rest } = options;
  try {
    const res = await fetch(API_BASE + path, {
      credentials: 'include',
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(LOCAL_USER_ID ? { 'X-User-Id': LOCAL_USER_ID } : {}),
        ...extraHeaders,
      },
    });
    return await res.json();
  } catch (err) {
    return { success: false, message: 'Помилка мережі: ' + err.message };
  }
}

// ── API methods ───────────────────────────────────────────────────────────
const API = {
  health:     ()                                                => api('/api/health'),
  session:    ()                                                => api('/api/session'),
  activate:   (code)                                           => api('/api/activate',    { method: 'POST', body: JSON.stringify({ code }) }),
  balance:    ()                                                => api('/api/balance'),
  verify:     (code)                                           => api('/api/verify?code=' + encodeURIComponent(code)),
  exchange:   (give_brand, give_amount, get_brand, get_amount) => api('/api/exchange',    { method: 'POST', body: JSON.stringify({ give_brand, give_amount, get_brand, get_amount }) }),
  pay:        (brand, amount, validity_seconds)                => api('/api/pay',         { method: 'POST', body: JSON.stringify({ brand, amount, validity_seconds }) }),
  giftCreate: (brand, amount)                                  => api('/api/gift/create', { method: 'POST', body: JSON.stringify({ brand, amount }) }),
  giftClaim:  (gift_hash)                                      => api('/api/gift/claim',  { method: 'POST', body: JSON.stringify({ gift_hash }) }),
  giftCheck:  (gift_hash)                                      => api('/api/gift/check?gift_hash=' + encodeURIComponent(gift_hash)),
  authMe:      ()       => api('/api/auth/me'),
  authEmail:   (email) => api('/api/auth/email',   { method: 'POST', body: JSON.stringify({ email }) }),
  authRestore: (email) => api('/api/auth/restore', { method: 'POST', body: JSON.stringify({ email }) }),
};

// ── Profile chip (injected into page header) ──────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  const headerInner = document.querySelector('.header-inner');
  if (!headerInner) return;

  // In Web3 mode: wallet address chip is injected by web3.js
  const mode = window.Provider ? window.Provider.getMode() : 'backend';
  if (mode === 'web3') return;

  const chip = document.createElement('a');
  chip.href = '/profile.html';
  chip.className = 'profile-chip';
  chip.title = 'Профіль';
  chip.innerHTML =
    '<svg class="profile-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<circle cx="10" cy="7" r="3.5" stroke="currentColor" stroke-width="1.5"/>' +
      '<path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>' +
    '<span class="profile-label" id="profileLabel">…</span>';
  headerInner.insertBefore(chip, headerInner.querySelector('#modeBadge')?.parentElement || null);

  function _chipLabel() {
    const email = localStorage.getItem('certswap_user_email');
    if (email) return email.length > 12 ? email.slice(0, 12) + '…' : email;
    if (localStorage.getItem('certswap_metamask_connected')) return 'MetaMask';
    return (window.t && window.t('nav.guest')) || 'Guest';
  }

  function updateProfileChip() {
    const label = document.getElementById('profileLabel');
    if (label) label.textContent = _chipLabel();
  }

  updateProfileChip();

  // Update when localStorage changes from another tab
  window.addEventListener('storage', function (e) {
    if (e.key === 'certswap_user_email' || e.key === 'certswap_metamask_connected') {
      updateProfileChip();
    }
  });

  // Exposed so profile.html can call after sign-in on the same page
  window.updateProfileChip = updateProfileChip;
});

/* ── UI helpers (used by all pages) ───────────────────────────────────── */

function showResult(el, { success, html, message } = {}) {
  if (!el) return;
  el.className = (success ? 'result-valid' : 'result-invalid') + ' mt-4';
  el.style.display = 'block';
  if (html) el.innerHTML = html;
  else el.textContent = message || (success ? 'Успішно' : 'Помилка');
}

function showInfo(el, html) {
  if (!el) return;
  el.className = 'result-info mt-4';
  el.style.display = 'block';
  el.innerHTML = html;
}

function showLoading(el, text = 'Завантаження…') {
  if (!el) return;
  el.className = 'loading mt-4';
  el.textContent = text;
  el.style.display = 'flex';
}

function hideEl(el)              { if (el) el.style.display = 'none'; }
function showEl(el, d = 'block') { if (el) el.style.display = d; }
function clearEl(el)             { if (el) { el.style.display = 'none'; el.innerHTML = ''; } }

function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('uk-UA');
}

function getUrlParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ── Public window.API (used by provider.js and external scripts) ──────────

const BACKEND_URL = (window.CertSwapConfig && window.CertSwapConfig.BACKEND_URL) || '';

window.API = {
  health:         ()                                                => apiFetch('/api/health'),
  session:        ()                                                => apiFetch('/api/session'),
  activate:       (code)                                           => apiFetch('/api/activate',        { method: 'POST', body: JSON.stringify({ code }) }),
  balance:        (brand)                                          => apiFetch('/api/balance' + (brand ? '?brand=' + brand : '')),
  verify:         (code)                                           => apiFetch('/api/verify?code='     + encodeURIComponent(code)),
  exchange:            (give_brand, give_amount, get_brand, get_amount) => apiFetch('/api/exchange',              { method: 'POST', body: JSON.stringify({ give_brand, give_amount, get_brand, get_amount }) }),
  exchangeOrderCreate: (giveBrand, giveAmount, wantBrand, wantAmount) => apiFetch('/api/exchange/order/create', { method: 'POST', body: JSON.stringify({ giveBrand, giveAmount, wantBrand, wantAmount }) }),
  pay:            (brand, amount, validity_seconds)                => apiFetch('/api/pay',             { method: 'POST', body: JSON.stringify({ brand, amount, validity_seconds }) }),
  giftCreate:     (brand, amount)  => apiFetch('/api/gift/create',  { method: 'POST', body: JSON.stringify({ brand, amount }) }),
  giftClaim:      (gift_hash)      => apiFetch('/api/gift/claim',   { method: 'POST', body: JSON.stringify({ gift_hash }) }),
  giftCancel:     (gift_hash)      => apiFetch('/api/gift/cancel',  { method: 'POST', body: JSON.stringify({ gift_hash }) }),
  giftCheck:      (gift_hash)      => apiFetch('/api/gift/check?gift_hash=' + encodeURIComponent(gift_hash)),
  paymentCheck:   (token_hash)                                     => apiFetch('/api/payment/check?token_hash=' + encodeURIComponent(token_hash)),
  paymentConfirm: (token_hash)                                     => apiFetch('/api/payment/confirm', { method: 'POST', body: JSON.stringify({ token_hash }) }),
  history:        ()                                                => apiFetch('/api/history'),
  authMe:         ()       => apiFetch('/api/auth/me'),
  authEmail:      (email) => apiFetch('/api/auth/email',   { method: 'POST', body: JSON.stringify({ email }) }),
  authRestore:    (email) => apiFetch('/api/auth/restore', { method: 'POST', body: JSON.stringify({ email }) }),
};

function apiFetch(path, opts = {}) {
  const userId = localStorage.getItem('certswap_user_id');
  const headers = { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': userId } : {}) };
  return fetch(BACKEND_URL + path, { credentials: 'include', headers, ...opts }).then(r => r.json());
}
