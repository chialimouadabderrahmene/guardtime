import { screen } from '@testing-library/react';
import DashboardHome from '../dashboard-home';
import { useAuthStore } from '@/lib/store';
import { childrenApi, devicesApi, sessionsApi } from '@/lib/api';
import { renderWithQueryClient } from '../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
  childrenApi: { list: jest.fn() },
  devicesApi: { list: jest.fn() },
  sessionsApi: { list: jest.fn() },
}));

describe('DashboardHome', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: '1', name: 'Jane', email: 'j@e.com' },
      isAuthenticated: true,
    });
  });

  it('shows a full-page spinner while any of the three queries is loading', () => {
    (childrenApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    (devicesApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    (sessionsApi.list as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<DashboardHome />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders stat counts once data has loaded, greeting the current user by name', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({
      data: [{ id: 'c1', name: 'Lucas' }, { id: 'c2', name: 'Emma' }],
    });
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [{ id: 'd1' }] });
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [{ id: 's1', status: 'ACTIVE' }] });

    renderWithQueryClient(<DashboardHome />);

    expect(await screen.findByText('Bonjour, Jane!')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // Enfants
    expect(screen.getAllByText('1').length).toBeGreaterThan(0); // Appareils / Sessions actives
  });

  it('falls back to "Parent" when no user name is set', async () => {
    useAuthStore.setState({ user: { id: '1', name: '', email: 'j@e.com' }, isAuthenticated: true });
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });

    renderWithQueryClient(<DashboardHome />);
    expect(await screen.findByText('Bonjour, Parent!')).toBeInTheDocument();
  });

  it('derives "recent activity" from real session start/stop timestamps, not fake data', async () => {
    const now = Date.now();
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [{ id: 'c1', name: 'Lucas' }] });
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [{ id: 'd1', name: 'iPad' }] });
    (sessionsApi.list as jest.Mock).mockResolvedValue({
      data: [
        {
          id: 's1',
          status: 'STOPPED',
          childId: 'c1',
          deviceId: 'd1',
          startedAt: new Date(now - 3 * 60_000).toISOString(),
          stoppedAt: new Date(now - 1 * 60_000).toISOString(),
        },
      ],
    });

    renderWithQueryClient(<DashboardHome />);

    expect(await screen.findByText('Session arrêtée')).toBeInTheDocument();
    expect(screen.getByText('Session démarrée')).toBeInTheDocument();
    expect(screen.getAllByText('Lucas · iPad', { exact: false }).length).toBeGreaterThan(0);
  });

  it('shows an empty state instead of fake activity when there are no sessions', async () => {
    (childrenApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (devicesApi.list as jest.Mock).mockResolvedValue({ data: [] });
    (sessionsApi.list as jest.Mock).mockResolvedValue({ data: [] });

    renderWithQueryClient(<DashboardHome />);
    expect(await screen.findByText('Aucune activité récente.')).toBeInTheDocument();
  });
});
