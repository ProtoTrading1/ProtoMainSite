import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_PDF_THUMBNAIL_BYTES,
  buildPdfBuffer,
  compressImageForPdf,
} from '../../api/send-order.js';

async function largeCatalogueImage() {
  const width = 1600;
  const height = 1600;
  const pixels = Buffer.allocUnsafe(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = index % 251;
    pixels[index + 1] = (index * 7) % 253;
    pixels[index + 2] = (index * 13) % 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png({ compressionLevel: 0 })
    .toBuffer();
}

async function distinctPdfThumbnail(seed) {
  const width = 116;
  const height = 116;
  const pixels = Buffer.allocUnsafe(width * height * 3);
  for (let index = 0; index < pixels.length; index += 3) {
    pixels[index] = (index * 17 + seed * 29) % 256;
    pixels[index + 1] = (index * 31 + seed * 43) % 256;
    pixels[index + 2] = (index * 47 + seed * 59) % 256;
  }
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 70 })
    .toBuffer();
}

test('turns a multi-megabyte catalogue image into a low-kilobyte PDF thumbnail', async () => {
  const source = await largeCatalogueImage();
  assert.ok(source.length > 1024 * 1024, 'fixture represents an oversized source image');

  const thumbnail = await compressImageForPdf(source);
  assert.ok(thumbnail, 'valid source image is retained');
  assert.ok(thumbnail.length <= MAX_PDF_THUMBNAIL_BYTES, 'thumbnail stays within its byte budget');

  const metadata = await sharp(thumbnail).metadata();
  assert.equal(metadata.format, 'jpeg');
  assert.ok(metadata.width <= 116);
  assert.ok(metadata.height <= 116);
});

test('an invalid image is omitted instead of aborting order PDF generation', async () => {
  assert.equal(await compressImageForPdf(Buffer.from('not an image')), null);
});

test('a maximum-line order with compressed thumbnails remains attachable', async () => {
  const items = await Promise.all(Array.from({ length: 250 }, async (_, index) => {
    const imageBuffer = await distinctPdfThumbnail(index);
    assert.ok(imageBuffer.length <= MAX_PDF_THUMBNAIL_BYTES);
    return {
      qty: 1,
      product: {
        id: `SKU-${index + 1}`,
        sku: `SKU-${index + 1}`,
        code: `BAR-${index + 1}`,
        name: `Product ${index + 1}`,
        price: 10,
        unitsOfIssue: 'each',
        imageBuffer,
      },
    };
  }));

  const pdf = await buildPdfBuffer({
    items,
    customer: { name: 'Large Order Test', email: 'orders@example.com' },
    totals: { subtotal: 2500, total: 2500 },
    deliveryMethod: 'Delivery',
    orderNumber: 'PT_LARGE_TEST',
    orderDate: '2026-08-20T10:00:00.000Z',
  });

  assert.ok(pdf.length < MAX_ATTACHMENT_BYTES, `PDF is attachable (${pdf.length} bytes)`);
});
