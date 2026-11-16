import { useEffect, useState } from 'react';
import type { Accent, BrowserList, Lang, Settings, ThemeSetting } from '../../shared/types';
import { dictionaries } from '../i18n';
import { ClaudeConnection } from './ClaudeConnection';
import { Icon } from './Icons';

export const ACCENT_HEX: Record<Accent, string> = { lime: '#C9F45B', orange: '#FF8A3D', violet: '#9085E9', cyan: '#4FD1E0' };

const PREVIEW: Record<'dark' | 'light', { bg: string; side: string; card: string; line: string }> = {
  dark: { bg: '#0A0C10', side: '#0D1015', card: '#161A22', line: '#2A303C' },
  light: { bg: '#F4F5F7', side: '#FFFFFF', card: '#FFFFFF', line: '#D3D8E0' },
};

function ThemePreview({ mode, accent }: { mode: 'dark' | 'light'; accent: string }) {
  const c = PREVIEW[mode];
  return (
    <span className="theme-preview" style={{ background: c.bg, borderColor: c.line }} aria-hidden="true">
      <span className="side" style={{ background: c.side, borderRight: `1px solid ${c.line}` }}>
        <i style={{ height: 6, width: '70%', background: c.line }} />
        <i style={{ height: 14, background: c.card, border: `1px solid ${c.line}` }} />
        <i style={{ height: 14, background: c.card, border: `1px solid ${c.line}` }} />
        <i style={{ height: 8, width: '40%', background: accent, marginTop: 'auto' }} />
      </span>
      <span className="main">
        <i style={{ background: c.card, border: `1px solid ${c.line}` }} />
        <i style={{ background: c.card, border: `1px solid ${c.line}` }} />
        <i style={{ gridColumn: 'span 2', background: c.card, border: `1px solid ${c.line}`, position: 'relative' }}>
          <i style={{ position: 'absolute', left: 6, bottom: 6, width: '45%', height: 4, background: '#3987E5' }} />
        </i>
      </span>
    </span>
  );
}

const STEPS = 5;

/** İlk açılış: dil → tema → vurgu rengi → Claude bağlantısı → hazır */
export function Onboarding({ settings, onChange, onDone }: { settings: Settings; onChange: (patch: Partial<Settings>) => void; onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [browsers, setBrowsers] = useState<BrowserList | null>(null);
  const t = dictionaries[settings.lang];

  useEffect(() => {
    if (step === STEPS - 1 && !browsers) void window.marai.browsers.list().then(setBrowsers);
  }, [step, browsers]);
  const o = t.onboarding;
  const accentHex = ACCENT_HEX[settings.accent];

  const next = () => (step < STEPS - 1 ? setStep(step + 1) : onDone());

  return (
    <div className="onb">
      <div className="onb-card" role="dialog" aria-modal="true" aria-label={o.welcomeTitle}>
        <div className="onb-top">
          <div className="brand">
            <Icon.Logo size={34} />
            <span className="brand-name">mar-ai</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="faint" style={{ fontSize: 12.5 }}>
              {o.step(step + 1, STEPS)}
            </span>
            <div className="progress" aria-hidden="true">
              {Array.from({ length: STEPS }, (_, i) => (
                <span key={i} data-on={i <= step} data-current={i === step} />
              ))}
            </div>
          </div>
        </div>

        {step === 0 && (
          <>
            <div>
              <h1>{o.welcomeTitle}</h1>
              <p className="onb-lead">{o.welcomeBody}</p>
            </div>
            <div>
              <h2 style={{ fontSize: 16, marginBottom: 12 }}>{o.langQ}</h2>
              <div className="choice-grid">
                {(
                  [
                    ['tr', 'Türkçe', 'Arayüz ve yanıtlar Türkçe'],
                    ['en', 'English', 'Interface and answers in English'],
                  ] as Array<[Lang, string, string]>
                ).map(([code, label, desc]) => (
                  <button key={code} type="button" className="choice" aria-pressed={settings.lang === code} onClick={() => onChange({ lang: code })}>
                    <span className="title">
                      <Icon.Globe size={16} />
                      {label}
                    </span>
                    <span className="desc">{desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <div>
            <h1>{o.themeQ}</h1>
            <div className="choice-grid" style={{ marginTop: 18 }}>
              {(['dark', 'light', 'system'] as ThemeSetting[]).map((th) => (
                <button key={th} type="button" className="choice" aria-pressed={settings.theme === th} onClick={() => onChange({ theme: th })}>
                  {th === 'system' ? (
                    <span style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, width: '100%' }}>
                      <ThemePreview mode="dark" accent={accentHex} />
                      <ThemePreview mode="light" accent={accentHex} />
                    </span>
                  ) : (
                    <ThemePreview mode={th} accent={accentHex} />
                  )}
                  <span className="title">
                    {th === 'dark' ? <Icon.Moon size={15} /> : th === 'light' ? <Icon.Sun size={15} /> : <Icon.Monitor size={15} />}
                    {t.theme[th]}
                  </span>
                  <span className="desc">{t.themeDesc[th]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1>{o.accentQ}</h1>
            <p className="onb-lead">{o.accentHint}</p>
            <div className="choice-grid" style={{ marginTop: 18 }}>
              {(Object.keys(ACCENT_HEX) as Accent[]).map((a) => (
                <button key={a} type="button" className="choice" aria-pressed={settings.accent === a} onClick={() => onChange({ accent: a })}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: ACCENT_HEX[a] }} />
                    <span className="title">{t.accents[a]}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h1>{o.claudeQ}</h1>
              <p className="onb-lead">{o.claudeBody}</p>
            </div>
            <ClaudeConnection />
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h1>{o.doneTitle}</h1>
              <p className="onb-lead">{o.doneBody}</p>
            </div>
            <div className="status-row">
              <span>{t.browserSection.engineLabel}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
                <span className={`dot ${!browsers ? 'dot-idle' : browsers.active ? 'dot-good' : 'dot-bad'}`} />
                {!browsers ? '…' : (browsers.active?.name ?? t.browserSection.none)}
              </span>
            </div>
          </div>
        )}

        <div className="onb-actions">
          {step > 0 ? (
            <button type="button" className="btn btn-ghost" onClick={() => setStep(step - 1)}>
              {o.back}
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            {step === 3 && (
              <button type="button" className="btn btn-ghost" onClick={next}>
                {o.skip}
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={next}>
              {step === STEPS - 1 ? o.start : o.next}
              <Icon.ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
