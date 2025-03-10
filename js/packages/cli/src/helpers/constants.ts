import { PublicKey } from '@solana/web3.js';
export const CANDY_MACHINE = 'candy_machine';
export const MAX_NAME_LENGTH = 32;
export const MAX_URI_LENGTH = 200;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_CREATOR_LEN = 32 + 1 + 1;

export const ARWEAVE_PAYMENT_WALLET = new PublicKey(
  '6FKvsq4ydWFci6nGq9ckbjYMtnmaqAoatz5c9XWjiDuS',
);
export const CANDY_MACHINE_PROGRAM_ID = new PublicKey(
  '8gRnWCaCGkRoVSEXAfMQujLdyhp4QiCZXKucCLppdxCx',
);

// export const CANDY_MACHINE_PROGRAM_ID = new PublicKey(
//   'cndyAnrLdpjq1Ssp1z8xxDsB8dxe7u4HL5Nxi2K5WXZ',
// );

export const SYS_PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

export const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
);
export const SPL_ASSOCIATED_TOKEN_ACCOUNT_PROGRAM_ID = new PublicKey(
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
);

export const WRAPPED_SOL_ID = new PublicKey(
  'FYysREondbCHRDgjuq2JnEVswtBdvt6pHAJFHDhQ14WF',
)

export const TOKEN_PROGRAM_ID = new PublicKey(
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
);
export const FAIR_LAUNCH_PROGRAM_ID = new PublicKey(
  'faircnAB9k59Y4TXmLabBULeuTLgV7TkGMGNkjnA15j',
);

// export const COLOR_PROGRAM_ID = new PublicKey(
//   'AWSAWg4KArzNv5jdwAQHVSE43BAguuk3ivEnn8HbnBMN',
// );

export const COLOR_PROGRAM_ID = new PublicKey( 
  'G1265DAuFDnDPkHzV7xFuNzw2S7MD6KH4KF3AAdFEAyK',
)
export const COLOR_BASE_KEY = new PublicKey(
  'infXiubkLyxN6Rngrjg8qiYeBnYmMq8R7avMq59x9EC',
);
export const CONFIG_ARRAY_START =
  32 + // authority
  4 +
  6 + // uuid + u32 len
  4 +
  10 + // u32 len + symbol
  2 + // seller fee basis points
  1 +
  4 +
  5 * 34 + // optional + u32 len + actual vec
  8 + //max supply
  1 + //is mutable
  1 + // retain authority
  4; // max number of lines;
export const CONFIG_LINE_SIZE = 4 + 32 + 4 + 200;

export const CACHE_PATH = './.cache';

export const DEFAULT_TIMEOUT = 15000;

export const EXTENSION_PNG = '.png';
export const EXTENSION_JSON = '.json';
