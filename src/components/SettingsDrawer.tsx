import { useEffect, useState } from 'react';
import type { Accent, AppInfo, BrowserList, McpInfo, Settings, ThemeSetting, UpdateStatus } from '../../shared/types';
import { useT } from '../i18n';
import { ClaudeConnection } from './ClaudeConnection';
import { Icon } from './Icons';
import { ACCENT_HEX } from './Onboarding';

const MODELS = ['', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

const CUSTOM = '__custom__';

/** Araştırma tarayıcısı seçimi: otomatik, bulunan tarayıcılardan biri ya da özel yol */
function BrowserPicker({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const t = useT();
  const [list, setList] = useState<BrowserList | null>(null);
  const [customMode, setCustomMode] = useState(false);
  const [custom, setCustom] = useState(settings.browserPath);

  useEffect(() => {
    void window.marai.browsers.list().then((l) => {
      setList(l);
      setCustomMode(!!settings.browserPath && !l.detected.some((b) => b.path === settings.browserPath));
    });
  }, [settings.browserPath]);

  const autoName = list?.detected[0]?.name ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="field">
        <label htmlFor="browser-select">{t.browserSection.engineLabel}</label>
        <select
          id="browser-select"
          className="input"
          value={customMode ? CUSTOM : settings.browserPath}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) {
              setCustomMode(true);
              return;
            }
            setCustomMode(false);
            onChange({ browserPath: v });
          }}
        >
          <option value="">{t.browserSection.auto(autoName)}</option>
          {list?.detected.map((b) => (
            <option key={b.path} value={b.path}>
              {b.name}
            </option>
          ))}
          <option value={CUSTOM}>{t.browserSection.custom}</option>
        </select>
      </div>
      {customMode && (
        <div className="field">
          <label htmlFor="browser-path">{t.browserSection.customLabel}</label>
          <input
            id="browser-path"
            className="input"
            value={custom}
            placeholder="C:\\Users\\...\\AppData\\Local\\Programs\\Opera\\opera.exe"
            onChange={(e) => setCustom(e.target.value)}
            onBlur={() => custom.trim() !== settings.browserPath && onChange({ browserPath: custom.trim() })}
          />
        </div>
      )}
      {list &&
        (list.active ? (
          <div className="notice ok" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span>
              {t.browserSection.inUse}: <strong>{list.active.name}</strong>
            </span>
            <span className="mono faint" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
              {list.active.path}
            </span>
          </div>
        ) : (
          <div className="notice bad">{t.browserSection.none}</div>
        ))}
      {list?.preferredMissing && <div className="notice bad">{t.browserSection.missing}</div>}
      <div className="faint" style={{ fontSize: 12.5 }}>
        {t.browserSection.hint}
      </div>
    </div>
  );
}

export function SettingsDrawer({ settings, onChange, onClose, mcps, update }: { settings: Settings; onChange: (patch: Partial<Settings>) => void; onClose: () => void; mcps: McpInfo[]; update: UpdateStatus }) {
  const t = useT();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [claudePath, setClaudePath] = useState(settings.claudePath);

  useEffect(() => {
    void window.marai.app.info().then(setInfo);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const updateText = (() => {
    switch (update.state) {
      case 'available':
        return t.update.available(update.version);
      case 'downloading':
        return t.update.downloading(update.version, update.percent);
      case 'ready':
        return t.update.ready(update.version);
      case 'error':
        return `${t.update.error}: ${update.message}`;
      case 'checking':
        return t.update.checking;
      case 'none':
        return t.update.none;
      case 'dev':
        return t.update.dev;
      default:
        return '';
    }
  })();

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={t.settings}>
        <div className="drawer-head">
          <h2>{t.settings}</h2>
          <button type="button" className="btn btn-icon btn-ghost" aria-label={t.close} onClick={onClose}>
            <Icon.X size={18} />
          </button>
        </div>
        <div className="drawer-body">
          <section className="set-section">
            <h3>{t.settingsSections.appearance}</h3>
            <div className="set-row">
              <span className="set-label">{t.themeLabel}</span>
              <Segmented<ThemeSetting>
                label="theme"
                value={settings.theme}
                onChange={(v) => onChange({ theme: v })}
                options={[
                  ['dark', t.theme.dark],
                  ['light', t.theme.light],
                  ['system', t.theme.system],
                ]}
              />
            </div>
            <div className="set-row">
              <span className="set-label">{t.onboarding.accentQ}</span>
              <div className="swatches">
                {(Object.keys(ACCENT_HEX) as Accent[]).map((a) => (
                  <button key={a} type="button" className="swatch" aria-pressed={settings.accent === a} aria-label={t.accents[a]} title={t.accents[a]} onClick={() => onChange({ accent: a })}>
                    <span style={{ background: ACCENT_HEX[a] }} />
                  </button>
                ))}
              </div>
            </div>
            <div className="set-row">
              <span className="set-label">{t.density}</span>
              <Segmented
                label={t.density}
                value={settings.density}
                onChange={(v) => onChange({ density: v })}
                options={[
                  ['comfortable', t.densityOpts.comfortable],
                  ['compact', t.densityOpts.compact],
                ]}
              />
            </div>
            <div className="set-row">
              <span className="set-label">{t.chatSide}</span>
              <Segmented
                label={t.chatSide}
                value={settings.chatSide}
                onChange={(v) => onChange({ chatSide: v })}
                options={[
                  ['left', t.chatSideOpts.left],
                  ['right', t.chatSideOpts.right],
                ]}
              />
            </div>
            <div className="set-row">
              <span className="set-label faint" style={{ fontSize: 12.5 }}>
                {t.dragToResize}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => onChange({ chatWidth: 400 })}>
                {t.resetLayout}
              </button>
            </div>
          </section>

          <section className="set-section">
            <h3>{t.settingsSections.language}</h3>
            <Segmented
              label={t.settingsSections.language}
              value={settings.lang}
              onChange={(v) => onChange({ lang: v })}
              options={[
                ['tr', 'Türkçe'],
                ['en', 'English'],
              ]}
            />
          </section>

          <section className="set-section">
            <h3>{t.settingsSections.claude}</h3>
            <ClaudeConnection compact />
            <div className="field">
              <label htmlFor="model-select">{t.claude.model}</label>
              <select id="model-select" className="input" value={settings.model} onChange={(e) => onChange({ model: e.target.value })}>
                {MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m || t.claude.modelAuto}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="claude-path">{t.claude.customPath}</label>
              <input
                id="claude-path"
                className="input"
                value={claudePath}
                placeholder="C:\\Users\\...\\claude.exe"
                onChange={(e) => setClaudePath(e.target.value)}
                onBlur={() => claudePath !== settings.claudePath && onChange({ claudePath: claudePath.trim() })}
              />
            </div>
          </section>

          <section className="set-section">
            <h3>{t.settingsSections.browser}</h3>
            <BrowserPicker settings={settings} onChange={onChange} />
            <div className="set-row" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{t.browserMode}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {t.browserModeDesc}
                </div>
              </div>
              <Switch checked={settings.browserVisible} onChange={(v) => onChange({ browserVisible: v })} label={t.browserMode} />
            </div>
          </section>

          <section className="set-section">
            <h3>{t.settingsSections.tools}</h3>
            <div>
              {mcps.map((m) => (
                <div className="mcp-row" key={m.id}>
                  <div className="info">
                    <div className="name">
                      {m.name}
                      <span className="pill">{m.origin === 'builtin' ? t.builtin : t.userMcp}</span>
                      <span className="faint mono" style={{ fontSize: 11.5 }}>
                        v{m.version}
                      </span>
                    </div>
                    <div className="desc">{m.description}</div>
                    {m.sources.length > 0 && (
                      <div className="faint" style={{ fontSize: 12, marginTop: 4 }}>
                        {t.sources}: {m.sources.join(' · ')}
                      </div>
                    )}
                  </div>
                  <Switch
                    checked={m.enabled}
                    label={m.name}
                    onChange={(v) =>
                      onChange({ disabledMcps: v ? settings.disabledMcps.filter((x) => x !== m.id) : [...settings.disabledMcps, m.id] })
                    }
                  />
                </div>
              ))}
            </div>
            <div className="notice">{t.mcpFolderHint}</div>
            <button type="button" className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => void window.marai.mcp.openFolder()}>
              <Icon.Folder size={16} />
              {t.openMcpFolder}
            </button>
          </section>

          <section className="set-section">
            <h3>{t.settingsSections.about}</h3>
            <div className="set-row">
              <span className="set-label">
                {t.version}: <strong>{info?.version ?? '…'}</strong>
              </span>
              {update.state === 'ready' ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => void window.marai.update.install()}>
                  {t.update.install}
                </button>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => void window.marai.update.check()}>
                  {t.checkUpdates}
                </button>
              )}
            </div>
            {updateText && <div className="muted" style={{ fontSize: 13 }}>{updateText}</div>}
            {info && (
              <div className="faint mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>
                {info.dataDir}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
