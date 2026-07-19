import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChildrenPage from '../page';
import { childrenApi } from '@/lib/api';
import { renderWithQueryClient } from '../../../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
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

const sampleChild = { id: 'c1', name: 'Lucas', age: 10, defaultLimit: 120, devices: [{ id: 'd1' }] };

describe('ChildrenPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.confirm = jest.fn(() => true);
  });

  it('shows a loading spinner while children are being fetched', () => {
    (childrenApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<ChildrenPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows an empty state when there are no children', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [] });
    renderWithQueryClient(<ChildrenPage />);
    expect(await screen.findByText('Aucun enfant trouvé')).toBeInTheDocument();
  });

  it('renders a child profile card with age and device count', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [sampleChild] });
    renderWithQueryClient(<ChildrenPage />);
    expect(await screen.findByText('Lucas')).toBeInTheDocument();
    expect(screen.getByText('10 ans')).toBeInTheDocument();
    expect(screen.getByText('120 min / jour')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('KNOWN GAP: an API failure renders the same empty state as zero children', async () => {
    (childrenApi.list as jest.Mock).mockRejectedValue(new Error('down'));
    renderWithQueryClient(<ChildrenPage />);
    expect(await screen.findByText('Aucun enfant trouvé')).toBeInTheDocument();
  });

  it('creates a new child profile via the modal form', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (childrenApi.create as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<ChildrenPage />);

    await screen.findByText('Ajouter le premier profil');
    await user.click(screen.getByText('Ajouter le premier profil'));

    const dialog = screen.getByRole('heading', { name: 'Ajouter un enfant' }).closest('div')!.parentElement!;
    await user.type(within(dialog).getByPlaceholderText('Ex: Lucas'), 'Emma');
    await user.type(within(dialog).getByPlaceholderText('Ex: 10'), '8');
    await user.click(within(dialog).getByRole('button', { name: 'Ajouter' }));

    await waitFor(() =>
      expect(childrenApi.create).toHaveBeenCalledWith({ name: 'Emma', age: 8, defaultLimit: undefined }),
    );
    expect(toastSuccess).toHaveBeenCalledWith('Enfant ajouté avec succès');
  });

  it('deletes a child profile after confirmation', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [sampleChild] });
    (childrenApi.delete as jest.Mock).mockResolvedValue({});
    const user = userEvent.setup();
    renderWithQueryClient(<ChildrenPage />);

    await screen.findByText('Lucas');
    const deleteButton = document.querySelectorAll('button')[document.querySelectorAll('button').length - 1];
    await user.click(deleteButton);

    await waitFor(() => expect(childrenApi.delete).toHaveBeenCalledWith('c1'));
    expect(toastSuccess).toHaveBeenCalledWith('Profil supprimé');
  });

  it('does not delete when the confirmation dialog is cancelled', async () => {
    window.confirm = jest.fn(() => false);
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [sampleChild] });
    const user = userEvent.setup();
    renderWithQueryClient(<ChildrenPage />);

    await screen.findByText('Lucas');
    const deleteButton = document.querySelectorAll('button')[document.querySelectorAll('button').length - 1];
    await user.click(deleteButton);

    expect(childrenApi.delete).not.toHaveBeenCalled();
  });

  it('shows an error toast when deletion fails', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [sampleChild] });
    (childrenApi.delete as jest.Mock).mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    renderWithQueryClient(<ChildrenPage />);

    await screen.findByText('Lucas');
    const deleteButton = document.querySelectorAll('button')[document.querySelectorAll('button').length - 1];
    await user.click(deleteButton);

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Erreur lors de la suppression'));
  });
});
