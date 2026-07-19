import { render, waitFor } from '@testing-library/react';
import Home from '../page';
import { useAuthStore } from '@/lib/store';

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

jest.mock('@/components/login-page', () => () => <div>LOGIN_PAGE</div>);

describe('Home route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('renders the login page when not authenticated', () => {
    const { getByText } = render(<Home />);
    expect(getByText('LOGIN_PAGE')).toBeInTheDocument();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('redirects to /dashboard when already authenticated', async () => {
    useAuthStore.setState({
      user: { id: '1', name: 'Jane', email: 'j@e.com' },
      isAuthenticated: true,
    });
    render(<Home />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });
});
