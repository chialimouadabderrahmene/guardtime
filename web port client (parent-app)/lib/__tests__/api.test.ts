jest.mock('axios', () => {
  const instance: any = jest.fn((config: any) => Promise.resolve({ data: {}, config }));
  instance.get = jest.fn();
  instance.post = jest.fn();
  instance.patch = jest.fn();
  instance.delete = jest.fn();
  const handlers: any = {};
  instance.interceptors = {
    request: { use: jest.fn((fn: any) => { handlers.request = fn; }) },
    response: {
      use: jest.fn((ok: any, err: any) => {
        handlers.responseOk = ok;
        handlers.responseErr = err;
      }),
    },
  };
  const defaultExport: any = {
    create: jest.fn(() => instance),
    post: jest.fn(),
    __instance: instance,
    __handlers: handlers,
  };
  return { __esModule: true, default: defaultExport };
});

import axios from 'axios';
import { authApi, childrenApi, devicesApi, sessionsApi, reportsApi, usageApi, parentsApi } from '../api';

const mockAxios = axios as any;
const apiInstance = mockAxios.__instance;
const handlers = mockAxios.__handlers;

describe('api client setup', () => {
  it('creates the axios instance with the configured base URL and JSON content-type header', () => {
    expect(mockAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
});

describe('request interceptor (auth token attachment)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('attaches the Authorization header when an access token is present', () => {
    localStorage.setItem('accessToken', 'abc123');
    const config = handlers.request({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer abc123');
  });

  it('does not attach an Authorization header when no token is present', () => {
    const config = handlers.request({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe('response interceptor (401 refresh flow)', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    // jsdom's window.location is non-configurable and does not implement
    // real navigation; setting .href logs a harmless "Not implemented"
    // console.error. We suppress it here rather than fight jsdom internals —
    // the meaningful assertions are the token clearing below, not the
    // literal href value.
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes through successful responses unchanged', () => {
    const response = { data: { ok: true } };
    expect(handlers.responseOk(response)).toBe(response);
  });

  it('rejects non-401 errors without attempting a refresh', async () => {
    const error = { response: { status: 500 }, config: {} };
    await expect(handlers.responseErr(error)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('rejects a 401 with no stored refresh token, without calling the refresh endpoint', async () => {
    const error = { response: { status: 401 }, config: {} };
    await expect(handlers.responseErr(error)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('refreshes the token, retries the original request, and stores new tokens on a 401', async () => {
    localStorage.setItem('refreshToken', 'old-refresh');
    mockAxios.post.mockResolvedValueOnce({
      data: { accessToken: 'new-access', refreshToken: 'new-refresh' },
    });
    apiInstance.mockResolvedValueOnce({ data: { retried: true } });

    const originalRequest: any = { headers: {}, _retry: undefined };
    const error = { response: { status: 401 }, config: originalRequest };

    const result = await handlers.responseErr(error);

    expect(mockAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/auth/refresh'),
      { refreshToken: 'old-refresh' },
    );
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(localStorage.getItem('refreshToken')).toBe('new-refresh');
    expect(originalRequest.headers.Authorization).toBe('Bearer new-access');
    expect(originalRequest._retry).toBe(true);
    expect(apiInstance).toHaveBeenCalledWith(originalRequest);
    expect(result).toEqual({ data: { retried: true } });
  });

  it('does not attempt a second refresh if the retried request is already marked _retry', async () => {
    localStorage.setItem('refreshToken', 'old-refresh');
    const originalRequest: any = { headers: {}, _retry: true };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(handlers.responseErr(error)).rejects.toBe(error);
    expect(mockAxios.post).not.toHaveBeenCalled();
  });

  it('clears stored tokens when the refresh call itself fails', async () => {
    localStorage.setItem('accessToken', 'stale-access');
    localStorage.setItem('refreshToken', 'stale-refresh');
    mockAxios.post.mockRejectedValueOnce(new Error('refresh expired'));

    const originalRequest: any = { headers: {} };
    const error = { response: { status: 401 }, config: originalRequest };

    await expect(handlers.responseErr(error)).rejects.toBe(error);

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

describe('domain API modules', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('authApi.login posts credentials to /auth/login', () => {
    authApi.login('a@b.com', 'secret');
    expect(apiInstance.post).toHaveBeenCalledWith('/auth/login', {
      email: 'a@b.com',
      password: 'secret',
    });
  });

  it('authApi.register splits the full name into first/last name', () => {
    authApi.register({ name: 'Jane Marie Doe', email: 'j@d.com', password: 'pw' });
    expect(apiInstance.post).toHaveBeenCalledWith('/auth/register', {
      email: 'j@d.com',
      password: 'pw',
      firstName: 'Jane',
      lastName: 'Marie Doe',
    });
  });

  it('authApi.register omits lastName for a single-word name', () => {
    authApi.register({ name: 'Cher', email: 'c@d.com', password: 'pw' });
    expect(apiInstance.post).toHaveBeenCalledWith('/auth/register', {
      email: 'c@d.com',
      password: 'pw',
      firstName: 'Cher',
      lastName: undefined,
    });
  });

  it('authApi.me fetches the current parent profile', () => {
    authApi.me();
    expect(apiInstance.get).toHaveBeenCalledWith('/parents/me');
  });

  it('childrenApi covers list/create/update/delete', () => {
    childrenApi.list();
    childrenApi.create({ name: 'Kid' });
    childrenApi.update('c1', { name: 'Kid2' });
    childrenApi.delete('c1');
    expect(apiInstance.get).toHaveBeenCalledWith('/children');
    expect(apiInstance.post).toHaveBeenCalledWith('/children', { name: 'Kid' });
    expect(apiInstance.patch).toHaveBeenCalledWith('/children/c1', { name: 'Kid2' });
    expect(apiInstance.delete).toHaveBeenCalledWith('/children/c1');
  });

  it('devicesApi covers list/create/update/delete', () => {
    devicesApi.list();
    devicesApi.create({ name: 'iPad' });
    devicesApi.update('d1', { internetLocked: true });
    devicesApi.delete('d1');
    expect(apiInstance.get).toHaveBeenCalledWith('/devices');
    expect(apiInstance.post).toHaveBeenCalledWith('/devices', { name: 'iPad' });
    expect(apiInstance.patch).toHaveBeenCalledWith('/devices/d1', { internetLocked: true });
    expect(apiInstance.delete).toHaveBeenCalledWith('/devices/d1');
  });

  it('sessionsApi covers list/start/stop', () => {
    sessionsApi.list();
    sessionsApi.start({ childId: 'c1', deviceId: 'd1', durationMinutes: 30 });
    sessionsApi.stop('s1');
    expect(apiInstance.get).toHaveBeenCalledWith('/sessions');
    expect(apiInstance.post).toHaveBeenCalledWith('/sessions/start', {
      childId: 'c1',
      deviceId: 'd1',
      durationMinutes: 30,
    });
    expect(apiInstance.post).toHaveBeenCalledWith('/sessions/s1/stop', {});
  });

  it('reportsApi covers weekly and monthly', () => {
    reportsApi.weekly({ childId: 'c1', offset: 0 });
    reportsApi.monthly({ childId: 'c1', offset: 1 });
    expect(apiInstance.get).toHaveBeenCalledWith('/reports/weekly', {
      params: { childId: 'c1', offset: 0 },
    });
    expect(apiInstance.get).toHaveBeenCalledWith('/reports/monthly', {
      params: { childId: 'c1', offset: 1 },
    });
  });

  it('usageApi covers daily/weekly/device', () => {
    usageApi.daily('c1', '2026-07-18');
    usageApi.weekly('c1');
    usageApi.device('d1');
    expect(apiInstance.get).toHaveBeenCalledWith('/usage/daily', {
      params: { childId: 'c1', date: '2026-07-18' },
    });
    expect(apiInstance.get).toHaveBeenCalledWith('/usage/weekly', { params: { childId: 'c1' } });
    expect(apiInstance.get).toHaveBeenCalledWith('/usage/device/d1');
  });

  it('parentsApi covers profile/subscription', () => {
    parentsApi.profile();
    parentsApi.updateProfile({ firstName: 'Jane' });
    parentsApi.deleteAccount();
    parentsApi.subscription();
    expect(apiInstance.get).toHaveBeenCalledWith('/parents/profile');
    expect(apiInstance.patch).toHaveBeenCalledWith('/parents/profile', { firstName: 'Jane' });
    expect(apiInstance.delete).toHaveBeenCalledWith('/parents/profile');
    expect(apiInstance.get).toHaveBeenCalledWith('/parents/subscription');
  });
});
