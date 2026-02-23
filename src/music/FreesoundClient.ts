import { requestUrl, Vault, Notice } from 'obsidian';

/* ─── Types ───────────────────────────────────────────────── */

export interface FreesoundPreview {
  'preview-hq-mp3': string;
  'preview-lq-mp3': string;
  'preview-hq-ogg': string;
  'preview-lq-ogg': string;
}

export interface FreesoundResult {
  id: number;
  name: string;
  tags: string[];
  duration: number;
  previews: FreesoundPreview;
  username: string;
  license: string;
  avg_rating: number;
  num_downloads: number;
}

export interface FreesoundSearchResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: FreesoundResult[];
}

export interface FreesoundSearchOptions {
  query: string;
  /** e.g. "duration:[0 TO 10]"  */
  filter?: string;
  /** e.g. "rating_desc", "duration_asc", "downloads_desc" */
  sort?: string;
  pageSize?: number;
  page?: number;
}

/* ─── Client ──────────────────────────────────────────────── */

const BASE = 'https://freesound.org/apiv2';
const FIELDS = 'id,name,tags,duration,previews,username,license,avg_rating,num_downloads';

export class FreesoundClient {
  constructor(private apiKey: string) {}

  /** Search sounds on Freesound. */
  async search(opts: FreesoundSearchOptions): Promise<FreesoundSearchResponse> {
    const params = new URLSearchParams();
    params.set('query', opts.query);
    params.set('fields', FIELDS);
    params.set('page_size', String(opts.pageSize ?? 15));
    if (opts.page) params.set('page', String(opts.page));
    if (opts.filter) params.set('filter', opts.filter);
    if (opts.sort) params.set('sort', opts.sort);
    params.set('token', this.apiKey);

    const resp = await requestUrl({
      url: `${BASE}/search/text/?${params.toString()}`,
      method: 'GET',
    });

    return resp.json as FreesoundSearchResponse;
  }

  /**
   * Download the high-quality MP3 preview of a sound into the vault.
   * Returns the vault-relative path of the new file.
   */
  async downloadPreviewToVault(
    vault: Vault,
    sound: FreesoundResult,
    audioFolderPath: string,
  ): Promise<string> {
    const url = sound.previews['preview-hq-mp3'];
    if (!url) throw new Error('No HQ MP3 preview available');

    const resp = await requestUrl({ url, method: 'GET' });
    const buf = resp.arrayBuffer;

    // Sanitise file name
    const safeName = sound.name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    const dir = audioFolderPath
      ? `${audioFolderPath}/Freesound`
      : 'Freesound';
    const filePath = `${dir}/${safeName}.mp3`;

    // Ensure folder exists (recursive)
    await this.ensureFolder(vault, dir);

    // Check if file already exists
    if (vault.getAbstractFileByPath(filePath)) {
      return filePath; // already downloaded
    }

    await vault.createBinary(filePath, buf);
    return filePath;
  }

  /**
   * Append attribution for a downloaded sound to freesound-credits.md
   */
  async appendCredit(vault: Vault, sound: FreesoundResult): Promise<void> {
    const creditsPath = 'freesound-credits.md';
    const entry =
      `- **${sound.name}** by *${sound.username}* — ` +
      `[freesound.org/s/${sound.id}](https://freesound.org/s/${sound.id}/) — ` +
      `License: ${sound.license}\n`;

    const existing = vault.getAbstractFileByPath(creditsPath);
    if (existing) {
      const content = await vault.read(existing as any);
      if (content.includes(`freesound.org/s/${sound.id}`)) return; // already credited
      await vault.modify(existing as any, content + entry);
    } else {
      await vault.create(
        creditsPath,
        `# Freesound Credits\n\nSounds downloaded from [Freesound.org](https://freesound.org/) under Creative Commons licenses.\n\n${entry}`,
      );
    }
  }

  /* ─── internal ──────────────────────────────────────────── */

  private async ensureFolder(vault: Vault, path: string): Promise<void> {
    const parts = path.split('/');
    let current = '';
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!vault.getAbstractFileByPath(current)) {
        await vault.createFolder(current);
      }
    }
  }
}
