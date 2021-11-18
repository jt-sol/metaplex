import { program } from 'commander';
import { createAllJsons } from './helpers/gen_assets';
import * as path from 'path';
import fs from 'fs';
import * as anchor from '@project-serum/anchor';
import log from 'loglevel';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { parseDate, parsePrice } from './helpers/various';
import { PublicKey, Keypair, clusterApiUrl } from '@solana/web3.js';
import { upload } from './commands/upload';
import { mint } from './commands/mint';
import { send_all_nfts } from './commands/sendAllNfts';
import {
  getCandyMachineAddress,
  loadCandyProgram,
  loadWalletKey,
} from './helpers/accounts';
import { loadCache, saveCache } from './helpers/cache';
import { StorageType } from './helpers/storage-type';
import { register_candymachine } from './commands/register-candymachine';

program
  .command('generate_manifests')
  .argument('<directory>', 'Directory to dump the jsons')
  .option('-n, --number <number>', `How many?`, '10')
  .action(async (destination: string, options, cmd) => {
    const { number } = cmd.opts();
    createAllJsons(destination, number);
  });

programCommand('mint_one_token')
  .option('-r, --creator-signature <string>', "Creator's signature")
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      cacheName,
      creatorSignature,
      neighborhoodRow,
      neighborhoodCol,
    } = cmd.opts();

    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );
    const configAddress = new PublicKey(cacheContent.program.config);
    const tx = await mint(keypair, env, configAddress, creatorSignature);
    log.info('mint_one_token finished', tx);
  });

programCommand('send_all_nfts')
  .option('-r, --destination-address <string>', 'Destination address')
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .option('-d, --dry')

  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      cacheName,
      destinationAddress,
      neighborhoodRow,
      neighborhoodCol,
      dry,
    } = cmd.opts();

    const payerKp = loadWalletKey(keypair);
    const destinationPubkey = new PublicKey(destinationAddress);
    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );
    const mints = Object.keys(cacheContent.items)
      .filter(key => cacheContent.items[key].mint)
      .map(key => cacheContent.items[key].mint);
    log.debug(`${mints.length} being tracked`);

    const tx = await send_all_nfts(payerKp, destinationPubkey, env, mints, dry);
    log.info('mint_one_token finished', tx);
  });

programCommand('mint_tokens')
  .option('-r, --creator-signature <string>', "Creator's signature")
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .option('-t, --number-of-tokens <number>', `Number of tokens`, '1')
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      cacheName,
      creatorSignature,
      neighborhoodRow,
      neighborhoodCol,
      numberOfTokens,
    } = cmd.opts();

    const n = parseInt(numberOfTokens);
    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );
    const configAddress = new PublicKey(cacheContent.program.config);
    for (let i = 0; i < n; i++) {
      const res = await mint(keypair, env, configAddress, creatorSignature);

      cacheContent.items[res[2].toString()].mint = res[1];

      log.info('mint_one_token finished', res[0]);
      log.info('mint_value', res[1]);
      log.info('mint_number', res[2]);
      saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cacheContent);
    }
  });

programCommand('register_candy_machine')
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .action(async (directory, cmd) => {
    const { keypair, env, cacheName, neighborhoodRow, neighborhoodCol } =
      cmd.opts();
    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );
    const walletKeyPair = loadWalletKey(keypair);

    // @ts-ignore
    const solConnection = new anchor.web3.Connection(
      //@ts-ignore
      clusterApiUrl(env),
    );

    const candyMachineAddress = new PublicKey(cacheContent.candyMachineAddress);

    const nrow = Number(neighborhoodRow);
    const ncol = Number(neighborhoodCol);
    if (isNaN(nrow) || isNaN(ncol)) {
      throw new Error(
        `Invalid neighboorhood row (${neighborhoodRow}) or col (${neighborhoodCol})`,
      );
    }

    register_candymachine(
      solConnection,
      walletKeyPair,
      candyMachineAddress,
      nrow,
      ncol,
    );
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
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
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
      neighborhoodRow,
      neighborhoodCol,
    } = cmd.opts();

    let parsedPrice = parsePrice(price);
    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );

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
    saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cacheContent);
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
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .action(async (directory, cmd) => {
    const {
      keypair,
      env,
      date,
      price,
      requireCreatorSignature,
      cacheName,
      neighborhoodRow,
      neighborhoodCol,
    } = cmd.opts();

    const cacheContent = loadCache(
      neighborhoodRow,
      neighborhoodCol,
      cacheName,
      env,
    );

    if (cacheContent) {
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
      saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cacheContent);
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
  });

program.command('generate-snake').action(async () => {
  const text = fs.readFileSync('snake.txt').toString();
  const res = text
    .split('\n')
    .map(s => parseInt(s.split(' ')[0]) + parseInt(s.split(' ')[1]) * 200)
    .map((val, idx) => [idx, val])
    .sort((firstEl, secondEl) => firstEl[1] - secondEl[1])
    .map(val => val[0]);
  fs.writeFileSync('snake.json', JSON.stringify(res));
});

program.command('store-keypair').action(async () => {
  const configAccount = Keypair.generate();
  fs.writeFileSync(
    `./.cache/${configAccount.publicKey}.json`,
    `[${configAccount.secretKey.toString()}]`,
  );
});

programCommand('upload-folder')
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
  .argument(
    '<directory>',
    'Directory containing images named from 0-n',
    val => {
      return fs.readdirSync(`${val}`).map(file => path.join(val, file));
    },
  )
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
  .action(async (files: string[], options, cmd) => {
    const {
      neighborhoodRow,
      neighborhoodCol,
      keypair,
      env,
      cacheName,
      storage,
      ipfsInfuraProjectId,
      ipfsInfuraSecret,
      awsS3Bucket,
      retainAuthority,
      mutable,
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
        ipfsCredentials,
        awsS3Bucket,
        jwk,
        neighborhoodRow,
        neighborhoodCol,
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

programCommand('upload-neighborhood')
  .option('-nx, --neighborhood-row <number>', `Neighborhood x`, undefined)
  .option('-ny, --neighborhood-col <number>', `Neighborhood y`, undefined)
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
  .action(async (val: string, options, cmd) => {
    const {
      neighborhoodRow,
      neighborhoodCol,
      keypair,
      env,
      cacheName,
      storage,
      ipfsInfuraProjectId,
      ipfsInfuraSecret,
      awsS3Bucket,
      retainAuthority,
      mutable,
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

    const files = [];
    for (
      let row = neighborhoodRow * 200;
      row < (neighborhoodRow + 1) * 200;
      row++
    ) {
      for (
        let col = neighborhoodCol * 200;
        col < (neighborhoodCol + 1) * 200;
        col++
      ) {
        files.push(path.join(val, `${row * 1000 + col}.json`));
        files.push(path.join(val, `${row * 1000 + col}.png`));
      }
    }

    console.log(
      `Beginning the upload for ${files.length / 2} (png+json) pairs`,
    );

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
        ipfsCredentials,
        awsS3Bucket,
        jwk,
        neighborhoodRow,
        neighborhoodCol,
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

function setLogLevel(value) {
  if (value === undefined || value === null) {
    return;
  }
  log.info('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv);
