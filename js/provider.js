/**
 * CertSwap Provider — unified abstraction over Web3 (MetaMask) and Backend modes.
 *
 * Mode is chosen lazily: on the first signing transaction the user sees a modal.
 * Read operations silently fall back to backend when mode is not yet set.
 *
 * Loading order in HTML:
 *   1. /config/features.js   → window.CertSwapConfig
 *   2. js/web3.js            → window.Web3API
 *   3. js/api.js             → window.API + UI helpers
 *   4. js/provider.js        → window.Provider  (this file)
 *
 * Pages use only Provider.xxx() and never call Web3API/API directly.
 */
(function () {
  'use strict';

  var CFG             = window.CertSwapConfig || {};
  var WEB3_ENABLED    = CFG.MODULE_WEB3_ENABLED    !== false;
  var BACKEND_ENABLED = CFG.MODULE_BACKEND_ENABLED !== false;
  var BRIDGE_ENABLED  = CFG.MODULE_BRIDGE_ENABLED  !== false;
  var BRANDS          = CFG.BRANDS || [
    { id: 'PIZZA',  name: '🍕 Pizza Place',  color: '#e74c3c' },
    { id: 'COFFEE', name: '☕ Coffee Shop',   color: '#8b4513' },
    { id: 'BARBER', name: '✂️ Barber Pro',    color: '#3498db' },
    { id: 'BOOKS',  name: '📚 Books Store',   color: '#27ae60' },
    { id: 'CINEMA', name: '🎬 Cinema',        color: '#9b59b6' },
    { id: 'SHOP',   name: '🛒 Shop',          color: '#f39c12' }
  ];

  // ── Fetch live config from server and update module flags ────────────────
  var _backendUrl = (window.CertSwapConfig && window.CertSwapConfig.BACKEND_URL) || '';
  var _configReady = fetch(_backendUrl + '/api/config')
    .then(function (r) { return r.json(); })
    .then(function (cfg) {
      if (cfg.MODULE_WEB3_ENABLED    !== undefined) WEB3_ENABLED    = !!cfg.MODULE_WEB3_ENABLED;
      if (cfg.MODULE_BACKEND_ENABLED !== undefined) BACKEND_ENABLED = !!cfg.MODULE_BACKEND_ENABLED;
      if (cfg.MODULE_BRIDGE_ENABLED  !== undefined) BRIDGE_ENABLED  = !!cfg.MODULE_BRIDGE_ENABLED;
      if (cfg.payment_token_ttl      !== undefined && window.CertSwapConfig) {
        window.CertSwapConfig._runtimeTTL = Number(cfg.payment_token_ttl);
      }
      if (!WEB3_ENABLED && !BACKEND_ENABLED) {
        document.addEventListener('DOMContentLoaded', _showServiceUnavailable);
      }
      return cfg;
    })
    .catch(function () { return {}; });

  // ── Mode detection (localStorage only, no auto-detect) ────────────────────
  function detectMode() {
    var stored = localStorage.getItem('certswap_mode');
    if (stored === 'web3'    && WEB3_ENABLED)    return 'web3';
    if (stored === 'backend' && BACKEND_ENABLED) return 'backend';
    return null;
  }

  var _mode = detectMode();

  // ── Helpers ───────────────────────────────────────────────────────────────
  function brandName(id) {
    var b = BRANDS.find(function (x) { return x.id === id; });
    return b ? b.name : id;
  }

  function txUrl(hash) {
    var base = (CFG.EXPLORER_URL || 'https://amoy.polygonscan.com');
    return hash ? base + '/tx/' + hash : null;
  }

  function fmtAmount(n) {
    return new Intl.NumberFormat('uk-UA').format(n) + ' грн';
  }

  function fmtDate(ts) {
    if (!ts) return 'Бессрочно';
    var d = ts instanceof Date ? ts : new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
    return d.toLocaleDateString('uk-UA', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // For read operations: if mode not yet chosen, silently use backend
  function _resolveMode() {
    return _mode || (BACKEND_ENABLED ? 'backend' : 'web3');
  }

  // ── i18n helper (uses window.t if loaded, else UA fallback) ──────────────
  function _t(key, fallback) {
    return (typeof window.t === 'function' ? window.t(key) : null) || fallback;
  }

  // ── Service unavailable overlay ───────────────────────────────────────────
  function _showServiceUnavailable() {
    var overlay = document.createElement('div');
    overlay.style.cssText = [
      'position:fixed;inset:0;z-index:99999',
      'background:#0f172a;display:flex;align-items:center;justify-content:center;padding:24px'
    ].join(';');
    overlay.innerHTML =
      '<div style="text-align:center;max-width:420px">' +
        '<div style="font-size:48px;margin-bottom:20px">🔧</div>' +
        '<h2 style="color:#f1f5f9;font-size:22px;margin:0 0 12px">' + _t('service.unavailable.title', 'Сервіс тимчасово недоступний') + '</h2>' +
        '<p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0">' + _t('service.unavailable.desc', 'Технічне обслуговування. Спробуйте пізніше.') + '</p>' +
      '</div>';
    document.body.appendChild(overlay);
  }

  // ── Mode selection modal (Bridge only — shown when BOTH email AND MetaMask available) ──
  function _showModeModal() {
    return new Promise(function (resolve, reject) {
      var overlay = document.createElement('div');
      overlay.style.cssText = [
        'position:fixed;inset:0;z-index:9999',
        'background:rgba(0,0,0,.78);backdrop-filter:blur(5px)',
        'display:flex;align-items:center;justify-content:center;padding:16px'
      ].join(';');

      var dialog = document.createElement('div');
      dialog.style.cssText = [
        'background:#1e293b;border:1px solid #334155;border-radius:16px',
        'padding:32px;max-width:500px;width:100%;box-shadow:0 24px 64px rgba(0,0,0,.6)',
        'position:relative'
      ].join(';');

      dialog.innerHTML =
        '<button id="_csModalClose" style="position:absolute;top:14px;right:16px;background:none;' +
        'border:none;color:#475569;font-size:20px;cursor:pointer;line-height:1;padding:4px">×</button>' +
        '<h2 style="margin:0 0 8px;font-size:20px;color:#f1f5f9">' + _t('modal.title', 'Як зберігати запис про транзакцію?') + '</h2>' +
        '<p style="margin:0 0 24px;color:#94a3b8;font-size:14px">' + _t('modal.subtitle', 'Оберіть один раз — надалі все працюватиме автоматично') + '</p>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
          '<button id="_csOptWeb3" style="background:#0f172a;border:2px solid #334155;border-radius:12px;' +
          'padding:20px 16px;cursor:pointer;text-align:left;color:inherit;font-family:inherit;transition:border-color .15s">' +
            '<div style="font-size:30px;margin-bottom:10px">🦊</div>' +
            '<div style="font-weight:700;font-size:15px;color:#93c5fd;margin-bottom:6px">' + _t('modal.wallet.title', 'У своєму гаманці') + '</div>' +
            '<div style="font-size:12px;color:#64748b;line-height:1.5">' + _t('modal.wallet.desc', 'Через MetaMask. Ви контролюєте ключі — ніхто інший.') + '</div>' +
          '</button>' +
          '<button id="_csOptBackend" style="background:#0f172a;border:2px solid #334155;border-radius:12px;' +
          'padding:20px 16px;cursor:pointer;text-align:left;color:inherit;font-family:inherit;transition:border-color .15s">' +
            '<div style="font-size:30px;margin-bottom:10px">🏛️</div>' +
            '<div style="font-weight:700;font-size:15px;color:#6ee7b7;margin-bottom:6px">' + _t('modal.system.title', 'У системі (як у нотаріуса)') + '</div>' +
            '<div style="font-size:12px;color:#64748b;line-height:1.5">' + _t('modal.system.desc', 'Email або телефон. Без MetaMask — просто браузер.') + '</div>' +
          '</button>' +
        '</div>' +
        '<p style="margin:20px 0 0;font-size:11px;color:#475569;text-align:center">' + _t('modal.footer', 'Можна змінити пізніше в профілі') + '</p>' +
        '<div id="_csModalMsg" style="min-height:0"></div>';

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      function _msg(html) {
        var el = document.getElementById('_csModalMsg');
        if (el) { el.style.marginTop = '16px'; el.innerHTML = html; }
      }

      function close() {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        reject(new Error('cancelled'));
      }

      function pick(mode) {
        if (document.body.contains(overlay)) document.body.removeChild(overlay);
        resolve(mode);
      }

      // × button: show "choose or cancel" prompt — do NOT close the modal
      document.getElementById('_csModalClose').addEventListener('click', function () {
        _msg(
          '<p style="color:#94a3b8;font-size:13px;margin:0 0 10px">Оберіть спосіб або поверніться пізніше</p>' +
          '<button id="_csModalCancel" style="background:#1e293b;border:1px solid #ef4444;color:#f87171;' +
          'border-radius:8px;padding:8px 18px;font-size:13px;cursor:pointer;font-family:inherit">' +
          'Скасувати транзакцію</button>'
        );
        document.getElementById('_csModalCancel').addEventListener('click', function () {
          close();
          history.back();
        });
      });

      // ── MetaMask option ───────────────────────────────────────────────────
      document.getElementById('_csOptWeb3').addEventListener('click', async function () {
        // Already connected this session — skip initWeb3
        if (window.Web3API && window.Web3API.isConnected()) {
          pick('web3');
          return;
        }

        // MetaMask not installed
        if (typeof window.ethereum === 'undefined') {
          _msg(
            '<p style="color:#f87171;font-size:13px;margin:0">MetaMask не встановлений. ' +
            '<a href="https://metamask.io" target="_blank" rel="noopener" style="color:#93c5fd">Встановити →</a></p>'
          );
          return;
        }

        var btn = document.getElementById('_csOptWeb3');
        btn.disabled = true;
        btn.innerHTML = '<div style="font-size:13px;color:#94a3b8;padding:8px 0">⏳ Підключення до MetaMask…</div>';

        try {
          if (window.Web3API && typeof window.Web3API.initWeb3 === 'function') {
            var ok = await window.Web3API.initWeb3();
            if (ok === false) throw new Error('initWeb3 returned false');
          }
          if (!document.body.contains(overlay)) return;
          localStorage.setItem('certswap_metamask_connected', '1');
          // Show brief connected feedback before closing
          btn = document.getElementById('_csOptWeb3');
          if (btn) {
            var addr = window.Web3API && window.Web3API.getUserAddress ? window.Web3API.getUserAddress() : null;
            btn.innerHTML = '<div style="font-size:13px;color:#6ee7b7;padding:8px 0">✅ ' +
              (addr ? addr.slice(0,6) + '…' + addr.slice(-4) : 'Підключено') + '</div>';
          }
          pick('web3');
        } catch (_err) {
          if (!document.body.contains(overlay)) return;
          btn = document.getElementById('_csOptWeb3');
          if (!btn) return;
          btn.disabled = false;
          btn.innerHTML =
            '<div style="font-size:30px;margin-bottom:10px">🦊</div>' +
            '<div style="font-weight:700;font-size:15px;color:#93c5fd;margin-bottom:6px">' + _t('modal.wallet.title', 'У своєму гаманці') + '</div>' +
            '<div style="font-size:12px;color:#64748b;line-height:1.5">' + _t('modal.wallet.desc', 'Через MetaMask. Ви контролюєте ключі — ніхто інший.') + '</div>';
          _msg('<p style="color:#f87171;font-size:13px;margin:0">MetaMask відхилено або сталась помилка. Спробуйте ще або оберіть «У системі».</p>');
        }
      });

      // ── Backend option — email is guaranteed by _ensureMode ───────────────
      document.getElementById('_csOptBackend').addEventListener('click', function () {
        pick('backend');
      });
    });
  }

  // Called before any signing operation. Re-fetches /api/config each time
  // so BRIDGE_ENABLED reflects the current server state, not the cached value.
  function _ensureMode() {
    return fetch(_backendUrl + '/api/config')
      .then(function (r) { return r.json(); })
      .catch(function () { return {}; })
      .then(function (cfg) {
        if (cfg.MODULE_WEB3_ENABLED    !== undefined) WEB3_ENABLED    = !!cfg.MODULE_WEB3_ENABLED;
        if (cfg.MODULE_BACKEND_ENABLED !== undefined) BACKEND_ENABLED = !!cfg.MODULE_BACKEND_ENABLED;
        if (cfg.MODULE_BRIDGE_ENABLED  !== undefined) BRIDGE_ENABLED  = !!cfg.MODULE_BRIDGE_ENABLED;
        if (BRIDGE_ENABLED) { localStorage.removeItem('certswap_mode'); _mode = null; }

        if (!WEB3_ENABLED && !BACKEND_ENABLED) {
          _showServiceUnavailable();
          return Promise.reject(new Error('service_unavailable'));
        }

        console.log('[provider] BRIDGE_ENABLED:', BRIDGE_ENABLED, 'WEB3:', WEB3_ENABLED, 'BACKEND:', BACKEND_ENABLED);

        if (BRIDGE_ENABLED) {
          return _showModeModal();
        }

        // Bridge disabled: single-mode operation
        if (WEB3_ENABLED)    return 'web3';
        if (BACKEND_ENABLED) return 'backend';
      });
  }

  // ── Response normalizers ──────────────────────────────────────────────────

  function normActivate(raw, mode) {
    if (!raw) return { success: false, error: 'Немає відповіді' };
    if (!raw.success) return { success: false, error: raw.error || raw.message || 'Помилка активації' };
    if (mode === 'web3') {
      return {
        success: true,
        brand:       (raw.data && raw.data.brand)   || '',
        nominal:     (raw.data && raw.data.nominal) || 0,
        bonus:       (raw.data && raw.data.bonus)   || 0,
        txHash:      raw.txHash  || null,
        txUrl:       txUrl(raw.txHash)
      };
    }
    return {
      success: true,
      brand:       raw.brand   || '',
      nominal:     raw.nominal || 0,
      bonus:       raw.bonus   || 0,
      balance:     raw.balance,
      txHash:      null,
      txUrl:       raw.tx_url  || null
    };
  }

  function normBalance(raw, mode) {
    if (mode === 'web3') {
      var arr = Array.isArray(raw) ? raw : [];
      return {
        success:  true,
        balances: arr.map(function (b) {
          return {
            brand:        b.brand,
            brandName:    b.brandName || brandName(b.brand),
            balance:      b.balance      || 0,
            bonusBalance: b.bonusBalance || 0,
            expiresAt:    b.expiresAt    || null,
            isActive:     b.isActive,
            total:        (b.balance || 0) + (b.bonusBalance || 0)
          };
        })
      };
    }
    if (!raw || !raw.success) return { success: false, balances: [] };
    var items = Array.isArray(raw.balances) ? raw.balances : [];
    return {
      success:  true,
      balances: items.map(function (b) {
        var bonus = b.bonusBalance || b.bonus_balance || 0;
        var ea    = b.expiresAt || b.expires_at;
        return {
          brand:        b.brand,
          brandName:    brandName(b.brand),
          balance:      b.balance   || 0,
          bonusBalance: bonus,
          expiresAt:    ea ? new Date(typeof ea === 'number' && ea < 1e12 ? ea * 1000 : ea) : null,
          isActive:     b.isActive != null ? b.isActive : (b.balance > 0),
          total:        (b.balance || 0) + bonus
        };
      })
    };
  }

  function normErr(raw) {
    return { success: false, error: (raw && (raw.error || raw.message)) || 'Помилка' };
  }

  function normExchange(raw, mode) {
    if (!raw || !raw.success) return normErr(raw);
    return {
      success: true,
      orderId: raw.orderId,
      txHash:  mode === 'web3' ? (raw.txHash || null) : null,
      txUrl:   mode === 'web3' ? txUrl(raw.txHash) : (raw.tx_url || null)
    };
  }

  function normPay(raw, mode) {
    if (!raw || !raw.success) return normErr(raw);
    return {
      success:   true,
      tokenHash: raw.tokenHash,
      expiresAt: raw.expiresAt instanceof Date ? raw.expiresAt : (raw.expiresAt ? new Date(raw.expiresAt) : null),
      txHash:    mode === 'web3' ? (raw.txHash || null) : null,
      txUrl:     mode === 'web3' ? txUrl(raw.txHash) : (raw.tx_url || null)
    };
  }

  function normGiftCreate(raw, mode) {
    if (!raw || !raw.success) return normErr(raw);
    return {
      success:  true,
      giftHash: raw.giftHash || raw.gift_hash || raw.hash,
      txHash:   mode === 'web3' ? (raw.txHash || null) : null,
      txUrl:    mode === 'web3' ? txUrl(raw.txHash) : (raw.tx_url || null)
    };
  }

  function normGiftClaim(raw, mode) {
    if (!raw || !raw.success) return normErr(raw);
    return {
      success: true,
      brand:   raw.brand  || '',
      amount:  raw.amount || 0,
      txHash:  mode === 'web3' ? (raw.txHash || null) : null,
      txUrl:   mode === 'web3' ? txUrl(raw.txHash) : (raw.tx_url || null)
    };
  }

  function normVerify(raw) {
    if (!raw || raw.error) return { success: false, error: (raw && raw.error) || 'Немає відповіді' };
    var ea = raw.expiresAt;
    return {
      success:     true,
      brand:       raw.brand       || '',
      nominal:     raw.nominal     || 0,
      bonusPercent:raw.bonusPercent|| 0,
      isUsed:      !!raw.isUsed,
      isValid:     !!raw.isValid,
      expiresAt:   ea ? (ea instanceof Date ? ea : new Date(typeof ea === 'number' && ea < 1e12 ? ea * 1000 : ea)) : null
    };
  }

  // ── Provider public API ───────────────────────────────────────────────────

  var Provider = {
    getMode:   function () { return _mode; },
    getBrands: function () { return BRANDS; },

    // Resolves once /api/config has been fetched and module flags updated.
    // Await this before reading isWeb3Enabled() / isBackendEnabled() in UI code.
    configReady: _configReady,

    isWeb3Available:    function () { return WEB3_ENABLED    && typeof window.ethereum !== 'undefined'; },
    isBackendAvailable: function () { return BACKEND_ENABLED; },
    isBridgeAvailable:  function () { return BRIDGE_ENABLED; },

    // Pure module-flag checks (no MetaMask presence check)
    isWeb3Enabled:    function () { return WEB3_ENABLED; },
    isBackendEnabled: function () { return BACKEND_ENABLED; },

    isReady: function () {
      var m = _resolveMode();
      if (m === 'web3') return !!(window.Web3API && window.Web3API.isConnected());
      return !!window.API;
    },

    getUserAddress: function () {
      if (_mode === 'web3' && window.Web3API) return window.Web3API.getUserAddress();
      return null;
    },

    setMode: function (mode) {
      if (mode !== 'web3' && mode !== 'backend') return;
      if (mode === 'web3'    && !WEB3_ENABLED)    return;
      if (mode === 'backend' && !BACKEND_ENABLED) return;
      if (!BRIDGE_ENABLED) localStorage.setItem('certswap_mode', mode);
      _mode = mode;
      window.location.reload();
    },

    // Switch to a specific mode.
    // Returns false (no reload) when the target module is disabled or
    // when switching to web3 without MetaMask — caller shows the error.
    switchMode: function (mode) {
      if (mode === 'web3'    && !WEB3_ENABLED)                        return false;
      if (mode === 'backend' && !BACKEND_ENABLED)                     return false;
      if (mode === 'web3'    && typeof window.ethereum === 'undefined') return false;
      if (!BRIDGE_ENABLED) localStorage.setItem('certswap_mode', mode);
      _mode = mode;
      window.location.reload();
      return true;
    },

    // Reset stored mode choice (for testing / re-onboarding)
    clearMode: function () {
      localStorage.removeItem('certswap_mode');
      _mode = null;
      window.location.reload();
    },

    // ── Signing operations (show modal on first use) ───────────────────────

    activate: function (code, callbacks) {
      callbacks = callbacks || {};
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.activateCode(code, callbacks).then(function (r) { return normActivate(r, 'web3'); });
        }
        return window.API.activate(code).then(function (r) { return normActivate(r, 'backend'); });
      });
    },

    exchange: function (giveBrand, giveAmount, getBrand, getAmount) {
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.createOrder(giveBrand, giveAmount, getBrand, getAmount)
            .then(function (r) { return normExchange(r, 'web3'); });
        }
        return window.API.exchange(giveBrand, giveAmount, getBrand, getAmount)
          .then(function (r) { return normExchange(r, 'backend'); });
      });
    },

    // P2P order creation on the exchange (distinct from direct balance transfer)
    createOrder: function (giveBrand, giveAmount, wantBrand, wantAmount) {
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.createOrder(giveBrand, giveAmount, wantBrand, wantAmount)
            .then(function (r) { return normExchange(r, 'web3'); });
        }
        return window.API.exchangeOrderCreate(giveBrand, giveAmount, wantBrand, wantAmount)
          .then(function (r) { return normExchange(r, 'backend'); });
      });
    },

    pay: function (brand, amount, validitySeconds, callbacks) {
      validitySeconds = validitySeconds || 60;
      callbacks = callbacks || {};
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.createPaymentToken(brand, amount, validitySeconds, callbacks)
            .then(function (r) { return normPay(r, 'web3'); });
        }
        return window.API.pay(brand, amount, validitySeconds)
          .then(function (r) { return normPay(r, 'backend'); });
      });
    },

    createGift: function (brand, amount) {
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.createGift(brand, amount)
            .then(function (r) { return normGiftCreate(r, 'web3'); });
        }
        return window.API.giftCreate(brand, amount)
          .then(function (r) { return normGiftCreate(r, 'backend'); });
      });
    },

    claimGift: function (giftHash) {
      return _ensureMode().then(function (mode) {
        if (mode === 'web3') {
          return window.Web3API.claimGift(giftHash)
            .then(function (r) { return normGiftClaim(r, 'web3'); });
        }
        return window.API.giftClaim(giftHash)
          .then(function (r) { return normGiftClaim(r, 'backend'); });
      });
    },

    // ── Read operations (no modal, fallback to backend if mode not set) ────

    getBalance: function () {
      var mode = _resolveMode();
      if (mode === 'web3') {
        return window.Web3API.getAllBalances().then(function (r) { return normBalance(r, 'web3'); });
      }
      return window.API.balance().then(function (r) { return normBalance(r, 'backend'); });
    },

    getBalanceByBrand: function (brand) {
      var mode = _resolveMode();
      if (mode === 'web3') {
        return window.Web3API.getBalance(brand).then(function (r) {
          if (r.error) return { success: false, error: r.error };
          return { success: true, brand: brand, balance: r.balance || 0, bonusBalance: r.bonusBalance || 0, total: r.total || 0 };
        });
      }
      return window.API.balance().then(function (r) {
        if (!r.success) return { success: false, error: r.message };
        var b = (r.balances || []).find(function (x) { return x.brand === brand; }) || {};
        var bal   = b.balance      || 0;
        var bonus = b.bonusBalance || b.bonus_balance || 0;
        return { success: true, brand: brand, balance: bal, bonusBalance: bonus, total: bal + bonus };
      });
    },

    checkGift: function (giftHash) {
      var mode = _resolveMode();
      if (mode === 'web3') {
        return window.Web3API.checkGift(giftHash)
          .then(function (r) { return Object.assign({ success: !r.error }, r); });
      }
      return window.API.giftCheck(giftHash)
        .then(function (r) { return Object.assign({ success: r.isValid !== undefined }, r); });
    },

    verify: function (code) {
      var mode = _resolveMode();
      if (mode === 'web3') {
        return window.Web3API.checkActivationCode(code).then(normVerify);
      }
      return window.API.verify(code).then(normVerify);
    },

    checkPaymentToken: function (hash) {
      var base = (CFG.BACKEND_URL || '');
      var mode = _resolveMode();
      if (mode === 'web3') return window.Web3API.checkPaymentToken(hash);
      return fetch(base + '/api/payment/check?token_hash=' + encodeURIComponent(hash), { credentials: 'include' })
        .then(function (r) { return r.json(); });
    },

    confirmPayment: function (hash) {
      var base = (CFG.BACKEND_URL || '');
      var mode = _resolveMode();
      if (mode === 'web3') return window.Web3API.confirmPayment(hash);
      return fetch(base + '/api/payment/confirm', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token_hash: hash })
      }).then(function (r) { return r.json(); });
    },

    // ── Utilities ──────────────────────────────────────────────────────────
    formatAmount: fmtAmount,
    formatDate:   fmtDate,
    txUrl:        txUrl,
    brandName:    brandName
  };

  window.Provider = Provider;

  console.log('🔀 CertSwap Provider v2.0 — mode:', _mode || '(not set yet)');
})();
