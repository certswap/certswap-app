/**
 * auth-guard.js — page-level identity gate for Bridge mode.
 *
 * Called on every transactional page (activate, wallet, exchange, pay, gift, merchant).
 * If MODULE_BRIDGE_ENABLED and the user is unidentified → redirect to profile.html.
 * No overlays, no modals — identification happens entirely on profile.html.
 */
(function () {
  'use strict';

  window.checkAuth = async function checkAuth() {
    await Provider.configReady;

    console.log('[auth-guard] checkAuth called, bridge:', Provider.isBridgeAvailable(),
      'email:', localStorage.getItem('certswap_user_email'),
      'ethereum:', typeof window.ethereum !== 'undefined');

    // Not in Bridge mode — M1/M2 handle their own identity
    if (!Provider.isBridgeAvailable()) return;

    // Web3 mode: MetaMask present → pass through
    if (localStorage.getItem('certswap_metamask_connected')) return;

    // Backend mode: email saved → pass through
    if (localStorage.getItem('certswap_user_email')) return;

    // Unidentified → send to profile page, come back after registration
    var next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/profile.html?next=' + next);
  };

})();
