// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { TopHeader } from '../TopHeader';
import { HeaderStatusProvider, useTakeOverHeaderLastUpdated } from '../HeaderStatus';

afterEach(cleanup);

function LivePage({ text }: { text: string | null }) {
  useTakeOverHeaderLastUpdated(text, 'live');
  return <div>live page</div>;
}

function App({ initial }: { initial: string | null }) {
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(initial);
  return (
    <MemoryRouter initialEntries={['/app/gis/gateway-status']}>
      <HeaderStatusProvider>
        <TopHeader />
        {open && <LivePage text={text} />}
        <button onClick={() => setOpen(false)}>leave</button>
        <button onClick={() => setText('21 Oct 2026, 14:33:05')}>reload</button>
      </HeaderStatusProvider>
    </MemoryRouter>
  );
}

describe('header "Last updated" taken over by a live page', () => {
  it('shows nothing until the page has its own time (never a made-up one)', () => {
    render(<App initial={null} />);
    expect(screen.queryByText(/Last updated/)).toBeNull();
  });

  it("shows the page's time, follows each reload, and goes away with the page", () => {
    render(<App initial="21 Oct 2026, 14:32:05" />);
    expect(screen.getByText(/Last updated 21 Oct 2026, 14:32:05/)).toBeTruthy();
    expect(screen.getByTitle('live')).toBeTruthy();

    fireEvent.click(screen.getByText('reload'));
    expect(screen.getByText(/Last updated 21 Oct 2026, 14:33:05/)).toBeTruthy();

    fireEvent.click(screen.getByText('leave'));
    // the page is gone: the header is back to the scheduler's time, which is unknown here, so no pill at all
    expect(screen.queryByText(/Last updated/)).toBeNull();
  });
});
