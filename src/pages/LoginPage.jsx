import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoadingSpinner from '../components/Common/LoadingSpinner';

const LoginPage = () => {
    const { user, loading } = useAuth();
    const navigate = useNavigate();
    const [authError, setAuthError] = useState(null);

    useEffect(() => {
        if (user) {
            navigate('/workflow-history');
        }
    }, [user, navigate]);

    useEffect(() => {
        if (!loading && !user) {
            setAuthError('Falha na autenticação automática. Por favor, certifique-se de que o arquivo .env no servidor possui credenciais válidas do DocuWare (DOCUWARE_USERNAME e DOCUWARE_PASSWORD).');
        }
    }, [loading, user]);

    return (
        <div className="min-h-screen bg-[#0a1e3f] flex flex-col items-center justify-center p-6 text-center">
            <div className="flex flex-col items-center gap-6 max-w-md">
                <img
                    src="/login-icon-v12.png"
                    alt="RCS Vision Icon"
                    className="w-auto h-24 object-contain drop-shadow-2xl mb-2"
                />
                <img
                    src="/login-text-v18.png"
                    alt="RCS Vision Text"
                    className="w-auto max-w-[80%] object-contain drop-shadow-2xl"
                />
                
                {authError ? (
                    <div className="mt-6 p-5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm max-w-md shadow-lg">
                        <p className="font-semibold mb-2">Erro de Configuração</p>
                        <p className="leading-relaxed">{authError}</p>
                    </div>
                ) : (
                    <div className="mt-8 flex flex-col items-center gap-3 text-gray-300">
                        <LoadingSpinner size="lg" color="white" />
                        <p className="text-sm font-light tracking-wide mt-2">Autenticando sessão com o DocuWare...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LoginPage;
