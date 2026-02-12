
import React from 'react';
import { Lock, User as UserIcon, ShieldAlert, Loader2, UserPlus, ArrowRight, ArrowLeft, Eye, EyeOff, Clock } from 'lucide-react';
import { dataService } from '../services/dataService';
import { UserRole } from '../types';

interface LoginProps {
  onLogin: (user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [name, setName] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return; 

    setLoading(true);
    setError('');
    
    const inputVal = username.trim();
    if (!inputVal) {
      setError('Informe um nome de usuário ou e-mail.');
      setLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        if (!name.trim()) throw new Error('Informe seu nome completo.');
        if (password.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres.');
        
        await dataService.createUser({
          name: name.trim(),
          username: inputVal,
          password,
          role: UserRole.ADMIN 
        });
        
        setIsRegistering(false);
        setPassword('');
        setError('Conta administrativa criada! Entre agora.');
      } else {
        const user = await dataService.signIn(inputVal, password);
        onLogin(user);
      }
    } catch (err: any) {
      const msg = err.message || '';
      console.error("[Login View Error]", err);
      
      if (msg.includes('limite') || msg.includes('rate limit')) {
        setError('Bloqueio Temporário: O servidor detectou muitas tentativas. Aguarde 15 minutos.');
      } else if (msg.includes('incorretos') || msg.includes('credentials')) {
        setError('Credenciais Inválidas: Verifique seu nome de usuário (ex: joao) e sua senha.');
      } else {
        setError(msg || 'Erro ao conectar. Tente novamente em instantes.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4 font-sans">
      <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-500">
        <div className="bg-slate-900 p-10 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-yellow-400"></div>
          <div className="w-20 h-20 bg-yellow-400 rounded-3xl rotate-6 flex items-center justify-center mx-auto mb-6 border-4 border-white shadow-2xl transform hover:rotate-0 transition-transform duration-300">
            <span className="text-3xl font-black text-slate-900">ID</span>
          </div>
          <h1 className="text-2xl font-black text-white tracking-tighter uppercase">Irmãos Dreon</h1>
          <p className="text-blue-400 text-[9px] font-black uppercase tracking-[0.2em] mt-2">
            {isRegistering ? 'Nova conta administrativa' : 'Plataforma de Performance'}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-10 space-y-5">
          {error && (
            <div className={`p-4 rounded-2xl text-[11px] border font-bold flex items-center gap-3 animate-in shake ${error.includes('sucesso') || error.includes('criada') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
              <ShieldAlert size={16} className="shrink-0" />
              <span className="flex-1 leading-relaxed">{error}</span>
            </div>
          )}
          
          {isRegistering && (
            <div className="space-y-1.5 animate-in slide-in-from-top-2">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome Completo</label>
              <input
                type="text"
                disabled={loading}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-700"
                placeholder="Ex: João Silva"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Usuário ou E-mail</label>
            <div className="relative">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type="text"
                disabled={loading}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-700"
                placeholder="admin ou joao"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Senha</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18} />
              <input
                type={showPassword ? "text" : "password"}
                disabled={loading}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-500/10 outline-none transition-all font-bold text-slate-700"
                placeholder="••••••••"
                required
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 hover:text-blue-500 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-[28px] shadow-2xl shadow-blue-900/40 transition-all active:scale-95 uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 group disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : isRegistering ? (
              <>Criar Acesso Admin <UserPlus size={16} /></>
            ) : (
              <>Entrar no Sistema <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" /></>
            )}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setPassword('');
            }}
            className="w-full py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
          >
            {isRegistering ? (
              <><ArrowLeft size={12} /> Já tenho uma conta</>
            ) : (
              <>Novo projeto? Cadastre-se como Administrador</>
            )}
          </button>
        </form>
        
        <div className="p-6 bg-slate-50 text-center text-[9px] text-slate-400 font-black uppercase tracking-widest border-t border-slate-100">
          &copy; Telemarketing Irmãos Dreon &bull; V.2.6.5
        </div>
      </div>
    </div>
  );
};

export default Login;
