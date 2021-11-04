import { readFile, stat } from 'fs/promises';
import path from 'path';
import Arweave from 'arweave';
import { bundleAndSignData, createData, ArweaveSigner } from 'arbundles';
import log from 'loglevel';
import { loadFont } from 'jimp/*';

// The limit for the cumulated size of filepairs to include in a single bundle.
// arBundles has a limit of 250MB, we use our own limit way below that to
// lower the risk for having to re-upload filepairs if the matching manifests
// upload fail on voluminous collections.
// Change at your own risk.
const BATCH_SIZE_LIMIT = 10 * 1000 * 1000;

const BASE_TAGS = [
  { name: 'App-Name', value: 'Metaplex Candy Machine' },
  { name: 'App-Version', value: '1.0.0' },
];

const contentTypeTags = {
  png: { name: 'Content-Type', value: 'image/png' },
  json: { name: 'Content-Type', value: 'application/json' },
};

function getArweave() {
  return new Arweave({
    host: 'arweave.net',
    port: 443,
    protocol: 'https',
    timeout: 20000,
    logging: true,
    logger: console.log,
  });
}

function sizeMB(bytes: number) {
  return bytes / (1000 * 1000);
}

type FilePair = {
  key: string;
  image: string;
  manifest: string;
};

type BundleRange = {
  range: number;
  size: number;
};

async function getBundleRange(filePairs: FilePair[]): Promise<BundleRange> {
  let total = 0;
  let range = 0;
  for (const { key, image, manifest } of filePairs) {
    const filePairSize = await [image, manifest].reduce(async (accP, file) => {
      const acc = await accP;
      const { size } = await stat(file);
      return acc + size;
    }, Promise.resolve(0));

    total += filePairSize;

    if (total + filePairSize >= BATCH_SIZE_LIMIT) {
      if (range === 0) {
        throw new Error(
          `Image + Manifest filepair (${key}) too big (${sizeMB(
            filePairSize,
          )}) for arBundles size limit of ${sizeMB(BATCH_SIZE_LIMIT)}.`,
        );
      }
      break;
    }
    range += 1;
  }
  return { range, size: total };
}

const imageTags = [...BASE_TAGS, contentTypeTags['png']];
async function getImageDataItem(signer, image) {
  return createData(await readFile(image), signer, {
    tags: imageTags,
  });
}

const manifestTags = [...BASE_TAGS, contentTypeTags['json']];
function getManifestDataItem(signer, manifest) {
  return createData(JSON.stringify(manifest), signer, { tags: manifestTags });
}

async function getUpdatedManifest(manifestPath, imageLink) {
  const manifest = JSON.parse((await readFile(manifestPath)).toString());
  manifest.image = imageLink;
  manifest.properties.files = [{ type: 'image/png', uri: imageLink }];

  return manifest;
}

type UploadGeneratorResult = {
  manifestLinks: string[];
  updatedManifests: any;
};

export function* makeArweaveBundleUploadGenerator(
  dirname: string,
  items: string[],
  jwk: any,
): Generator<Promise<UploadGeneratorResult>> {
  const signer = new ArweaveSigner(jwk);
  const arweave = getArweave();

  const filePairs = items.map(item => ({
    key: item,
    image: path.join(dirname, `${item}.png`),
    manifest: path.join(dirname, `${item}.json`),
  }));

  yield Promise.resolve({
    manifestLinks: [],
    updatedManifests: [],
  });

  while (filePairs.length) {
    const result = getBundleRange(filePairs).then(async function processBundle({
      range,
      size,
    }) {
      log.info(
        `Computed Bundle range, including ${range} file pair(s) totaling ${size} bytes.`,
      );
      const bundleFilePairs = filePairs.splice(0, range);
      log.debug(bundleFilePairs.length);
      log.debug(bundleFilePairs[0]);
      log.debug(bundleFilePairs[bundleFilePairs.length - 1]);
      const { dataItems, manifestLinks, updatedManifests } =
        await bundleFilePairs.reduce(
          async function processBundleFilePair(accP, filePair) {
            const acc = await accP;
            log.debug('Processing File Pair', filePair.key);

            const imageDataItem = await getImageDataItem(
              signer,
              filePair.image,
            );
            await imageDataItem.sign(signer);
            const imageLink = `https://arweave.net/${imageDataItem.id}`;

            const manifest = await getUpdatedManifest(
              filePair.manifest,
              imageLink,
            );
            const manifestDataItem = getManifestDataItem(signer, manifest);
            await manifestDataItem.sign(signer);
            const manifestLink = `https://arweave.net/${manifestDataItem.id}`;

            acc.updatedManifests.push(manifest);
            acc.manifestLinks.push(manifestLink);
            acc.dataItems.push(imageDataItem, manifestDataItem);

            log.info('Processed File Pair', filePair.key);
            return acc;
          },
          Promise.resolve({
            dataItems: [],
            manifestLinks: [],
            updatedManifests: [],
          }),
        );

      log.debug('Bundling...');
      log.debug(dataItems[0]);
      log.debug(dataItems.length);
      const bundle = await bundleAndSignData(dataItems, signer);
      // @ts-ignore
      // Argument of type
      // 'import("node_modules/arweave/node/common").default'
      // is not assignable to parameter of type
      // 'import("node_modules/arbundles/node_modules/arweave/node/common").default'.
      // Types of property 'api' are incompatible.
      log.debug('Bundle done');
      const tx = await bundle.toTransaction(arweave, jwk);
      await arweave.transactions.sign(tx, jwk);
      log.info('Uploading bundle...');
      await arweave.transactions.post(tx);
      log.info('Bundle uploaded!');

      return { manifestLinks, updatedManifests };
    });
    yield result;
  }
}
