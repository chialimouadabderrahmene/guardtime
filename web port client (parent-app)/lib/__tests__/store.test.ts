import { act, renderHook } from '@testing-library/react';
import { useAuthStore, useDashboardStore } from '../store';

describe('useAuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
    act(() => {
      useAuthStore.setState({ user: null, isAuthenticated: false });
    });
  });

  it('starts unauthenticated with no user', () => {
    const { result } = renderHook(() => useAuthStore());
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('login() sets user, marks authenticated, and persists tokens to localStorage', () => {
    const { result } = renderHook(() => useAuthStore());
    const user = { id: '1', name: 'Jane', email: 'jane@example.com' };

    act(() => {
      result.current.login(user, { accessToken: 'acc', refreshToken: 'ref' });
    });

    expect(result.current.user).toEqual(user);
    expect(result.current.isAuthenticated).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('acc');
    expect(localStorage.getItem('refreshToken')).toBe('ref');
  });

  it('logout() clears user, marks unauthenticated, and removes tokens', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.login(
        { id: '1', name: 'Jane', email: 'jane@example.com' },
        { accessToken: 'acc', refreshToken: 'ref' },
      );
    });

    act(() => {
      result.current.logout();
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('setUser(null) marks the store unauthenticated', () => {
    const { result } = renderHook(() => useAuthStore());
    act(() => {
      result.current.setUser({ id: '2', name: 'Bob', email: 'bob@example.com' });
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.setUser(null);
    });
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });
});

describe('useDashboardStore', () => {
  beforeEach(() => {
    act(() => {
      useDashboardStore.setState({ selectedChild: null });
    });
  });

  it('starts with no selected child', () => {
    const { result } = renderHook(() => useDashboardStore());
    expect(result.current.selectedChild).toBeNull();
  });

  it('setSelectedChild updates and can be cleared', () => {
    const { result } = renderHook(() => useDashboardStore());
    act(() => result.current.setSelectedChild('child-1'));
    expect(result.current.selectedChild).toBe('child-1');

    act(() => result.current.setSelectedChild(null));
    expect(result.current.selectedChild).toBeNull();
  });
});
