import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

import { PublicKey } from '@solana/web3.js';
import { BN } from '@project-serum/anchor';

import log from 'loglevel';

import {
  createConfig,
  loadCandyProgram,
  loadWalletKey,
} from '../helpers/accounts';
import { loadCache, saveCache } from '../helpers/cache';
import { arweaveUpload } from '../helpers/upload/arweave';
import { makeArweaveBundleUploadGenerator } from '../helpers/upload/arweave-bundle';
import { awsUpload } from '../helpers/upload/aws';
import { ipfsCreds, ipfsUpload } from '../helpers/upload/ipfs';
import { StorageType } from '../helpers/storage-type';
import { chunks } from '../helpers/various';

function getItemsNeedingUpload(items, files) {
  const all = new Set([
    ...files.map(filePath => path.basename(filePath, path.extname(filePath))),
  ]);
  Object.keys(items).forEach(element => {
    all.delete(items[element].name.split('#')[1].replace(/^[0]+/g, ''));
  });

  return [...all]
    .map(item => Number.parseInt(item))
    .sort((a, b) => a - b)
    .map(item => `${item}`);
}

function getItemManifest(dirname, item) {
  const manifestPath = path.join(dirname, `${item}.json`);
  return JSON.parse(fs.readFileSync(manifestPath).toString());
}

async function initConfig(
  anchorProgram,
  walletKeyPair,
  {
    totalNFTs,
    mutable,
    symbol,
    retainAuthority,
    sellerFeeBasisPoints,
    creators,
    env,
    cache,
    cacheName,
    neighborhoodRow,
    neighborhoodCol,
  },
) {
  log.info('Initializing config');
  try {
    const res = await createConfig(anchorProgram, walletKeyPair, {
      maxNumberOfLines: new BN(totalNFTs),
      symbol,
      sellerFeeBasisPoints,
      isMutable: mutable,
      maxSupply: new BN(0),
      retainAuthority: retainAuthority,
      creators: creators.map(creator => ({
        address: new PublicKey(creator.address),
        verified: true,
        share: creator.share,
      })),
    });
    cache.program.uuid = res.uuid;
    cache.program.config = res.config.toBase58();
    const config = res.config;

    log.info(
      `Initialized config for a candy machine with publickey: ${config.toBase58()}`,
    );

    saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cache);
    return config;
  } catch (err) {
    log.error('Error deploying config to Solana network.', err);
    throw err;
  }
}

async function writeIndices({
  anchorProgram,
  cache,
  cacheName,
  env,
  config,
  walletKeyPair,
  neighborhoodRow,
  neighborhoodCol,
}) {
  const keys = Object.keys(cache.items);
  try {
    await Promise.all(
      chunks(Array.from(Array(keys.length).keys()), 1000).map(
        async allIndexesInSlice => {
          for (
            let offset = 0;
            offset < allIndexesInSlice.length;
            offset += 10
          ) {
            const indexes = allIndexesInSlice.slice(offset, offset + 10);
            const onChain = indexes.filter(i => {
              const index = keys[i];
              return cache.items[index]?.onChain || false;
            });
            const ind = keys[indexes[0]];

            if (onChain.length != indexes.length) {
              log.info(
                `Writing indices ${ind}-${keys[indexes[indexes.length - 1]]}`,
              );
              try {
                await anchorProgram.rpc.addConfigLines(
                  ind,
                  indexes.map(i => ({
                    uri: cache.items[keys[i]].link,
                    name: cache.items[keys[i]].name,
                  })),
                  {
                    accounts: {
                      config,
                      authority: walletKeyPair.publicKey,
                    },
                    signers: [walletKeyPair],
                  },
                );
                indexes.forEach(i => {
                  cache.items[keys[i]] = {
                    ...cache.items[keys[i]],
                    onChain: true,
                  };
                });
                saveCache(
                  neighborhoodRow,
                  neighborhoodCol,
                  cacheName,
                  env,
                  cache,
                );
              } catch (err) {
                log.error(
                  `Saving config line ${ind}-${
                    keys[indexes[indexes.length - 1]]
                  } failed`,
                  err,
                );
              }
            }
          }
        },
      ),
    );
  } catch (e) {
    log.error(e);
  } finally {
    saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cache);
  }
}

function updateCacheAfterUpload(cache, manifests, links) {
  const snake_map = JSON.parse(fs.readFileSync('snake.json').toString());
  manifests.forEach((manifest, idx) => {
    const globalIndex = parseInt(manifest.name.split('#')[1]);
    const globalRow = Math.floor(globalIndex / 1000);
    const globalCol = globalIndex % 1000;

    const localRow = globalRow % 200;
    const localCol = globalCol % 200;
    cache.items[snake_map[200 * localRow + localCol]] = {
      link: links[idx],
      name: manifest.name,
      onChain: false,
    };
  });
}

type UploadParams = {
  files: string[];
  cacheName: string;
  env: string;
  keypair: string;
  storage: string;
  retainAuthority: boolean;
  mutable: boolean;
  ipfsCredentials: ipfsCreds;
  awsS3Bucket: string;
  jwk: string;
  neighborhoodRow: number;
  neighborhoodCol: number;
};
export async function upload({
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
}: UploadParams): Promise<void> {
  const cache =
    loadCache(neighborhoodRow, neighborhoodCol, cacheName, env) || {};
  const cachedProgram = (cache.program = cache.program || {});
  const cachedItems = (cache.items = cache.items || {});

  const dirname = path.dirname(files[0]);
  const needUpload = getItemsNeedingUpload(cachedItems, files);

  let walletKeyPair;
  let anchorProgram;

  log.info('Need upload', needUpload.length);
  if (needUpload.length) {
    if (storage === StorageType.ArweaveNative) {
      const arweaveBundleUploadGenerator = makeArweaveBundleUploadGenerator(
        dirname,
        needUpload,
        JSON.parse((await readFile(jwk)).toString()),
      );

      let result = arweaveBundleUploadGenerator.next();
      while (!result.done) {
        const { updatedManifests, manifestLinks } = await result.value;

        updateCacheAfterUpload(cache, updatedManifests, manifestLinks);
        saveCache(neighborhoodRow, neighborhoodCol, cacheName, env, cache);
        log.info('Saved bundle upload result to cache.');
        result = arweaveBundleUploadGenerator.next();
      }
      log.info('Upload done.');
    } else {
      for (const toUpload of needUpload) {
        const manifest = getItemManifest(dirname, toUpload);
        const manifestBuffer = Buffer.from(JSON.stringify(manifest));

        log.debug(`Processing file: ${toUpload}`);

        switch (storage) {
          case StorageType.Ipfs:
            await ipfsUpload(ipfsCredentials, toUpload, manifestBuffer);
            break;
          case StorageType.Aws:
            await awsUpload(awsS3Bucket, toUpload, manifestBuffer);
            break;
          case StorageType.Arweave:
          default:
            walletKeyPair = loadWalletKey(keypair);
            anchorProgram = await loadCandyProgram(walletKeyPair, env);
            await arweaveUpload(
              walletKeyPair,
              anchorProgram,
              env,
              toUpload,
              manifestBuffer,
              manifest,
            );
        }
      }
    }
  }

  const {
    properties: { creators },
    seller_fee_basis_points: sellerFeeBasisPoints,
    symbol,
  } = getItemManifest(dirname, 0);

  walletKeyPair = loadWalletKey(keypair);
  anchorProgram = await loadCandyProgram(walletKeyPair, env);

  const totalNFTs = Object.keys(cache.items).length;
  console.log(totalNFTs);
  const config = cachedProgram.config
    ? new PublicKey(cachedProgram.config)
    : await initConfig(anchorProgram, walletKeyPair, {
        totalNFTs,
        mutable,
        retainAuthority,
        sellerFeeBasisPoints,
        symbol,
        creators,
        env,
        cache,
        cacheName,
        neighborhoodRow,
        neighborhoodCol,
      });

  return writeIndices({
    anchorProgram,
    cache,
    cacheName,
    env,
    config,
    walletKeyPair,
    neighborhoodRow,
    neighborhoodCol,
  });
}
