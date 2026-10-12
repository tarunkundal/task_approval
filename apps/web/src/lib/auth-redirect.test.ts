import { describe, expect, it } from 'vitest';
import { proxyDecision } from './auth-redirect';

describe('proxyDecision', () => {
  it('redirects an app route without a token to /login with the return path', () => {
    expect(proxyDecision({ pathname: '/admin/tasks', search: '?x=1', hasToken: false })).toEqual({
      type: 'redirect',
      location: '/login?next=%2Fadmin%2Ftasks%3Fx%3D1',
    });
    expect(proxyDecision({ pathname: '/employee', search: '', hasToken: false })).toEqual({
      type: 'redirect',
      location: '/login?next=%2Femployee',
    });
  });

  it('redirects / without a token to plain /login', () => {
    expect(proxyDecision({ pathname: '/', search: '', hasToken: false })).toEqual({
      type: 'redirect',
      location: '/login',
    });
  });

  it('lets requests with a token through (the layout validates the session)', () => {
    expect(proxyDecision({ pathname: '/admin', search: '', hasToken: true })).toEqual({
      type: 'next',
    });
  });

  it('never redirects /login, with or without a token', () => {
    expect(proxyDecision({ pathname: '/login', search: '', hasToken: false })).toEqual({
      type: 'next',
    });
    expect(proxyDecision({ pathname: '/login', search: '?next=%2Fadmin', hasToken: true })).toEqual(
      { type: 'next' },
    );
  });
});
