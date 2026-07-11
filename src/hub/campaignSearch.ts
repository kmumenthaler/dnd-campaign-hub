export interface CampaignSearchItem {
  path: string;
  name: string;
  type: string;
  context: string;
}

const normalize = (value: string): string => value.toLocaleLowerCase().trim();

export function scoreCampaignSearchItem(item: CampaignSearchItem, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const name = normalize(item.name);
  const type = normalize(item.type);
  const context = normalize(item.context);
  if (name === q) return 1000;
  if (name.startsWith(q)) return 700 - Math.min(name.length - q.length, 100);
  if (name.includes(q)) return 500 - Math.min(name.indexOf(q), 100);
  if (type.startsWith(q)) return 300;
  if (context.includes(q)) return 200;
  const terms = q.split(/\s+/).filter(Boolean);
  const haystack = `${name} ${type} ${context}`;
  return terms.every(term => haystack.includes(term)) ? 100 : 0;
}

export function searchCampaignItems(items: CampaignSearchItem[], query: string, limit = 50): CampaignSearchItem[] {
  return items
    .map((item, index) => ({ item, index, score: scoreCampaignSearchItem(item, query) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name) || a.index - b.index)
    .slice(0, limit)
    .map(entry => entry.item);
}
