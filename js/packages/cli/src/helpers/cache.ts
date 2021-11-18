import path from 'path';
import { CACHE_PATH } from './constants';
import fs from 'fs';

export function cachePath(
  env: string,
  cacheName: string,
  cPath: string = CACHE_PATH,
) {
  return path.join(cPath, `${env}-${cacheName}`);
}

export function loadCache(
  neighborhoodRow: number,
  neighborhoodCol: number,
  cacheName: string,
  env: string,
  cPath: string = CACHE_PATH,
) {
  const path = cachePath(env, cacheName, cPath);
  return fs.existsSync(path)
    ? JSON.parse(fs.readFileSync(path).toString())[
        `[${neighborhoodRow},${neighborhoodCol}]`
      ]
    : undefined;
}

export function saveCache(
  neighborhoodRow: number,
  neighborhoodCol: number,
  cacheName: string,
  env: string,
  cacheContent,
  cPath: string = CACHE_PATH,
) {
  const path = cachePath(env, cacheName, cPath);
  const cacheResult = fs.existsSync(path)
    ? JSON.parse(fs.readFileSync(path).toString())[
        `[${neighborhoodRow},${neighborhoodCol}]`
      ]
    : {};
  cacheResult[`[${neighborhoodRow},${neighborhoodCol}]`] = cacheContent;
  cacheResult['env'] = env;
  cacheResult['cacheName'] = cacheName;

  fs.writeFileSync(
    cachePath(env, cacheName, cPath),
    JSON.stringify(cacheResult),
  );
}
