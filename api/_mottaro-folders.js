/**
 * Read-only loader for the Motarro folders staff create in Admin → Product
 * Manager (site-config `taxonomy/mottaro-folders.json`). The tree logic lives
 * in the shared lib/mottaro-folders.mjs, byte-identical with Proto_Admin.
 *
 * A failed read shows no staff folders for that request rather than failing
 * the catalogue: products placed in a folder still appear in their own
 * category, so nothing a customer could order disappears.
 */
import { readSiteConfigJson } from './_site-config.js';
import { MOTTARO_FOLDERS_FILE, graftMottaroFolders, sanitizeMottaroFolders } from '../lib/mottaro-folders.mjs';

export { graftMottaroFolders };

export async function loadMottaroFolders() {
  try {
    return sanitizeMottaroFolders(await readSiteConfigJson(MOTTARO_FOLDERS_FILE, null));
  } catch {
    return [];
  }
}
