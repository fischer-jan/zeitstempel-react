/**
 * Smoke tests for the React components.
 *
 * These render to static markup (no DOM/jsdom needed) and assert two
 * things: (1) the components produce the expected semantic structure,
 * and (2) they ship NO framework-specific styling — a regression guard
 * for the "unstyled by default" contract in the README. If someone
 * reintroduces Tailwind utility classes, TAILWIND_TOKENS will catch it.
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TimestampStatus } from '../../src/react/TimestampStatus.js';
import { VerifyTimestampButton } from '../../src/react/VerifyTimestampButton.js';
import { TimestampDownloadLinks } from '../../src/react/TimestampDownloadLinks.js';
import type { VerifyResult } from '../../src/core/types.js';

/** Tailwind utility tokens that must never appear in default output. */
const TAILWIND_TOKENS = [
  'inline-flex', 'flex-wrap', 'rounded', 'animate-pulse', 'space-y',
  'text-xs', 'text-[10px]', 'font-mono', 'font-medium', 'font-semibold',
  'bg-gray', 'text-gray', 'text-blue', 'gap-', 'p-1', 'p-2', 'px-2', 'py-1',
  'w-3', 'w-4', 'h-3', 'h-4', 'break-all', 'transition-colors', 'hover:',
];

function expectNoTailwind(html: string) {
  for (const token of TAILWIND_TOKENS) {
    expect(html, `rendered markup should not contain Tailwind token "${token}"`).not.toContain(token);
  }
}

describe('TimestampStatus', () => {
  it('renders the label for a state', () => {
    const html = renderToStaticMarkup(<TimestampStatus state="verified" />);
    expect(html).toContain('Verified');
    expectNoTailwind(html);
  });

  it('passes className through to the root element', () => {
    const html = renderToStaticMarkup(<TimestampStatus state="pending" className="my-badge" />);
    expect(html).toContain('class="my-badge"');
  });

  it('honors custom labels', () => {
    const html = renderToStaticMarkup(
      <TimestampStatus state="verifying" labels={{ verifying: 'Checking…' }} />,
    );
    expect(html).toContain('Checking…');
  });
});

describe('VerifyTimestampButton', () => {
  const noopVerify = async (): Promise<VerifyResult[]> => [];

  it('renders a button with an em-sized icon and no Tailwind', () => {
    const html = renderToStaticMarkup(<VerifyTimestampButton onVerify={noopVerify} />);
    expect(html).toContain('<button');
    expect(html).toContain('<svg');
    // Icons are sized in em so they follow font-size — not Tailwind w-*/h-*.
    expect(html).toContain('width="1em"');
    expectNoTailwind(html);
  });

  it('shows the idle label when showLabel is set', () => {
    const html = renderToStaticMarkup(<VerifyTimestampButton onVerify={noopVerify} showLabel />);
    expect(html).toContain('Verify');
  });

  it('uses a larger icon for size="md"', () => {
    const html = renderToStaticMarkup(<VerifyTimestampButton onVerify={noopVerify} size="md" />);
    expect(html).toContain('width="1.25em"');
  });

  it('passes className through to the button', () => {
    const html = renderToStaticMarkup(
      <VerifyTimestampButton onVerify={noopVerify} className="my-btn" />,
    );
    expect(html).toContain('class="my-btn"');
  });
});

describe('TimestampDownloadLinks', () => {
  const timestamp = { contentHash: 'abcd1234', otsProof: 'AAAA' };

  it('returns null when required data is missing', () => {
    const html = renderToStaticMarkup(
      // @ts-expect-error — deliberately incomplete data
      <TimestampDownloadLinks timestamp={{}} />,
    );
    expect(html).toBe('');
  });

  it('renders download buttons and the content hash, with no Tailwind', () => {
    const html = renderToStaticMarkup(<TimestampDownloadLinks timestamp={timestamp} />);
    expect(html).toContain('<button');
    expect(html).toContain('abcd1234');
    expect(html).toContain('opentimestamps.org');
    expectNoTailwind(html);
  });

  it('renders a compact variant with three icon buttons', () => {
    const html = renderToStaticMarkup(<TimestampDownloadLinks timestamp={timestamp} compact />);
    const buttonCount = (html.match(/<button/g) ?? []).length;
    expect(buttonCount).toBe(3);
    expectNoTailwind(html);
  });
});
