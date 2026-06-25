# CertSwap — Frontend

Open-source frontend for CertSwap — a blockchain certificate and loyalty platform on Polygon.

## Live Demo
https://certswap.vercel.app

## Modules
- **M1 (Web3)** — MetaMask, P2P exchange, non-custodial
- **M2 (Backend)** — Email login, blockchain invisible to user
- **Bridge** — Both modes, user chooses per transaction

## Stack
Vanilla HTML/CSS/JS · ethers.js · Polygon Amoy Testnet

## Smart Contract
0xc37E52BA192d25bBB885082eE938984CcEd044b0

## Features
- Certificate code activation (QR scan or manual entry), balance by brand with bonuses and expiry, transaction history
- Token payment via QR at checkout, P2P token exchange between brands
- Gift certificates — create, share link, claim, cancel
- Email login or MetaMask login, with cross-device account recovery by email
- Merchant terminal for verifying and confirming payment tokens

## IP Protection
This project's concept and architecture are timestamped on the blockchain via OriginStamp.
- [IP Declaration (PDF)](docs/CertSwap_IP_Declaration.pdf)
- [OriginStamp Certificate (PDF)](docs/CertSwap_OriginStamp_Certificate.pdf)
- SHA-256 Hash: `0x09f874d4237c6f0f5a6e74317fb249d793fe560752f52930d063dbb6500b6b45`
- Verify independently: https://verify.originstamp.com/

## License
MIT
