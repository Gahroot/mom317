// Writes/reads the CONTRACT section 1 post format (simple `key: value`, YAML block lists).
const one = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

export const slugify = (s) => one(s).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');

const ORDER = ['title', 'slug', 'description', 'date', 'updated', 'status', 'approved_by', 'primary_keyword', 'secondary_keywords', 'answer', 'faq', 'sources', 'claims'];
const LIST_OF_OBJECTS = { faq: ['q', 'a'], sources: ['id', 'title', 'publisher', 'year', 'url'], claims: ['text', 'source'] };

export function serializePost(post) {
  const lines = ['---'];
  for (const key of ORDER) {
    const v = post[key];
    if (key === 'secondary_keywords') {
      lines.push(`${key}:`);
      for (const k of v || []) lines.push(`  - ${one(k)}`);
    } else if (LIST_OF_OBJECTS[key]) {
      lines.push(`${key}:`);
      for (const item of v || []) {
        LIST_OF_OBJECTS[key].forEach((f, i) => {
          if (item[f] === undefined || item[f] === null || item[f] === '') return;
          lines.push(`${i === 0 ? '  - ' : '    '}${f}: ${one(item[f])}`);
        });
      }
    } else {
      lines.push(v === undefined || v === null || v === '' ? `${key}:` : `${key}: ${one(v)}`);
    }
  }
  lines.push('---', '');
  return lines.join('\n') + String(post.body || '').trim() + '\n';
}

export function parsePost(text) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('no frontmatter');
  const data = {};
  let listKey = null, item = null;
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').replace(/\s+$/, '');
    if (!line.trim()) continue;
    let r;
    if ((r = line.match(/^([a-z_]+):\s*(.*)$/))) {
      listKey = null;
      if (r[2] === '') { data[r[1]] = LIST_OF_OBJECTS[r[1]] || r[1] === 'secondary_keywords' ? [] : ''; listKey = r[1]; }
      else data[r[1]] = r[2];
    } else if (listKey && (r = line.match(/^\s+-\s+(.*)$/))) {
      if (!Array.isArray(data[listKey])) data[listKey] = [];
      const kv = r[1].match(/^([a-z_]+):\s*(.*)$/);
      if (kv && LIST_OF_OBJECTS[listKey]) { item = { [kv[1]]: kv[2] }; data[listKey].push(item); }
      else { item = null; data[listKey].push(r[1]); }
    } else if (listKey && item && (r = line.match(/^\s+([a-z_]+):\s*(.*)$/))) {
      item[r[1]] = r[2];
    }
  }
  data.body = m[2].replace(/^\n/, '');
  return data;
}

/** Sets status/approved_by/updated in an existing post file, leaving everything else byte-identical. */
export function setApproval(text, approver, date) {
  return String(text)
    .replace(/^status:.*$/m, 'status: approved')
    .replace(/^approved_by:.*$/m, `approved_by: ${one(approver)}`)
    .replace(/^updated:.*$/m, `updated: ${date}`);
}

/** Removes citations to dropped sources from body + claims; renumbers nothing (ids stay stable). */
export function dropSources(post, dropIds) {
  const drop = new Set(dropIds.map(String));
  if (!drop.size) return post;
  const body = String(post.body || '').replace(/\[\^(\d+)\]/g, (s, id) => (drop.has(id) ? '' : s));
  return {
    ...post,
    body,
    sources: (post.sources || []).filter((s) => !drop.has(String(s.id))),
    claims: (post.claims || []).map((c) => (drop.has(String(c.source)) ? { ...c, source: '' , unsourced: true } : c))
  };
}

export function citedIds(body) {
  return [...new Set([...String(body).matchAll(/\[\^(\d+)\]/g)].map((m) => m[1]))];
}
