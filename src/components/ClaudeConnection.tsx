import { useCallback, useEffect, useState } from 'react';
import type { ClaudeCheck, ConnectionTest } from '../../shared/types';
import { useT } from '../i18n';
import { Icon } from './Icons';

/** Claude motoru ve oturum durumu; resmi Claude Code penceresinde giriş ve bağlantı testi. */
export function ClaudeConnection({ compact = false }: { compact?: boolean }) {
  const t = useT();
  const [check, setCheck] = useState<ClaudeCheck | null>(null);
  const [loginMsg, setLoginMsg] = useState('');
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<ConnectionTest | null>(null);

  const refresh = useCallback(async () => {
    setCheck(null);
    setCheck(await window.marai.claude.check());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sessionOk = !!check && (check.credentialsFound || check.apiKeyEnv);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="status-list">
        <div className="status-row">
          <span>{t.claude.engine}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
            <span className={`dot ${!check ? 'dot-idle' : check.binaryFound ? 'dot-good' : 'dot-bad'}`} />
            {!check ? '…' : check.binaryFound ? t.claude.engineOk(check.version ?? '?') : t.claude.engineMissing}
          </span>
        </div>
        <div className="status-row">
          <span>{t.claude.session}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-3)' }}>
            <span className={`dot ${!check ? 'dot-idle' : sessionOk ? 'dot-good' : 'dot-warn'}`} />
            {!check ? '…' : check.apiKeyEnv ? t.claude.apiKeyEnv : check.credentialsFound ? t.claude.sessionOk : t.claude.sessionMissing}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {check && !sessionOk && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const r = await window.marai.claude.login();
              setLoginMsg(r.opened === 'terminal' ? t.claude.loginOpened : t.claude.loginDocs);
            }}
          >
            {t.claude.login}
          </button>
        )}
        <button type="button" className="btn" onClick={() => void refresh()}>
          {t.claude.recheck}
        </button>
        <button
          type="button"
          className="btn"
          disabled={testing || !check?.binaryFound}
          onClick={async () => {
            setTesting(true);
            setTest(null);
            setTest(await window.marai.claude.test());
            setTesting(false);
          }}
        >
          {testing ? t.claude.testing : t.claude.test}
        </button>
      </div>

      {loginMsg && <div className="notice">{loginMsg}</div>}
      {test && (
        <div className={`notice ${test.ok ? 'ok' : 'bad'}`} role="status">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {test.ok ? <Icon.Check size={14} /> : <Icon.Alert size={14} />}
            {test.ok ? t.claude.testOk(test.model ?? '?') : `${t.claude.testFail}: ${(test.errorCode && t.errors[test.errorCode]) || test.error || ''}`}
          </span>
        </div>
      )}
      {!compact && <div className="faint" style={{ fontSize: 12.5 }}>{t.onboarding.claudePrivacy}</div>}
    </div>
  );
}
