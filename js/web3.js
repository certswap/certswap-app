/**
 * CertSwap Web3 Integration
 * Работа со смарт-контрактом на Polygon Amoy Testnet
 */

// ==================== КОНФИГУРАЦИЯ ====================
const CONFIG = {
  // Адрес контракта (обновляется после деплоя)
  CONTRACT_ADDRESS: "0xc37E52BA192d25bBB885082eE938984CcEd044b0", // ЗАМЕНИТЬ ПОСЛЕ ДЕПЛОЯ
  
  // Сеть Polygon Amoy Testnet
  NETWORK: {
    chainId: 80002,
    name: "Polygon Amoy Testnet",
    rpcUrl: "https://rpc-amoy.polygon.technology",
    explorer: "https://amoy.polygonscan.com"
  },
  
  // Список брендов для демо
  BRANDS: [
    { id: "PIZZA", name: "🍕 Pizza Place", color: "#e74c3c" },
    { id: "COFFEE", name: "☕ Coffee Shop", color: "#8b4513" },
    { id: "BARBER", name: "✂️ Barber Pro", color: "#3498db" },
    { id: "BOOKS", name: "📚 Books Store", color: "#27ae60" },
    { id: "CINEMA", name: "🎬 Cinema", color: "#9b59b6" }
  ],
  
  // ABI контракта (сокращённая версия для демо)
  ABI: [
    // События
    "event CodeActivated(bytes32 indexed codeHash, address indexed user, string brand, uint256 nominal, uint256 bonus)",
    "event BalanceUpdated(address indexed user, string brand, uint256 balance, uint256 bonusBalance, uint256 expiresAt)",
    "event OrderCreated(uint256 indexed orderId, address indexed creator, string giveBrand, uint256 giveAmount, string getBrand, uint256 getAmount, uint256 createdAt)",
    "event OrderFilled(uint256 indexed orderId, address indexed filler, address indexed creator, string giveBrand, uint256 giveAmount, string getBrand, uint256 getAmount)",
    "event PaymentTokenCreated(bytes32 indexed tokenHash, address indexed user, string brand, uint256 amount, uint256 expiresAt)",
    "event PaymentMade(bytes32 indexed tokenHash, address indexed user, string brand, uint256 amount, address indexed merchant, uint256 timestamp)",
    
    // Функции администратора
    "function createActivationCode(string memory brand, uint256 nominal, uint256 bonusPercent, uint256 validityDays) external returns (bytes32)",
    "function createMultipleActivationCodes(string memory brand, uint256 nominal, uint256 bonusPercent, uint256 validityDays, uint256 count) external returns (bytes32[] memory)",
    "function setMerchantAuthorization(address merchant, bool authorized) external",
    "function setBrandAuthorization(string memory brand, bool authorized) external",
    
    // Функции пользователя
    "function activateCode(bytes32 codeHash) external returns (bool)",
    "function checkCode(bytes32 codeHash) external view returns (string memory brand, uint256 nominal, uint256 bonusPercent, bool isUsed, bool isValid, uint256 expiresAt)",
    "function getBalance(address user, string memory brand) external view returns (uint256 balance, uint256 bonusBalance, uint256 expiresAt, bool isActive)",
    "function getAllBalances(address user, string[] memory brands) external view returns (uint256[] memory balances, uint256[] memory bonusBalances, uint256[] memory expiresAts, bool[] memory isActive)",
    
    // Функции биржи
    "function createOrder(string memory giveBrand, uint256 giveAmount, string memory getBrand, uint256 getAmount) external returns (uint256)",
    "function fillOrder(uint256 orderId) external returns (bool)",
    "function cancelOrder(uint256 orderId) external returns (bool)",
    "function getOrder(uint256 orderId) external view returns (address creator, string memory giveBrand, uint256 giveAmount, string memory getBrand, uint256 getAmount, bool isActive, uint256 createdAt)",
    "function getUserOrders(address user) external view returns (uint256[] memory)",
    
    // Функции оплаты
    "function createPaymentToken(string memory brand, uint256 amount, uint256 validitySeconds) external returns (bytes32)",
    "function confirmPayment(bytes32 tokenHash) external returns (bool)",
    "function createGift(string memory brand, uint256 amount) external returns (bytes32)",
    "function claimGift(bytes32 giftHash) external returns (bool)",
    "function checkGift(bytes32 giftHash) external view returns (address sender, string memory brand, uint256 amount, bool isClaimed, bool isValid)",
    "function cancelGift(bytes32 giftHash) external returns (bool)",
    "event GiftCreated(bytes32 indexed giftHash, address indexed sender, string brand, uint256 amount)",
    "event GiftClaimed(bytes32 indexed giftHash, address indexed recipient, string brand, uint256 amount)",
    "function checkPaymentToken(bytes32 tokenHash) external view returns (address user, string memory brand, uint256 amount, bool isValid, uint256 expiresAt)",
    
    // Вспомогательные
    "function getUserBrands(address user, string[] memory allBrands) external view returns (string[] memory activeBrands, uint256[] memory balances)",
    "function convertBonusToBalance(string memory brand, uint256 amount) external",
    "function orderCounter() external view returns (uint256)",
    "function codeCounter() external view returns (uint256)",
    "function paymentCounter() external view returns (uint256)",
    "function authorizedMerchants(address) external view returns (bool)",
    "function authorizedBrands(string memory) external view returns (bool)"
  ]
};

// ==================== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ====================
let provider = null;
let signer = null;
let contract = null;
let userAddress = null;
let isConnected = false;

const TX_RECEIPT_POLL_INTERVAL_MS = 3000;
const TX_RECEIPT_POLL_TIMEOUT_MS = 120000;

const TX_GAS_OVERRIDES = {
  gasLimit: 500000,
  maxPriorityFeePerGas: ethers.utils.parseUnits("25", "gwei"),
  maxFeePerGas: ethers.utils.parseUnits("50", "gwei")
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Receipt через MetaMask (без CORS — только window.ethereum)
 */
async function getReceiptViaMetaMask(txHash) {
  const raw = await window.ethereum.request({
    method: "eth_getTransactionReceipt",
    params: [txHash]
  });

  if (!raw || !raw.blockNumber) {
    return null;
  }

  return provider.formatter.receipt(raw);
}

/**
 * Polling receipt каждые 3 с через eth_getTransactionReceipt
 */
async function waitForTransactionReceipt(txHash) {
  if (!provider) {
    throw new Error("Provider не инициализирован");
  }

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < TX_RECEIPT_POLL_TIMEOUT_MS) {
    attempt++;
    const receipt = await getReceiptViaMetaMask(txHash);
    if (receipt) {
      if (receipt.status === 0) {
        throw new Error("Транзакция отклонена (revert)");
      }
      console.log(`[receipt] ${txHash} block ${receipt.blockNumber} (poll #${attempt})`);
      return receipt;
    }
    await sleep(TX_RECEIPT_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Транзакция не подтверждена за ${TX_RECEIPT_POLL_TIMEOUT_MS / 1000} секунд: ${txHash}`
  );
}

/**
 * Отправка транзакции через MetaMask
 */
async function sendTxViaWallet(functionName, args, callbacks = {}) {
  if (!contract || !userAddress) {
    try { await initWeb3(); } catch (_e) {}
    if (!contract || !userAddress) {
      throw new Error("Не подключено к блокчейну");
    }
  }

  const data = contract.interface.encodeFunctionData(functionName, args);
  const txParams = {
    from: userAddress,
    to: CONFIG.CONTRACT_ADDRESS,
    data,
    gas: ethers.utils.hexValue(TX_GAS_OVERRIDES.gasLimit),
    maxPriorityFeePerGas: ethers.utils.hexValue(TX_GAS_OVERRIDES.maxPriorityFeePerGas),
    maxFeePerGas: ethers.utils.hexValue(TX_GAS_OVERRIDES.maxFeePerGas)
  };

  console.log(`[sendTx] ${functionName} — MetaMask...`);

  const txHash = await window.ethereum.request({
    method: "eth_sendTransaction",
    params: [txParams]
  });

  console.log("[sendTx] hash:", txHash);
  if (callbacks.onSent) callbacks.onSent(txHash);
  return txHash;
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

/**
 * Инициализация подключения к блокчейну
 * @returns {Promise<boolean>} Успешность подключения
 */
async function initWeb3() {
  try {
    // Проверяем наличие MetaMask
    if (typeof window.ethereum === 'undefined') {
      throw new Error("MetaMask не установлен. Пожалуйста, установите расширение MetaMask.");
    }
    
    // Создаём провайдер
    provider = new ethers.providers.Web3Provider(window.ethereum);
    
    // Запрашиваем доступ к аккаунту
    const accounts = await provider.send("eth_requestAccounts", []);
    
    if (!accounts || accounts.length === 0) {
      throw new Error("Нет доступных аккаунтов");
    }
    
    signer = await provider.getSigner();
    userAddress = await signer.getAddress();
    
    // Проверяем сеть
    const network = await provider.getNetwork();
    const networkChainId = Number(network.chainId);
    
    if (networkChainId !== CONFIG.NETWORK.chainId) {
      // Предлагаем переключиться на правильную сеть
      await switchToPolygonAmoy();
    }
    
    // Контракт только через MetaMask (Web3Provider → window.ethereum)
    contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, CONFIG.ABI, signer);
    
    isConnected = true;
    
    console.log("✅ Web3 инициализирован");
    console.log("📍 Адрес:", userAddress);
    console.log("🔗 Контракт:", CONFIG.CONTRACT_ADDRESS);
    console.log("🌐 Сеть:", CONFIG.NETWORK.name);
    
    // Обновляем UI
    updateConnectionStatus(true);
    
    return true;
    
  } catch (error) {
    console.error("❌ Ошибка инициализации Web3:", error);
    updateConnectionStatus(false, error.message);
    return false;
  }
}

/**
 * Сброс локального состояния подключения (не отключает MetaMask глобально —
 * расширение само не предоставляет такого API; просто забываем provider/signer/адрес).
 */
function disconnect() {
  provider = null;
  signer = null;
  contract = null;
  userAddress = null;
  isConnected = false;
  updateConnectionStatus(false);
  console.log("🔌 Web3 отключен (локальное состояние сброшено)");
}

/**
 * Переключение на сеть Polygon Amoy
 */
async function switchToPolygonAmoy() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x13882' }],
    });
  } catch (switchError) {
    // Если сеть не добавлена, добавляем её
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x13882',
          chainName: CONFIG.NETWORK.name,
          nativeCurrency: {
            name: 'POL',
            symbol: 'POL',
            decimals: 18
          },
          rpcUrls: [CONFIG.NETWORK.rpcUrl],
          blockExplorerUrls: [CONFIG.NETWORK.explorer]
        }],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Обновление статуса подключения в UI
 */
function updateConnectionStatus(connected, error = null) {
  const statusElement = document.getElementById('connectionStatus');
  if (!statusElement) return;
  
  if (connected) {
    statusElement.innerHTML = `
      <div class="result-valid">
        <h3>✅ Подключено к блокчейну</h3>
        <p>Адрес: <code>${userAddress ? userAddress.substring(0, 10) + '...' + userAddress.substring(38) : 'N/A'}</code></p>
        <p>Сеть: ${CONFIG.NETWORK.name}</p>
      </div>
    `;
    statusElement.style.display = 'block';
  } else {
    statusElement.innerHTML = `
      <div class="result-invalid">
        <h3>❌ Ошибка подключения</h3>
        <p>${error || 'Не удалось подключиться к блокчейну'}</p>
        <p style="margin-top:10px;">
          <strong>Что делать:</strong><br/>
          1. Установите MetaMask<br/>
          2. Добавьте сеть Polygon Amoy Testnet<br/>
          3. Получите тестовые POL на кране<br/>
          4. Обновите страницу
        </p>
        <div style="margin-top:15px;">
          <a href="https://faucet.polygon.technology/" target="_blank" class="btn btn-small">💰 Получить тестовые POL</a>
          <a href="https://metamask.io/" target="_blank" class="btn btn-small btn-outline" style="margin-left:10px;">🦊 Установить MetaMask</a>
        </div>
      </div>
    `;
    statusElement.style.display = 'block';
  }
}

// ==================== ФУНКЦИИ АКТИВАЦИИ ====================

/**
 * Хеширование кода активации
 * @param {string} code - Читаемый код (например, PIZZA-XXXX-XXX)
 * @returns {string} Хеш кода
 */
function hashActivationCode(code) {
  return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(code));
}

/**
 * Активация кода пользователем
 * @param {string} code - Код с картки
 * @param {Object} callbacks - { onSent(txHash) } вызывается сразу после отправки, до wait()
 * @returns {Promise<Object>} Результат активации
 */
async function activateCode(code, callbacks = {}) {
  try {
    if (!isConnected) {
      throw new Error("Не подключено к блокчейну");
    }

    const codeHash = code.startsWith("0x") && code.length === 66 ? code : hashActivationCode(code);

    const codeInfo = await contract.checkCode(codeHash);

    if (!codeInfo.isValid) {
      throw new Error(codeInfo.isUsed ? "Код уже использован" : "Код недействителен или истёк");
    }

    console.log("[activateCode] sending tx...");
    const txHash = await sendTxViaWallet("activateCode", [codeHash], callbacks);
    console.log("[activateCode] tx hash:", txHash);

    const receipt = await waitForTransactionReceipt(txHash);
    
    // Находим событие активации
    const event = receipt.logs.find(log => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed && parsed.name === "CodeActivated";
      } catch {
        return false;
      }
    });
    
    let activatedData = null;
    if (event) {
      const parsed = contract.interface.parseLog(event);
      activatedData = {
        brand: parsed.args.brand,
        nominal: Number(parsed.args.nominal),
        bonus: Number(parsed.args.bonus)
      };
    }
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      data: activatedData
    };
    
  } catch (error) {
    console.error("❌ Ошибка активации:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

/**
 * Проверка кода перед активацией
 * @param {string} code - Код для проверки
 * @returns {Promise<Object>} Информация о коде
 */
async function checkActivationCode(code) {
  try {
    const codeHash = code.startsWith("0x") && code.length === 66 ? code : hashActivationCode(code);
    const result = await contract.checkCode(codeHash);
    
    return {
      brand: result.brand,
      nominal: Number(result.nominal),
      bonusPercent: Number(result.bonusPercent),
      isUsed: result.isUsed,
      isValid: result.isValid,
      expiresAt: new Date(Number(result.expiresAt) * 1000)
    };
  } catch (error) {
    console.error("❌ Ошибка проверки кода:", error);
    return { error: error.message };
  }
}

// ==================== ФУНКЦИИ БАЛАНСА ====================

/**
 * Получение баланса пользователя по бренду
 * @param {string} brand - ID бренда
 * @param {string} address - Адрес пользователя (по умолчанию текущий)
 * @returns {Promise<Object>} Информация о балансе
 */
async function getBalance(brand, address = null) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const userAddr = address || userAddress;
    const result = await contract.getBalance(userAddr, brand);
    
    return {
      balance: Number(result.balance),
      bonusBalance: Number(result.bonusBalance),
      expiresAt: Number(result.expiresAt) > 0 ? new Date(Number(result.expiresAt) * 1000) : null,
      isActive: result.isActive,
      total: Number(result.balance) + Number(result.bonusBalance)
    };
  } catch (error) {
    console.error("❌ Ошибка получения баланса:", error);
    return { error: error.message };
  }
}

/**
 * Получение всех балансов пользователя
 * @returns {Promise<Array>} Массив балансов по всем брендам
 */
async function getAllBalances() {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const brandIds = CONFIG.BRANDS.map(b => b.id);
    const result = await contract.getAllBalances(userAddress, brandIds);
    
    const balances = [];
    for (let i = 0; i < brandIds.length; i++) {
      if (Number(result.balances[i]) > 0 || Number(result.bonusBalances[i]) > 0) {
        const brand = CONFIG.BRANDS.find(b => b.id === brandIds[i]);
        balances.push({
          brand: brandIds[i],
          brandName: brand ? brand.name : brandIds[i],
          brandIcon: brand ? brand.icon : '📦',
          balance: Number(result.balances[i]),
          bonusBalance: Number(result.bonusBalances[i]),
          expiresAt: Number(result.expiresAts[i]) > 0 ? new Date(Number(result.expiresAts[i]) * 1000) : null,
          isActive: result.isActive[i],
          total: Number(result.balances[i]) + Number(result.bonusBalances[i])
        });
      }
    }
    
    return balances;
  } catch (error) {
    console.error("❌ Ошибка получения всех балансов:", error);
    return [];
  }
}

// ==================== ФУНКЦИИ БИРЖИ ====================

/**
 * Создание ордера на обмен
 * @param {string} giveBrand - Бренд, который отдаём
 * @param {number} giveAmount - Сумма, которую отдаём
 * @param {string} getBrand - Бренд, который получаем
 * @param {number} getAmount - Сумма, которую получаем
 * @returns {Promise<Object>} Результат создания ордера
 */
async function createOrder(giveBrand, giveAmount, getBrand, getAmount) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const txHash = await sendTxViaWallet("createOrder", [giveBrand, giveAmount, getBrand, getAmount]);
    const receipt = await waitForTransactionReceipt(txHash);
    
    // Находим событие создания ордера
    const event = receipt.logs.find(log => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed && parsed.name === "OrderCreated";
      } catch {
        return false;
      }
    });
    
    let orderId = null;
    if (event) {
      const parsed = contract.interface.parseLog(event);
      orderId = Number(parsed.args.orderId);
    }
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      orderId: orderId,
      blockNumber: receipt.blockNumber
    };
    
  } catch (error) {
    console.error("❌ Ошибка создания ордера:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

/**
 * Исполнение ордера
 * @param {number} orderId - ID ордера
 * @returns {Promise<Object>} Результат исполнения
 */
async function fillOrder(orderId) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const txHash = await sendTxViaWallet("fillOrder", [orderId]);
    const receipt = await waitForTransactionReceipt(txHash);
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
    
  } catch (error) {
    console.error("❌ Ошибка исполнения ордера:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

/**
 * Отмена ордера
 * @param {number} orderId - ID ордера
 * @returns {Promise<Object>} Результат отмены
 */
async function cancelOrder(orderId) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const txHash = await sendTxViaWallet("cancelOrder", [orderId]);
    const receipt = await waitForTransactionReceipt(txHash);
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
    
  } catch (error) {
    console.error("❌ Ошибка отмены ордера:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

/**
 * Получение информации об ордере
 * @param {number} orderId - ID ордера
 * @returns {Promise<Object>} Информация об ордере
 */
async function getOrder(orderId) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const result = await contract.getOrder(orderId);
    
    return {
      id: orderId,
      creator: result.creator,
      giveBrand: result.giveBrand,
      giveAmount: Number(result.giveAmount),
      getBrand: result.getBrand,
      getAmount: Number(result.getAmount),
      isActive: result.isActive,
      createdAt: new Date(Number(result.createdAt) * 1000)
    };
    
  } catch (error) {
    console.error("❌ Ошибка получения ордера:", error);
    return { error: error.message };
  }
}

/**
 * Получение всех ордеров пользователя
 * @param {string} address - Адрес пользователя
 * @returns {Promise<Array>} Массив ID ордеров
 */
async function getUserOrders(address = null) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const userAddr = address || userAddress;
    const orderIds = await contract.getUserOrders(userAddr);
    
    return orderIds.map(id => Number(id));
    
  } catch (error) {
    console.error("❌ Ошибка получения ордеров:", error);
    return [];
  }
}

// ==================== ФУНКЦИИ ОПЛАТЫ ====================

/**
 * Создание платёжного токена
 * @param {string} brand - Бренд для оплаты
 * @param {number} amount - Сумма оплаты
 * @param {number} validitySeconds - Срок действия в секундах
 * @param {Object} callbacks - { onSent(txHash) } вызывается сразу после отправки, до wait()
 * @returns {Promise<Object>} Результат создания токена
 */
async function createPaymentToken(brand, amount, validitySeconds = 60, callbacks = {}) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");

    const txHash = await sendTxViaWallet(
      "createPaymentToken",
      [brand, amount, validitySeconds],
      callbacks
    );

    const receipt = await waitForTransactionReceipt(txHash);
    
    // Находим событие создания токена
    const event = receipt.logs.find(log => {
      try {
        const parsed = contract.interface.parseLog(log);
        return parsed && parsed.name === "PaymentTokenCreated";
      } catch {
        return false;
      }
    });
    
    console.log("Receipt logs:", receipt.logs.length);
    console.log("Receipt:", JSON.stringify({hash: receipt.transactionHash, status: receipt.status}));
    let tokenHash = null;
    if (event) {
      const parsed = contract.interface.parseLog(event);
      tokenHash = parsed.args.tokenHash;
    }
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      tokenHash: tokenHash,
      expiresAt: new Date((Date.now() / 1000 + validitySeconds) * 1000)
    };
    
  } catch (error) {
    console.error("❌ Ошибка создания платёжного токена:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

/**
 * Проверка платёжного токена
 * @param {string} tokenHash - Хеш токена
 * @returns {Promise<Object>} Информация о токене
 */
async function checkPaymentToken(tokenHash) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const result = await contract.checkPaymentToken(tokenHash);
    
    return {
      user: result.user,
      brand: result.brand,
      amount: Number(result.amount),
      isValid: result.isValid,
      expiresAt: new Date(Number(result.expiresAt) * 1000)
    };
    
  } catch (error) {
    console.error("❌ Ошибка проверки токена:", error);
    return { error: error.message };
  }
}

/**
 * Подтверждение оплаты мерчантом
 * @param {string} tokenHash - Хеш токена
 * @returns {Promise<Object>} Результат подтверждения
 */
async function confirmPayment(tokenHash) {
  try {
    if (!isConnected) throw new Error("Не подключено к блокчейну");
    
    const txHash = await sendTxViaWallet("confirmPayment", [tokenHash]);
    const receipt = await waitForTransactionReceipt(txHash);
    
    return {
      success: true,
      txHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber
    };
    
  } catch (error) {
    console.error("❌ Ошибка подтверждения оплаты:", error);
    return {
      success: false,
      error: error.reason || error.message
    };
  }
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

/**
 * Форматирование адреса для отображения
 * @param {string} address - Полный адрес
 * @returns {string} Сокращённый адрес
 */
function formatAddress(address) {
  if (!address) return 'N/A';
  return address.substring(0, 10) + '...' + address.substring(38);
}

/**
 * Форматирование даты
 * @param {Date} date - Дата
 * @returns {string} Форматированная дата
 */
function formatDate(date) {
  if (!date) return 'Бессрочно';
  return date.toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Форматирование суммы
 * @param {number} amount - Сумма
 * @returns {string} Форматированная сумма
 */
function formatAmount(amount) {
  return new Intl.NumberFormat('uk-UA').format(amount) + ' грн';
}

/**
 * Копирование в буфер обмена
 * @param {string} text - Текст для копирования
 * @returns {Promise<boolean>} Успешность копирования
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy:', err);
    return false;
  }
}

// ==================== ЭКСПОРТ ФУНКЦИЙ ====================




async function getTransactionHistory(address, limit = 20) {
  try {
    const userAddr = address || userAddress;
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - 10000);
    
    const events = [];
    
    // Get all BalanceUpdated events for this user
    const filter = contract.filters.BalanceUpdated(userAddr);
    const logs = await contract.queryFilter(filter, fromBlock, latestBlock);
    
    for (const log of logs.slice(-limit)) {
      try {
        const parsed = contract.interface.parseLog(log);
        const block = await provider.getBlock(log.blockNumber);
        events.push({
          type: 'BalanceUpdated',
          brand: parsed.args[1],
          balance: Number(parsed.args[2]),
          bonusBalance: Number(parsed.args[3]),
          txHash: log.transactionHash,
          timestamp: new Date(block.timestamp * 1000),
          blockNumber: log.blockNumber
        });
      } catch {}
    }

    // Get CodeActivated events
    const activateFilter = contract.filters.CodeActivated(null, userAddr);
    const activateLogs = await contract.queryFilter(activateFilter, fromBlock, latestBlock);
    
    for (const log of activateLogs.slice(-limit)) {
      try {
        const parsed = contract.interface.parseLog(log);
        const block = await provider.getBlock(log.blockNumber);
        events.push({
          type: 'CodeActivated',
          brand: parsed.args[2],
          nominal: Number(parsed.args[3]),
          bonus: Number(parsed.args[4]),
          txHash: log.transactionHash,
          timestamp: new Date(block.timestamp * 1000),
          blockNumber: log.blockNumber
        });
      } catch {}
    }

    // Sort by block number descending
    events.sort((a, b) => b.blockNumber - a.blockNumber);
    
    return events.slice(0, limit);
  } catch (error) {
    console.error('getTransactionHistory error:', error);
    return [];
  }
}

async function cancelGift(giftHash) {
  try {
    const txHash = await sendTxViaWallet("cancelGift", [giftHash]);
    await waitForTransactionReceipt(txHash);
    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: error.reason || error.message };
  }
}

async function createGift(brand, amount) {
  try {
    const txHash = await sendTxViaWallet("createGift", [brand, amount]);
    const receipt = await waitForTransactionReceipt(txHash);
    let giftHash = null;
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog(log);
        if (parsed && parsed.name === "GiftCreated") {
          giftHash = parsed.args[0];
          break;
        }
      } catch {}
    }
    return { success: true, txHash, giftHash };
  } catch (error) {
    return { success: false, error: error.reason || error.message };
  }
}

async function claimGift(giftHash) {
  try {
    const txHash = await sendTxViaWallet("claimGift", [giftHash]);
    await waitForTransactionReceipt(txHash);
    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: error.reason || error.message };
  }
}

async function checkGift(giftHash) {
  try {
    const result = await contract.checkGift(giftHash);
    return {
      sender: result[0],
      brand: result[1],
      amount: Number(result[2]),
      isClaimed: result[3],
      isValid: result[4]
    };
  } catch (error) {
    return { error: error.message };
  }
}

window.Web3API = {
  // Инициализация
  initWeb3,
  disconnect,
  isConnected: () => isConnected,
  getUserAddress: () => userAddress,
  getContract: () => contract,
  
  // Активация
  activateCode,
  checkActivationCode,
  hashActivationCode,
  
  // Балансы
  getBalance,
  getAllBalances,
  
  // Биржа
  createOrder,
  fillOrder,
  cancelOrder,
  getOrder,
  getUserOrders,
  
  // Оплата
  createPaymentToken,
  checkPaymentToken,
  confirmPayment,
  getTransactionHistory,
  cancelGift,
  createGift,
  claimGift,
  checkGift,
  
  // Утилиты
  formatAddress,
  formatDate,
  formatAmount,
  copyToClipboard,
  waitForTransactionReceipt,
  
  // Конфигурация
  CONFIG,
  getBrands: () => CONFIG.BRANDS
};

// ==================== АВТО-ИНИЦИАЛИЗАЦИЯ ====================

// Попытка подключения при загрузке страницы
document.addEventListener('DOMContentLoaded', async () => {
  // Skip auto-init in backend mode or when Web3 module is disabled
  const _cfg  = window.CertSwapConfig || {};
  const _storedMode = localStorage.getItem('certswap_mode');
  if (_cfg.MODULE_WEB3_ENABLED === false ||
      _cfg.MODULE_BRIDGE_ENABLED === true ||
      (_storedMode === 'backend' && _cfg.MODULE_BACKEND_ENABLED !== false)) {
    console.log('⏭️ Web3: auto-init skipped (mode=' + (_storedMode || 'auto') + ', bridge=' + !!_cfg.MODULE_BRIDGE_ENABLED + ')');
    return;
  }
  await new Promise(resolve => setTimeout(resolve, 500));
  await initWeb3();

  // Регистрируем ПОСЛЕ init — иначе wallet_switchEthereumChain вызывает
  // chainChanged во время initWeb3 → reload → второй запрос аккаунта
  if (typeof window.ethereum !== 'undefined') {
    window.ethereum.on('accountsChanged', () => {
      console.log('🔄 Accounts changed');
      window.location.reload();
    });
    window.ethereum.on('chainChanged', () => {
      console.log('🔄 Chain changed');
      window.location.reload();
    });
  }
});

console.log("🚀 CertSwap Web3 API v4 (MetaMask only)");
