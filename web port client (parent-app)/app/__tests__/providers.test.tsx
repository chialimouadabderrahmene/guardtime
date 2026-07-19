import { render, screen } from '@testing-library/react';
import { Providers } from '../providers';

describe('Providers', () => {
  it('renders children inside the query client provider', () => {
    render(
      <Providers>
        <div>CHILD_CONTENT</div>
      </Providers>,
    );
    expect(screen.getByText('CHILD_CONTENT')).toBeInTheDocument();
  });
});
