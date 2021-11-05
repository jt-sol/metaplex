import { program } from 'commander';
import { createAllImages, createAllJsons } from './helpers/gen_assets';
import Jimp from 'jimp';
import { arweaveUpload } from './helpers/upload/arweave';
import * as path from 'path';
import fs from 'fs';
import { RateLimiter } from 'limiter';
import * as anchor from '@project-serum/anchor';
import log from 'loglevel';
import {
  CACHE_PATH,
  CONFIG_ARRAY_START,
  CONFIG_LINE_SIZE,
  EXTENSION_JSON,
  EXTENSION_PNG,
} from './helpers/constants';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import {
  chunks,
  fromUTF8Array,
  parseDate,
  parsePrice,
} from './helpers/various';
import { PublicKey, Keypair } from '@solana/web3.js';
import { upload } from './commands/upload';
import { mint } from './commands/mint';
import {
  createConfig,
  getCandyMachineAddress,
  loadCandyProgram,
  loadWalletKey,
} from './helpers/accounts';
import { loadCache, saveCache } from './helpers/cache';
import { StorageType } from './helpers/storage-type';

programCommand('generate-images').action(async (options, cmd) => {
  const { keypair, env, cacheName } = cmd.opts();

  //   const cacheContent = loadCache(cacheName, env) || {};
  // console.time("upload one");
  // let link = await upload_one(696969, keypair, env);
  // console.timeEnd("upload one");
  // console.log(link)

  createAllJsons();

  // createAllImages();

  //   const walletKeyPair = loadWalletKey(keypair);
  //   const anchorProgram = await loadCandyProgram(walletKeyPair, env);
  // //   const batch_size = 10;
  // //   let i = 0;
  // //   while( i < 1000){
  // //     console.log('Upload for : ', i, ' to ', i + batch_size)
  // //     let promises = [];
  // //     for (let j = i; j < Math.min(i + batch_size,1000); j++) {
  // //         promises.push(upload_one(j, walletKeyPair, anchorProgram, env));
  // //     }
  // //     console.time('waiting');
  // //     let res = await Promise.all(promises);
  // //     console.log(res.length);
  // //     console.timeEnd('waiting');

  // //     i += batch_size;
  // // }

  // const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 0.5 });
  // let promises = [];

  // Jimp.loadFont(Jimp.FONT_SANS_8_BLACK).then(font => {
  //   for (let j = 100000; j < 200000; j++) {
  //     promises.push(createSmallImage(j, font, limiter));
  //   }
  // });

  // let res = await Promise.all(promises);

  //     let promises = [];
  //     for (let j = 0; j < 100; j++) {
  //         promises.push(upload_one(j, walletKeyPair, anchorProgram, env, limiter));
  //     }
  //     //   if (link) {
  //     //     cacheContent.items[i] = {
  //     //       link,
  //     //       name: manifest.name,
  //     //       onChain: false,
  //     //     };
  //     //     cacheContent.authority = walletKeyPair.publicKey.toBase58();
  //     // saveCache(cacheName, env, cacheContent);
  //     //   }
});

programCommand('mint_one_token')
  .option('-r, --creator-signature <string>', "Creator's signature")
  .option('-n, --neighborhood <number>', `Neighborhood 0-24`, undefined)
  .action(async (directory, cmd) => {
    const { keypair, env, cacheName, creatorSignature, neighborhood } = cmd.opts();

    const cacheContent = loadCache(neighborhood, cacheName, env);
    const configAddress = new PublicKey(cacheContent.program.config);
    const tx = await mint(keypair, env, configAddress, creatorSignature);

    log.info('mint_one_token finished', tx);
  });

programCommand('mint_tokens')
  .option('-r, --creator-signature <string>', "Creator's signature")
  .option('-n, --neighborhood <number>', `Neighborhood 0-24`, undefined)
  .option('-t, --number-of-tokens <number>', `Number of tokens`, '10')
  .action(async (directory, cmd) => {
    const { keypair, env, cacheName, creatorSignature, neighborhood, numberOfTokens } = cmd.opts();

    let n = parseInt(numberOfTokens);
    for (let i = 0; i < n; i++){
    const cacheContent = loadCache(neighborhood, cacheName, env);
    const configAddress = new PublicKey(cacheContent.program.config);
    const tx = await mint(keypair, env, configAddress, creatorSignature);
    
    log.info('mint_one_token finished', tx);
    }
  });

programCommand('create_candy_machine')
  .option(
    '-p, --price <string>',
    'Price denominated in SOL or spl-token override',
    '1',
  )
  .option(
    '-t, --spl-token <string>',
    'SPL token used to price NFT mint. To use SOL leave this empty.',
  )
  .option(
    '-a, --spl-token-account <string>',
    'SPL token account that receives mint payments. Only required if spl-token is specified.',
  )
  .option(
    '-s, --sol-treasury-account <string>',
    'SOL account that receives mint payments.',
  )
  .option(
    '-r, --require-creator-signature',
    'Use if minting should require creator signature',
  )
  .option('-n, --neighborhood <number>', `Neighborhood 0-24`, undefined)
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      price,
      cacheName,
      splToken,
      splTokenAccount,
      solTreasuryAccount,
      requireCreatorSignature,
      neighborhood,
    } = cmd.opts();

    let parsedPrice = parsePrice(price);
    const cacheContent = loadCache(neighborhood, cacheName, env);

    const walletKeyPair = loadWalletKey(keypair);
    const anchorProgram = await loadCandyProgram(walletKeyPair, env);

    let wallet = walletKeyPair.publicKey;
    const remainingAccounts = [];
    if (splToken || splTokenAccount) {
      if (solTreasuryAccount) {
        throw new Error(
          'If spl-token-account or spl-token is set then sol-treasury-account cannot be set',
        );
      }
      if (!splToken) {
        throw new Error(
          'If spl-token-account is set, spl-token must also be set',
        );
      }
      const splTokenKey = new PublicKey(splToken);
      const splTokenAccountKey = new PublicKey(splTokenAccount);
      if (!splTokenAccount) {
        throw new Error(
          'If spl-token is set, spl-token-account must also be set',
        );
      }

      const token = new Token(
        anchorProgram.provider.connection,
        splTokenKey,
        TOKEN_PROGRAM_ID,
        walletKeyPair,
      );

      const mintInfo = await token.getMintInfo();
      if (!mintInfo.isInitialized) {
        throw new Error(`The specified spl-token is not initialized`);
      }
      const tokenAccount = await token.getAccountInfo(splTokenAccountKey);
      if (!tokenAccount.isInitialized) {
        throw new Error(`The specified spl-token-account is not initialized`);
      }
      if (!tokenAccount.mint.equals(splTokenKey)) {
        throw new Error(
          `The spl-token-account's mint (${tokenAccount.mint.toString()}) does not match specified spl-token ${splTokenKey.toString()}`,
        );
      }

      wallet = splTokenAccountKey;
      parsedPrice = parsePrice(price, 10 ** mintInfo.decimals);
      remainingAccounts.push({
        pubkey: splTokenKey,
        isWritable: false,
        isSigner: false,
      });
    }

    if (solTreasuryAccount) {
      wallet = new PublicKey(solTreasuryAccount);
    }

    const config = new PublicKey(cacheContent.program.config);
    const [candyMachine, bump] = await getCandyMachineAddress(
      config,
      cacheContent.program.uuid,
    );
    await anchorProgram.rpc.initializeCandyMachine(
      bump,
      {
        uuid: cacheContent.program.uuid,
        price: new anchor.BN(parsedPrice),
        itemsAvailable: new anchor.BN(Object.keys(cacheContent.items).length),
        goLiveDate: null,
        requireCreatorSignature: requireCreatorSignature,
      },
      {
        accounts: {
          candyMachine,
          wallet,
          config: config,
          authority: walletKeyPair.publicKey,
          payer: walletKeyPair.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        },
        signers: [],
        remainingAccounts,
      },
    );
    cacheContent.candyMachineAddress = candyMachine.toBase58();
    saveCache(neighborhood, cacheName, env, cacheContent);
    log.info(
      `create_candy_machine finished. candy machine pubkey: ${candyMachine.toBase58()}`,
    );
  });

programCommand('update_candy_machine')
  .option(
    '-d, --date <string>',
    'timestamp - eg "04 Dec 1995 00:12:00 GMT" or "now"',
  )
  .option('-p, --price <string>', 'SOL price')
  .option(
    '-r, --require-creator-signature',
    'Use if minting should require creator signature',
  )
  .option('-n, --neighborhood <number>', `Neighborhood 0-24`, undefined)
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      date,
      price,
      requireCreatorSignature,
      cacheName,
      neighborhood,
    } = cmd.opts();

    const iterate_over =
      neighborhood != undefined
        ? [neighborhood]
        : [...Array(25).keys()].map(i => i.toString());

    for (let n of iterate_over) {
      const cacheContent = loadCache(n, cacheName, env);
     
      if (cacheContent) {
        log.info(n)
        const secondsSinceEpoch = date ? parseDate(date) : null;
        const lamports = price ? parsePrice(price) : null;

        const walletKeyPair = loadWalletKey(keypair);
        const anchorProgram = await loadCandyProgram(walletKeyPair, env);

        const candyMachine = new PublicKey(cacheContent.candyMachineAddress);
        const tx = await anchorProgram.rpc.updateCandyMachine(
          lamports ? new anchor.BN(lamports) : null,
          secondsSinceEpoch ? new anchor.BN(secondsSinceEpoch) : null,
          requireCreatorSignature,
          {
            accounts: {
              candyMachine,
              authority: walletKeyPair.publicKey,
            },
          },
        );

        cacheContent.startDate = secondsSinceEpoch;
        saveCache(n, cacheName, env, cacheContent);
        if (date)
          log.info(
            ` - updated startDate timestamp: ${secondsSinceEpoch} (${date})`,
          );
        if (lamports)
          log.info(` - updated price: ${lamports} lamports (${price} SOL)`);
        if (requireCreatorSignature)
          log.info(' - updated require creator signature'); // TODO more detailed log
        log.info('update_candy_machine finished', tx);
      }
    }
  });

program.command('generate-snake').action(async (options, cmd) => {
  const text = fs.readFileSync('snake.txt').toString();
  const res = text
    .split('\n')
    .map(s => parseInt(s.split(' ')[0]) + parseInt(s.split(' ')[1]) * 200)
    .map((val, idx) => [idx, val])
    .sort((firstEl, secondEl) => firstEl[1] - secondEl[1])
    .map(val => val[0]);
  fs.writeFileSync('snake.json', JSON.stringify(res));
});

program.command('store-keypair').action(async (options, cmd) => {
  const configAccount = Keypair.generate();
  fs.writeFileSync(
    `./.cache/${configAccount.publicKey}.json`,
    `[${configAccount.secretKey.toString()}]`,
  );
});

programCommand('upload-neighborhood')
  .option('-n, --neighborhood <number>', `Neighborhood 0-24`, undefined)
  .argument('<directory>', 'Directory containing images named from 0-n')
  .option(
    '-s, --storage <string>',
    `Database to use for storage (${Object.values(StorageType).join(', ')})`,
    'arweave',
  )
  .option(
    '--ipfs-infura-project-id <string>',
    'Infura IPFS project id (required if using IPFS)',
  )
  .option(
    '--ipfs-infura-secret <string>',
    'Infura IPFS scret key (required if using IPFS)',
  )
  .option(
    '--aws-s3-bucket <string>',
    '(existing) AWS S3 Bucket name (required if using aws)',
  )
  .option(
    '-jwk, --jwk <string>',
    'Path to Arweave wallet file (required if using Arweave Native)',
  )
  .option('--no-retain-authority', 'Do not retain authority to update metadata')
  .option('--no-mutable', 'Metadata will not be editable')
  .option(
    '-r, --rpc-url <string>',
    'custom rpc url since this is a heavy command',
  )
  .action(async (val: string, options, cmd) => {
    const {
      neighborhood,
      keypair,
      env,
      cacheName,
      storage,
      ipfsInfuraProjectId,
      ipfsInfuraSecret,
      awsS3Bucket,
      retainAuthority,
      mutable,
      rpcUrl,
      jwk,
    } = cmd.opts();

    if (storage === StorageType.ArweaveNative && !jwk) {
      throw new Error(
        'Path to Arweave JWK wallet file must be provided when using arweave-native',
      );
    }

    if (
      storage === StorageType.Ipfs &&
      (!ipfsInfuraProjectId || !ipfsInfuraSecret)
    ) {
      throw new Error(
        'IPFS selected as storage option but Infura project id or secret key were not provided.',
      );
    }
    if (storage === StorageType.Aws && !awsS3Bucket) {
      throw new Error(
        'aws selected as storage option but existing bucket name (--aws-s3-bucket) not provided.',
      );
    }

    if (!Object.values(StorageType).includes(storage)) {
      throw new Error(
        `Storage option must either be ${Object.values(StorageType).join(
          ', ',
        )}. Got: ${storage}`,
      );
    }
    const ipfsCredentials = {
      projectId: ipfsInfuraProjectId,
      secretKey: ipfsInfuraSecret,
    };

    const neighborhood_row = Math.floor(parseInt(neighborhood) / 5);
    const neighborhood_col = parseInt(neighborhood) % 5;
    const files = [];
    for (
      let row = neighborhood_row * 200;
      row < (neighborhood_row + 1) * 200;
      row++
    ) {
      for (
        let col = neighborhood_col * 200;
        col < (neighborhood_col + 1) * 200;
        col++
      ) {
        files.push(path.join(val, `${row * 1000 + col}.json`));
        files.push(path.join(val, `${row * 1000 + col}.png`));
      }
    }
    console.log(neighborhood_row);
    console.log(`Beginning the upload for ${files.length} (png+json) pairs`);

    const startMs = Date.now();
    log.info('started at: ' + startMs.toString());
    try {
      await upload({
        files,
        cacheName,
        env,
        keypair,
        storage,
        retainAuthority,
        mutable,
        rpcUrl,
        ipfsCredentials,
        awsS3Bucket,
        jwk,
        neighborhood,
      });
    } catch (err) {
      log.warn('upload was not successful, please re-run.', err);
    }

    const endMs = Date.now();
    const timeTaken = new Date(endMs - startMs).toISOString().substr(11, 8);
    log.info(
      `ended at: ${new Date(endMs).toISOString()}. time taken: ${timeTaken}`,
    );
  });

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-k, --keypair <path>',
      `Solana wallet location`,
      '--keypair not provided',
    )
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet', //mainnet-beta, testnet, devnet
    )
    .option('-c, --cache-name <string>', 'Cache file name', 'test')
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

function setLogLevel(value, prev) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv);
