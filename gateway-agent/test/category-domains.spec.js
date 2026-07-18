'use strict';

const { domainsForCategory } = require('../src/category-domains');

describe('domainsForCategory', () => {
  it('returns representative domains for GAMING', () => {
    expect(domainsForCategory('GAMING')).toEqual(expect.arrayContaining(['steampowered.com', 'epicgames.com']));
  });

  it('returns representative domains for STREAMING (covers "YouTube" from the spec)', () => {
    expect(domainsForCategory('STREAMING')).toEqual(expect.arrayContaining(['youtube.com']));
  });

  it('returns representative domains for SOCIAL', () => {
    expect(domainsForCategory('SOCIAL')).toEqual(expect.arrayContaining(['instagram.com']));
  });

  it('returns an empty array for a category with no bundled domain list (e.g. ADULT/CUSTOM)', () => {
    expect(domainsForCategory('ADULT')).toEqual([]);
    expect(domainsForCategory('CUSTOM')).toEqual([]);
  });

  it('returns an empty array for an unknown category rather than throwing', () => {
    expect(domainsForCategory('NOT_A_CATEGORY')).toEqual([]);
    expect(domainsForCategory(null)).toEqual([]);
  });
});
