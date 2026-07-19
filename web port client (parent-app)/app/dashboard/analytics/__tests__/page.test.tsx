import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnalyticsPage from '../page';
import { reportsApi, childrenApi } from '@/lib/api';
import { renderWithQueryClient } from '../../../../test-utils/query-client';

jest.mock('@/lib/api', () => ({
  reportsApi: { weekly: jest.fn(), monthly: jest.fn() },
  childrenApi: { list: jest.fn() },
}));

const sampleReport = {
  period: 'week',
  start: '2026-07-13T00:00:00.000Z',
  end: '2026-07-20T00:00:00.000Z',
  label: '13–19 Jul',
  scope: { childId: null },
  sessionsCount: 4,
  screenMinutes: 245,
  trackedMinutes: 300,
  gamingMinutes: 130,
  dailyMinutes: [30, 45, 0, 60, 20, 50, 40],
  topApps: [{ name: 'Roblox', minutes: 90 }, { name: 'YouTube', minutes: 40 }],
  byChild: [{ childId: 'c1', name: 'Lucas', screenMinutes: 245, sessions: 4 }],
  devices: [],
  protectedDevices: 2,
  totalDevices: 3,
  generatedAt: '2026-07-18T12:00:00.000Z',
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (childrenApi.list as jest.Mock).mockResolvedValue({
      data: [{ id: 'c1', name: 'Lucas' }],
    });
  });

  it('shows a loading spinner while the report is being fetched', () => {
    (reportsApi.weekly as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { container } = renderWithQueryClient(<AnalyticsPage />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders real weekly report data once loaded', async () => {
    (reportsApi.weekly as jest.Mock).mockResolvedValue({ data: sampleReport });
    renderWithQueryClient(<AnalyticsPage />);

    expect(await screen.findByText('4 h 5 min')).toBeInTheDocument(); // 245min screen time
    expect(screen.getByText('4')).toBeInTheDocument(); // sessionsCount
    expect(screen.getByText('2 h 10 min')).toBeInTheDocument(); // gamingMinutes
    expect(screen.getByText('2 / 3')).toBeInTheDocument(); // protected devices
    expect(screen.getByText('Roblox')).toBeInTheDocument();
    expect(screen.getAllByText('Lucas').length).toBeGreaterThan(0);
  });

  it('shows an error state instead of fake data when the report fails to load', async () => {
    (reportsApi.weekly as jest.Mock).mockRejectedValue(new Error('down'));
    renderWithQueryClient(<AnalyticsPage />);
    expect(await screen.findByText('Statistiques indisponibles')).toBeInTheDocument();
  });

  it('switches to the monthly report on toggle', async () => {
    (reportsApi.weekly as jest.Mock).mockResolvedValue({ data: sampleReport });
    (reportsApi.monthly as jest.Mock).mockResolvedValue({
      data: { ...sampleReport, period: 'month', dailyMinutes: new Array(30).fill(10) },
    });
    const user = userEvent.setup();
    renderWithQueryClient(<AnalyticsPage />);

    await screen.findByText('Roblox');
    await user.click(screen.getByText('Mois'));

    await waitFor(() => expect(reportsApi.monthly).toHaveBeenCalled());
  });

  it('filters by the selected child', async () => {
    (reportsApi.weekly as jest.Mock).mockResolvedValue({ data: sampleReport });
    const user = userEvent.setup();
    renderWithQueryClient(<AnalyticsPage />);
    await screen.findByText('Roblox');

    const select = screen.getByRole('combobox');
    await user.selectOptions(select, 'c1');

    await waitFor(() =>
      expect(reportsApi.weekly).toHaveBeenCalledWith({ childId: 'c1' }),
    );
  });
});
