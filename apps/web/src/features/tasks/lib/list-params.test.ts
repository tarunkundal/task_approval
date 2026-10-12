import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIST_PARAMS,
  findSortOption,
  hasActiveFilters,
  parseListParams,
  SORT_OPTIONS,
  toApiQuery,
  toSearchString,
} from './list-params';

const CUID = 'cm1abcdefghijklmnopqrstu';

function parse(query: string) {
  return parseListParams(new URLSearchParams(query));
}

describe('parseListParams', () => {
  it('returns the schema defaults for an empty URL', () => {
    expect(parse('')).toEqual({ page: 1, pageSize: 20, sort: 'createdAt', order: 'desc' });
    expect(DEFAULT_LIST_PARAMS).toEqual(parse(''));
  });

  it('keeps every valid value, coercing numbers', () => {
    expect(
      parse(
        `page=3&pageSize=50&status=PENDING_APPROVAL&priority=HIGH&assignedToId=${CUID}&q=report&sort=dueDate&order=asc`,
      ),
    ).toEqual({
      page: 3,
      pageSize: 50,
      status: 'PENDING_APPROVAL',
      priority: 'HIGH',
      assignedToId: CUID,
      q: 'report',
      sort: 'dueDate',
      order: 'asc',
    });
  });

  it('drops invalid values and falls back to the defaults', () => {
    expect(
      parse('page=0&pageSize=abc&status=DONE&priority=urgent&assignedToId=1&sort=title&order=up'),
    ).toEqual(DEFAULT_LIST_PARAMS);
    expect(parse('page=-2').page).toBe(1);
    expect(parse('page=1.5').page).toBe(1);
  });

  it('drops a pageSize above the API maximum (100)', () => {
    expect(parse('pageSize=101').pageSize).toBe(20);
    expect(parse('pageSize=100').pageSize).toBe(100);
  });

  it('ignores unknown keys', () => {
    expect(parse('foo=bar&deletedAt=1&status=PENDING')).toEqual({
      ...DEFAULT_LIST_PARAMS,
      status: 'PENDING',
    });
  });

  it('trims q and omits a blank or too-long search', () => {
    expect(parse('q=%20%20report%20').q).toBe('report');
    expect(parse('q=%20%20').q).toBeUndefined();
    expect(parse('q=').q).toBeUndefined();
    expect(parse(`q=${'x'.repeat(101)}`).q).toBeUndefined();
  });
});

describe('toApiQuery / toSearchString', () => {
  it('omits defaults and empty values', () => {
    expect(toApiQuery(DEFAULT_LIST_PARAMS)).toEqual({});
    expect(toApiQuery({ ...DEFAULT_LIST_PARAMS, q: '  ', status: undefined })).toEqual({});
    expect(toSearchString(DEFAULT_LIST_PARAMS)).toBe('');
  });

  it('keeps non-default values in a stable key order', () => {
    const params = { ...DEFAULT_LIST_PARAMS, q: ' tax ', status: 'PENDING' as const, page: 2 };
    expect(toApiQuery(params)).toEqual({ page: 2, status: 'PENDING', q: 'tax' });
    expect(toSearchString(params)).toBe('page=2&status=PENDING&q=tax');
  });

  it('round-trips through the URL', () => {
    const params = parse(`status=COMPLETED&assignedToId=${CUID}&sort=priority&order=asc`);
    expect(parse(toSearchString(params))).toEqual(params);
  });
});

describe('hasActiveFilters', () => {
  it('only counts status, priority, employee and search', () => {
    expect(hasActiveFilters(DEFAULT_LIST_PARAMS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, page: 4, sort: 'dueDate' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, priority: 'LOW' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_LIST_PARAMS, q: 'x' })).toBe(true);
  });
});

describe('SORT_OPTIONS', () => {
  it('covers every sort/order pair exactly once', () => {
    const values = SORT_OPTIONS.map((item) => item.value);
    expect(new Set(values).size).toBe(8);
    expect(findSortOption('priority:asc')).toMatchObject({ sort: 'priority', order: 'asc' });
    expect(findSortOption('title:asc')).toBeUndefined();
  });
});
