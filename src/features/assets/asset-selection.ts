import { listSchema } from '@/schemas/resources';
import { api,text } from '@/features/shared/api';

const PAGE_SIZE = 100;
const MAX_PAGES = 5;

/** Collects every not-started pipette id matching the current list filters, across pages (capped at 500). */
export async function fetchNotStartedIds(filters: URLSearchParams) {
  const ids: string[] = [];
  for (let page = 1; page<=MAX_PAGES; page++) {
    const params = new URLSearchParams(filters);
    params.set('progress','not_started');
    params.set('page',String(page));
    params.set('pageSize',String(PAGE_SIZE));
    params.delete('new');
    params.delete('edit');
    const list = listSchema.parse(await api(`assets?${params}`));
    ids.push(...list.data.map((row) => text(row,'id')).filter(Boolean));
    if (page*PAGE_SIZE>=list.meta.total) break;
  }
  return ids;
}
