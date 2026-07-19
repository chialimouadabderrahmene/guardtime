import { screen, waitFor } from '@testing-library/react';
import Dashboard from '../page';
import { useAuthStore } from '@/lib/store';
import { renderWithQueryClient } from '../../../test-utils/query-client';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => '/dashboard',
}));

jest.mock('@/lib/api', () => ({
  childrenApi: { list: jest.fn(() => new Promise(() => {})) },
  devicesApi: { list: jest.fn(() => new Promise(() => {})) },
  sessionsApi: { list: jest.fn(() => new Promise(() => {})) },
}));

describe('Dashboard route guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('redirects to home when the user is not authenticated', async () => {
    renderWithQueryClient(<Dashboard />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
  });

  it('renders no content while unauthenticated (no dashboard leaked before redirect)', () => {
    const { container } = renderWithQueryClient(<Dashboard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the dashboard layout when authenticated', () => {
    useAuthStore.setState({
      user: { id: '1', name: 'Jane', email: 'j@e.com' },
      isAuthenticated: true,
    });
    renderWithQueryClient(<Dashboard />);
    expect(screen.getByRole('heading', { name: 'GuardTime' })).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalledWith('/');
  });
});
