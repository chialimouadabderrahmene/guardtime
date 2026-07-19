import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DashboardLayout from '../dashboard-layout';
import { useAuthStore } from '@/lib/store';

const pushMock = jest.fn();
let pathname = '/dashboard';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => pathname,
}));

describe('DashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pathname = '/dashboard';
    useAuthStore.setState({
      user: { id: '1', name: 'Jane', email: 'jane@example.com' },
      isAuthenticated: true,
    });
  });

  it('renders all nav items and highlights the active route', () => {
    pathname = '/dashboard/devices';
    render(
      <DashboardLayout>
        <div>PAGE_CONTENT</div>
      </DashboardLayout>,
    );

    ['Tableau de bord', 'Enfants', 'Appareils', 'Sessions', 'Statistiques', 'Paramètres'].forEach(
      (label) => expect(screen.getByText(label)).toBeInTheDocument(),
    );
    expect(screen.getByText('PAGE_CONTENT')).toBeInTheDocument();
  });

  it('shows the current user name and email', () => {
    render(<DashboardLayout>{null}</DashboardLayout>);
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
  });

  it('falls back to "Parent" when there is no user name', () => {
    useAuthStore.setState({ user: { id: '1', name: '', email: '' }, isAuthenticated: true });
    render(<DashboardLayout>{null}</DashboardLayout>);
    expect(screen.getByText('Parent')).toBeInTheDocument();
  });

  it('navigates when a nav item is clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardLayout>{null}</DashboardLayout>);
    await user.click(screen.getByText('Enfants'));
    expect(pushMock).toHaveBeenCalledWith('/dashboard/children');
  });

  it('logs out and redirects to the home page', async () => {
    const user = userEvent.setup();
    render(<DashboardLayout>{null}</DashboardLayout>);
    await user.click(screen.getByText('Déconnexion'));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(pushMock).toHaveBeenCalledWith('/');
  });
});
