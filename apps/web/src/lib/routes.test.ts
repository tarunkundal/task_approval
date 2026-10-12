import { describe, expect, it } from 'vitest';
import { homeFor, isAdminPath, isEmployeePath, loginPath, safeReturnPath } from './routes';

describe('homeFor', () => {
  it('maps each role to its home', () => {
    expect(homeFor('ADMIN')).toBe('/admin');
    expect(homeFor('EMPLOYEE')).toBe('/employee');
  });
});

describe('section paths', () => {
  it('matches the section root and its children only', () => {
    expect(isAdminPath('/admin')).toBe(true);
    expect(isAdminPath('/admin/tasks/1')).toBe(true);
    expect(isAdminPath('/administrator')).toBe(false);
    expect(isEmployeePath('/employee/tasks/1')).toBe(true);
    expect(isEmployeePath('/admin')).toBe(false);
  });
});

describe('safeReturnPath', () => {
  it.each([
    '//evil.com',
    '//evil.com/admin',
    '/\\evil.com',
    'https://evil.com',
    'http://localhost:3000/admin',
    'javascript:alert(1)',
    'admin',
    '/login',
    '/login?next=/admin',
    '/admin\nSet-Cookie: x',
    '',
    null,
    undefined,
  ])('rejects %j', (value) => {
    expect(safeReturnPath(value)).toBeNull();
  });

  it('rejects paths that normalize to the login page', () => {
    expect(safeReturnPath('/admin/../login')).toBeNull();
  });

  it('keeps relative paths with query and hash', () => {
    expect(safeReturnPath('/admin/tasks?status=PENDING')).toBe('/admin/tasks?status=PENDING');
    expect(safeReturnPath('/employee/tasks/abc#comments')).toBe('/employee/tasks/abc#comments');
    expect(safeReturnPath('/')).toBe('/');
  });
});

describe('loginPath', () => {
  it('encodes a safe return path', () => {
    expect(loginPath('/admin/tasks?x=1')).toBe('/login?next=%2Fadmin%2Ftasks%3Fx%3D1');
  });

  it('drops unsafe, empty or root return paths', () => {
    expect(loginPath('//evil.com')).toBe('/login');
    expect(loginPath('/')).toBe('/login');
    expect(loginPath(null)).toBe('/login');
    expect(loginPath()).toBe('/login');
  });
});
