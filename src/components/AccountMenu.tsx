import { useState } from 'react';
import { useAuth, authErrorMessage } from '../lib/auth';
import { useLang } from '../lib/i18n';
import { Modal } from './Modal';

export function AccountMenu() {
  const { user, loading, login, register, logout, pushTeams, pullTeams } = useAuth();
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (loading) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (mode === 'login') await login(loginId.trim(), password);
      else await register(email.trim(), username.trim(), password);
      setOpen(false); setPassword('');
    } catch (err) {
      setError(t(authErrorMessage(err instanceof Error ? err.message : '')));
    } finally { setBusy(false); }
  };

  const doPush = async () => {
    setBusy(true); setNote(null); setError(null);
    try { await pushTeams(); setNote(t('Guardado en la nube (equipos y repeticiones).')); }
    catch { setError(t('No se pudo guardar en la nube.')); }
    finally { setBusy(false); }
  };
  const doPull = async () => {
    if (!confirm(t('Esto reemplazará tus equipos locales por los de la nube. ¿Continuar?'))) return;
    setBusy(true); setError(null);
    try { await pullTeams(); } catch { setError(t('No se pudo cargar de la nube.')); setBusy(false); }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setError(null); setNote(null); }}
        className="w-full px-3 py-2 rounded-lg text-sm font-medium border border-poke-accent text-gray-200 hover:bg-poke-accent/40 hover:border-poke-pink/60 transition-all duration-150 active:scale-95 inline-flex items-center justify-center gap-2 truncate"
        title={user ? user.email : t('Iniciar sesión')}
      >
        {user ? (user.username ?? user.email.split('@')[0]) : t('Entrar')}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title={user ? t('Mi cuenta') : mode === 'login' ? t('Iniciar sesión') : t('Crear cuenta')}>
        {user ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-300">{t('Sesión iniciada como')} <span className="text-poke-pink">{user.username ?? user.email}</span></p>
            {user.username && <p className="text-xs text-gray-500 -mt-2">{user.email}</p>}
            <p className="text-xs text-gray-400">{t('Guarda tus equipos y repeticiones en la nube para tenerlos en cualquier dispositivo.')}</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={doPush} disabled={busy} className="btn-primary py-2 disabled:opacity-50">☁⬆ {t('Guardar en la nube')}</button>
              <button type="button" onClick={doPull} disabled={busy} className="btn-secondary py-2 disabled:opacity-50">☁⬇ {t('Cargar de la nube')}</button>
            </div>
            {note && <p className="text-sm text-green-400">{note}</p>}
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="button" onClick={async () => { await logout(); setOpen(false); }} className="w-full mt-2 py-2 rounded-lg border border-red-700/50 text-red-400 text-sm hover:bg-red-900/30 transition-colors">
              {t('Cerrar sesión')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {mode === 'register' ? (
              <>
                <label className="block">
                  <span className="text-xs text-gray-400 uppercase">{t('Nombre de usuario')}</span>
                  <input type="text" autoFocus required minLength={3} maxLength={20} pattern="[a-zA-Z0-9_-]{3,20}" className="input-field mt-1" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="usuario" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-400 uppercase">{t('Correo')}</span>
                  <input type="email" required className="input-field mt-1" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
                </label>
              </>
            ) : (
              <label className="block">
                <span className="text-xs text-gray-400 uppercase">{t('Usuario o correo')}</span>
                <input type="text" autoFocus required className="input-field mt-1" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder={t('usuario o tu@correo.com')} />
              </label>
            )}
            <label className="block">
              <span className="text-xs text-gray-400 uppercase">{t('Contraseña')}</span>
              <input type="password" required minLength={8} className="input-field mt-1" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={busy} className="btn-primary w-full py-2 disabled:opacity-50">
              {busy ? t('Cargando…') : mode === 'login' ? t('Iniciar sesión') : t('Crear cuenta')}
            </button>
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }} className="w-full text-xs text-gray-400 hover:text-poke-pink transition-colors">
              {mode === 'login' ? t('¿No tienes cuenta? Regístrate') : t('¿Ya tienes cuenta? Inicia sesión')}
            </button>
          </form>
        )}
      </Modal>
    </>
  );
}
