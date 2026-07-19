import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DevicesPage from '../page';
import { devicesApi, childrenApi } from '@/lib/api';
import { renderWithQueryClient } from '../../../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
  devicesApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  childrenApi: { list: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
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

const sampleDevice = {
  id: 'd1',
  name: "iPad de Lucas",
  type: 'TABLET',
  status: 'ONLINE',
  protectionStatus: 'PROTECTED',
  internetLocked: false,
  child: { name: 'Lucas' },
};

describe('DevicesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [] });
  });

  it('shows a loading spinner while devices are being fetched', () => {
    (devicesApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<DevicesPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows an empty state when there are no devices', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [] });
    renderWithQueryClient(<DevicesPage />);
    expect(await screen.findByText('Aucun appareil trouvé')).toBeInTheDocument();
  });

  it('renders a list of devices returned by the API', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [sampleDevice] });
    renderWithQueryClient(<DevicesPage />);
    expect(await screen.findByText('iPad de Lucas')).toBeInTheDocument();
    expect(screen.getByText('Lucas')).toBeInTheDocument();
    expect(screen.getByText('En ligne')).toBeInTheDocument();
  });

  it('KNOWN GAP: an API failure is indistinguishable from "no devices" — no error state is shown', async () => {
    // devicesApi.list rejecting falls through react-query's `data` staying
    // undefined, so `devices = devicesRes?.data || []` silently renders the
    // same empty-state UI as a parent with zero devices. There is no
    // isError branch anywhere in this component. This test pins down the
    // CURRENT behavior so a fix is a deliberate, visible diff.
    (devicesApi.list as jest.Mock).mockRejectedValue(new Error('network down'));
    renderWithQueryClient(<DevicesPage />);
    expect(await screen.findByText('Aucun appareil trouvé')).toBeInTheDocument();
  });

  it('toggles internet lock on a device and shows a success toast', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [sampleDevice] });
    (devicesApi.update as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<DevicesPage />);

    await screen.findByText('iPad de Lucas');
    await user.click(screen.getByText('Bloquer Internet'));

    await waitFor(() =>
      expect(devicesApi.update).toHaveBeenCalledWith('d1', { internetLocked: true }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Internet bloqué');
  });

  it('shows an error toast if toggling internet lock fails', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [sampleDevice] });
    (devicesApi.update as jest.Mock).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithQueryClient(<DevicesPage />);

    await screen.findByText('iPad de Lucas');
    await user.click(screen.getByText('Bloquer Internet'));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Erreur lors de la modification'));
  });

  it('opens the add-device modal and creates a device', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (devicesApi.create as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<DevicesPage />);

    await screen.findByText('Aucun appareil trouvé');
    await user.click(screen.getByText('Connecter un appareil'));

    const dialog = screen.getByRole('heading', { name: 'Ajouter un appareil' }).closest('div')!.parentElement!;
    const nameInput = within(dialog).getByPlaceholderText('Ex: iPad de Lucas');
    await user.type(nameInput, 'Nouvelle tablette');
    await user.click(within(dialog).getByRole('button', { name: 'Connecter' }));

    await waitFor(() =>
      expect(devicesApi.create).toHaveBeenCalledWith({
        name: 'Nouvelle tablette',
        type: 'SMARTPHONE',
        childId: undefined,
      }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Appareil ajouté');
  });

  it('shows an API error message when device creation fails', async () => {
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (devicesApi.create as jest.Mock).mockRejectedValue({
      response: { data: { message: 'Nom déjà utilisé' } },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<DevicesPage />);

    await screen.findByText('Aucun appareil trouvé');
    await user.click(screen.getByText('Connecter un appareil'));
    const dialog = screen.getByRole('heading', { name: 'Ajouter un appareil' }).closest('div')!.parentElement!;
    await user.type(within(dialog).getByPlaceholderText('Ex: iPad de Lucas'), 'X');
    await user.click(within(dialog).getByRole('button', { name: 'Connecter' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Nom déjà utilisé'));
  });
});
