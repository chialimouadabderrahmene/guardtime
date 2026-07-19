import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SessionsPage from '../page';
import { sessionsApi, childrenApi, devicesApi } from '@/lib/api';
import { renderWithQueryClient } from '../../../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
  sessionsApi: { list: jest.fn(), start: jest.fn(), stop: jest.fn() },
  childrenApi: { list: jest.fn() },
  devicesApi: { list: jest.fn() },
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

const activeSession = {
  id: 's1',
  status: 'ACTIVE',
  child: { name: 'Lucas' },
  device: { name: 'iPad' },
  remainingMinutes: 20,
  durationMinutes: 60,
};

const pastSession = {
  id: 's2',
  status: 'EXPIRED',
  child: { name: 'Emma' },
  durationMinutes: 30,
  startedAt: '2026-01-01T10:00:00.000Z',
};

describe('SessionsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (childrenApi.list as jest.Mock).mockResolvedValue({
      data: [{ id: 'c1', name: 'Lucas' }],
    });
    (devicesApi.list as jest.Mock).mockResolvedValue({
      data: [{ id: 'd1', name: 'iPad', type: 'TABLET', childId: 'c1' }],
    });
  });

  it('shows a loading spinner while sessions are being fetched', () => {
    (sessionsApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<SessionsPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty states for both active sessions and history when there are none', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });
    renderWithQueryClient(<SessionsPage />);
    expect(await screen.findByText('Aucune session active actuellement.')).toBeInTheDocument();
    expect(screen.getByText('Aucun historique disponible.')).toBeInTheDocument();
  });

  it('splits sessions into an active section and a history section by status', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [activeSession, pastSession] });
    renderWithQueryClient(<SessionsPage />);

    expect(await screen.findByText('Lucas')).toBeInTheDocument();
    expect(screen.getByText('20 min')).toBeInTheDocument();
    expect(screen.getByText('Emma')).toBeInTheDocument();
    expect(screen.getByText('Terminé (Temps écoulé)')).toBeInTheDocument();
  });

  it('stops an active session and shows a success toast', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [activeSession] });
    (sessionsApi.stop as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<SessionsPage />);

    await screen.findByText('Lucas');
    await user.click(screen.getByText('Arrêter'));

    await waitFor(() => expect(sessionsApi.stop).toHaveBeenCalledWith('s1'));
    expect(toastSuccess).toHaveBeenCalledWith('Session arrêtée');
  });

  it('shows an error toast if stopping a session fails', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [activeSession] });
    (sessionsApi.stop as jest.Mock).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithQueryClient(<SessionsPage />);

    await screen.findByText('Lucas');
    await user.click(screen.getByText('Arrêter'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Erreur lors de l'arrêt"));
  });

  it('starts a new session via the modal, using a quick-duration preset', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (sessionsApi.start as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<SessionsPage />);

    await screen.findByText('Aucune session active actuellement.');
    await user.click(screen.getByText('Démarrer maintenant'));

    const dialog = screen.getByRole('heading', { name: 'Démarrer une session' }).closest('div')!.parentElement!;
    const [childSelect, deviceSelect] = within(dialog).getAllByRole('combobox');
    await user.selectOptions(childSelect, 'c1');
    await user.selectOptions(deviceSelect, 'd1');
    await user.click(within(dialog).getByText('30 min'));
    await user.click(within(dialog).getByRole('button', { name: /Démarrer/ }));

    await waitFor(() =>
      expect(sessionsApi.start).toHaveBeenCalledWith({
        childId: 'c1',
        deviceId: 'd1',
        durationMinutes: 30,
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Session démarrée avec succès');
  });

  it('shows an API error message when starting a session fails', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (sessionsApi.start as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Limite quotidienne atteinte' } },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<SessionsPage />);

    await screen.findByText('Aucune session active actuellement.');
    await user.click(screen.getByText('Démarrer maintenant'));
    const dialog = screen.getByRole('heading', { name: 'Démarrer une session' }).closest('div')!.parentElement!;
    const [childSelect, deviceSelect] = within(dialog).getAllByRole('combobox');
    await user.selectOptions(childSelect, 'c1');
    await user.selectOptions(deviceSelect, 'd1');
    await user.click(within(dialog).getByRole('button', { name: /Démarrer/ }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Limite quotidienne atteinte'));
  });

  it('only offers devices belonging to the selected child', async () => {
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (devicesApi.list as jest.Mock).mockResolvedValue({
      data: [
        { id: 'd1', name: 'iPad', type: 'TABLET', childId: 'c1' },
        { id: 'd2', name: 'Switch', type: 'NINTENDO', childId: 'c2' },
      ],
    });
    (childrenApi.list as jest.Mock).mockResolvedValue({
      data: [{ id: 'c1', name: 'Lucas' }, { id: 'c2', name: 'Emma' }],
    });

    const user = userEvent.setup();
    renderWithQueryClient(<SessionsPage />);
    await screen.findByText('Aucune session active actuellement.');
    await user.click(screen.getByText('Démarrer maintenant'));

    const dialog = screen.getByRole('heading', { name: 'Démarrer une session' }).closest('div')!.parentElement!;
    const [childSelect, deviceSelect] = within(dialog).getAllByRole('combobox') as HTMLSelectElement[];
    await user.selectOptions(childSelect, 'c1');

    const optionLabels = Array.from(deviceSelect.options).map((o) => o.textContent);
    expect(optionLabels).toEqual(expect.arrayContaining(['iPad (TABLET)']));
    expect(optionLabels).not.toEqual(expect.arrayContaining(['Switch (NINTENDO)']));
  });
});
