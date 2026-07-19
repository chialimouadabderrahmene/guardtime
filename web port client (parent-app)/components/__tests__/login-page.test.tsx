import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '../login-page';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

jest.mock('@/lib/api', () => ({
  authApi: {
    login: jest.fn(),
    register: jest.fn(),
  },
}));

const pushMock = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

const toastSuccess = jest.fn();
const toastError = jest.fn();
jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: {
    success: (...args: any[]) => toastSuccess(...args),
    error: (...args: any[]) => toastError(...args),
  },
}));

describe('LoginPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
  });

  it('renders the login form by default', () => {
    render(<LoginPage />);
    expect(screen.getByText('Connexion')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('vous@exemple.com')).toBeInTheDocument();
    expect(screen.queryByText('Nom complet')).not.toBeInTheDocument();
  });

  it('switches to the registration form and shows the name field', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('Inscription'));
    expect(await screen.findByText('Nom complet')).toBeInTheDocument();
  });

  it('logs in successfully: calls the API, updates the store, toasts, and redirects', async () => {
    (authApi.login as jest.Mock).mockResolvedValue({
      data: {
        user: { id: '1', name: 'Jane', email: 'jane@example.com' },
        accessToken: 'acc',
        refreshToken: 'ref',
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);

    await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith('jane@example.com', 'password123');
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
    expect(toastSuccess).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('shows an error toast and stays on the page when login fails', async () => {
    (authApi.login as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Identifiants invalides' } },
    });

    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'wrongpass');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Identifiants invalides'));
    expect(pushMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('falls back to a generic error message when the API error has no message', async () => {
    (authApi.login as jest.Mock).mockRejectedValue(new Error('network down'));

    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'pw');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Une erreur est survenue'));
  });

  it('registers a new account and redirects to the dashboard', async () => {
    (authApi.register as jest.Mock).mockResolvedValue({
      data: {
        user: { id: '2', name: 'New Parent', email: 'new@example.com' },
        accessToken: 'acc2',
        refreshToken: 'ref2',
      },
    });

    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByText('Inscription'));
    await user.type(await screen.findByPlaceholderText('Votre nom'), 'New Parent');
    await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'new@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Créer un compte' }));

    await waitFor(() =>
      expect(authApi.register).toHaveBeenCalledWith({
        name: 'New Parent',
        email: 'new@example.com',
        password: 'password123',
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/dashboard'));
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText('••••••••') as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = passwordInput.parentElement!.querySelector('button')!;
    await user.click(toggleButton);
    expect(passwordInput.type).toBe('text');
  });

  it('disables the submit button while the request is in flight', async () => {
    let resolveLogin: (v: any) => void;
    (authApi.login as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<LoginPage />);
    await user.type(screen.getByPlaceholderText('vous@exemple.com'), 'jane@example.com');
    await user.type(screen.getByPlaceholderText('••••••••'), 'password123');
    const submitButton = screen.getByRole('button', { name: 'Se connecter' });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();

    resolveLogin!({
      data: { user: { id: '1', name: 'Jane', email: 'j@e.com' }, accessToken: 'a', refreshToken: 'r' },
    });
    await waitFor(() => expect(pushMock).toHaveBeenCalled());
  });
});
