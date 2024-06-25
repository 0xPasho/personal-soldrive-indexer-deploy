// src/getTokenAssociated.js
const { PublicKey } = require('@solana/web3.js');

async function getSplToken() {
  return await import('@solana/spl-token');
}

async function getTokenAssociated(walletAddress, mintAddress) {
  const splToken = await getSplToken();
  const { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = splToken;

  const associatedTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(mintAddress),
    new PublicKey(walletAddress),
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID
  );

  return associatedTokenAccount.toBase58(); // Return a string representation of the public key
}

module.exports = { getTokenAssociated };
