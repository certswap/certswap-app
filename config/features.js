// CertSwap Feature Flags
// This file is served at /config/features.js and loaded by all frontend pages.
// Backend reads it via require('../config/features') (Node.js module.exports variant is below).

(function () {
  'use strict';

  window.CertSwapConfig = {
    // ---- Modules ----
    MODULE_WEB3_ENABLED:    true,   // MetaMask / Polygon direct mode
    MODULE_BACKEND_ENABLED: true,   // Backend (no-wallet) mode
    MODULE_BRIDGE_ENABLED:  true,   // Bridge mode — modal on every tx

    // ---- Fee layer (placeholder, not applied yet) ----
    FEE_PERCENT: 0,         // 0 = no fee; future: e.g. 1.5
    FEE_PAYER:   'split',   // 'buyer' | 'seller' | 'split'

    // ---- Backend URL (empty = same origin; set for cross-origin deploys) ----
    BACKEND_URL: 'https://certswap.onrender.com',

    // ---- Contract ----
    CONTRACT_ADDRESS: '0xc37E52BA192d25bBB885082eE938984CcEd044b0',
    CHAIN_ID:         80002,
    NETWORK_NAME:     'Polygon Amoy Testnet',
    RPC_URL:          'https://rpc-amoy.polygon.technology',
    EXPLORER_URL:     'https://amoy.polygonscan.com',

    // ---- Admin feature flags ----
    ADMIN_CODE_REGISTRY_ENABLED: true,

    // ---- Brands catalog ----
    BRANDS: [
      { id: 'PIZZA',  name: '🍕 Pizza Place',  color: '#e74c3c' },
      { id: 'COFFEE', name: '☕ Coffee Shop',   color: '#8b4513' },
      { id: 'BARBER', name: '✂️ Barber Pro',    color: '#3498db' },
      { id: 'BOOKS',  name: '📚 Books Store',   color: '#27ae60' },
      { id: 'CINEMA', name: '🎬 Cinema',        color: '#9b59b6' },
      { id: 'SHOP',   name: '🛒 Shop',          color: '#f39c12' }
    ]
  };
})();
