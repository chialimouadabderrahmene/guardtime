import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../page';
import { parentsApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';
import { renderWithQueryClient } from '../../../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
  parentsApi: {
    profile: jest.fn(),
    updateProfile: jest.fn(),
    deleteAccount: jest.fn(),
    subscription: jest.fn(),
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

const sampleProfile = {
  id: 'u1',
  email: 'jane@example.com',
  firstName: 'Jane',
  lastName: 'Doe',
  role: 'PARENT',
};

describe('SettingsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: { id: 'u1', name: 'Jane', email: 'jane@example.com' }, isAuthenticated: true });
    (parentsApi.subscription as jest.Mock).mockResolvedValue({
      data: { plan: 'PREMIUM', active: true, currentPeriodEnd: '2026-08-18T00:00:00.000Z' },
    });
  });

  it('shows a loading spinner while the profile is being fetched', () => {
    (parentsApi.profile as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<SettingsPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders real profile and subscription data', async () => {
    (parentsApi.profile as jest.Mock).mockResolvedValue({ data: sampleProfile });
    renderWithQueryClient(<SettingsPage />);

    expect(await screen.findByDisplayValue('Jane')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Doe')).toBeInTheDocument();
    expect(screen.getByDisplayValue('jane@example.com')).toBeDisabled();
    expect(await screen.findByText('Premium')).toBeInTheDocument();
  });

  it('shows an error state instead of fake data when the profile fails to load', async () => {
    (parentsApi.profile as jest.Mock).mockRejectedValue(new Error('down'));
    renderWithQueryClient(<SettingsPage />);
    expect(await screen.findByText('Profil indisponible')).toBeInTheDocument();
  });

  it('saves profile edits', async () => {
    (parentsApi.profile as jest.Mock).mockResolvedValue({ data: sampleProfile });
    (parentsApi.updateProfile as jest.Mock).mockResolvedValue({ data: sampleProfile });
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    const firstNameInput = await screen.findByDisplayValue('Jane');
    await user.clear(firstNameInput);
    await user.type(firstNameInput, 'Janet');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(parentsApi.updateProfile).toHaveBeenCalledWith({ firstName: 'Janet', lastName: 'Doe' }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Profil mis à jour');
  });

  it('deletes the account after confirmation and logs out', async () => {
    (parentsApi.profile as jest.Mock).mockResolvedValue({ data: sampleProfile });
    (parentsApi.deleteAccount as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await screen.findByDisplayValue('Jane');
    await user.click(screen.getByText('Supprimer mon compte'));
    await user.click(screen.getByText('Supprimer définitivement'));

    await waitFor(() => expect(parentsApi.deleteAccount).toHaveBeenCalled());
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(pushMock).toHaveBeenCalledWith('/');
  });

  it('cancels account deletion without calling the API', async () => {
    (parentsApi.profile as jest.Mock).mockResolvedValue({ data: sampleProfile });
    const user = userEvent.setup();
    renderWithQueryClient(<SettingsPage />);

    await screen.findByDisplayValue('Jane');
    await user.click(screen.getByText('Supprimer mon compte'));
    await user.click(screen.getByText('Annuler'));

    expect(parentsApi.deleteAccount).not.toHaveBeenCalled();
    expect(screen.queryByText('Supprimer définitivement')).not.toBeInTheDocument();
  });
});
