import { render, screen } from '@testing-library/react';
import { PortalWorkshopList } from '@/components/workshops/workshop-list-filters';

describe('PortalWorkshopList', () => {
  it('hides Validated column for coaches (isAdmin=false)', () => {
    render(<PortalWorkshopList workshops={[]} isAdmin={false} />);
    expect(screen.queryByText('Validated')).not.toBeInTheDocument();
  });

  it('shows Validated column for admins (isAdmin=true)', () => {
    render(<PortalWorkshopList workshops={[]} isAdmin={true} />);
    expect(screen.getByText('Validated')).toBeInTheDocument();
  });
});
