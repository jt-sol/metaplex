import Jimp from 'jimp';
import fs from 'fs';
import path from 'path';

export async function createImage(i, font) {
  Jimp.read('./.assets/templates/template.png')
    .then(img => {
      return img
        .print(
          font,
          0,
          -100,
          {
            text: '#' + String(i).padStart(6, '0'),
            alignmentY: Jimp.VERTICAL_ALIGN_BOTTOM,
            alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
          },

          img.bitmap.width,
          img.bitmap.height,
        )
        .resize(50, Jimp.AUTO)
        .writeAsync('./.assets/' + String(i) + '.png');
    })
    .catch(err => {
      console.error(err);
    });
}

export async function createSmallImage(i, font) {
  const image = new Jimp(350, 350, 0xffffffff);
  return image
    .print(
      font,
      0,
      0,
      {
        text: '#' + String(i).padStart(6, '0'),
        alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      },

      image.bitmap.width,
      image.bitmap.height,
    )
    .writeAsync('./.assets/' + String(i) + '.png');
}

export function createJson(i: number, destination: string) {
  const template = './templates/template.json';
  const metadata = fs.existsSync(template)
    ? JSON.parse(fs.readFileSync(template).toString())
    : undefined;
  metadata.name = 'Land #' + String(i).padStart(6, '0');
  metadata.attributes[0].value = Math.floor(i / 1000);
  metadata.attributes[1].value = i % 1000;
  return fs.writeFileSync(
    path.join(destination, `${i}.json`),
    JSON.stringify(metadata),
  );
}

export async function createLightImage(i, font) {
  const image = new Jimp(30, 30, 0xffffffff);
  return image
    .print(
      font,
      0,
      0,
      {
        text: '#' + String(i).padStart(6, '0'),
        alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
        alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      },

      image.bitmap.width,
      image.bitmap.height,
    )
    .writeAsync('./.assets_light/' + String(i) + '.png');
}

export async function createAllImages() {
  console.log(`Generating all assets`);
  const startMs = Date.now();

  let promises = [];

  const font = await Jimp.loadFont(Jimp.FONT_SANS_8_BLACK);
  const batch_size = 24000;
  let batch_first = 0;

  while (batch_first < 1000000) {
    promises = [];
    console.log(batch_first, batch_first + batch_size);
    for (let item = batch_first; item < batch_first + batch_size; item++) {
      promises.push(createLightImage(item, font));
    }
    await Promise.all(promises);
    batch_first += batch_size;
  }

  const endMs = Date.now();
  const timeTaken = new Date(endMs - startMs).toISOString().substr(11, 8);
  console.log(`time taken: ${timeTaken}`);
}

export async function createAllJsons(destination: string, n: number) {
  console.log(`Generating all jsons`);

  for (let item = 0; item < n; item++) {
    if (item % 10000 == 0) {
      console.log(`${item} done!`);
    }
    createJson(item, destination);
  }
}
