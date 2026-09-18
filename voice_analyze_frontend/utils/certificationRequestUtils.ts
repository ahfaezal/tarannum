export const courseContextPath = (qariId = '', search = '') => {
  const params = new URLSearchParams();
  // An absent UUID is valid; an empty UUID query value causes HTTP 422.
  if (qariId.trim()) params.set('qari_id', qariId.trim());
  if (search.trim()) params.set('search', search.trim());
  const query = params.toString();
  return `/managed/context${query ? `?${query}` : ''}`;
};

export const certificationErrorMessage = (detail: unknown): string => {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map(item => {
      if (!item || typeof item !== 'object') return '';
      const field = Array.isArray(item.loc) ? item.loc.slice(1).join('.') : '';
      return typeof item.msg === 'string' ? `${field ? `${field}: ` : ''}${item.msg}` : '';
    }).filter(Boolean);
    if (messages.length) return messages.join('; ');
  }
  return 'Permintaan persijilan gagal. Sila cuba semula.';
};
